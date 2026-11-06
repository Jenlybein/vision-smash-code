/**
 * 配置刷新的纯函数接缝：把"配置快照 + 变更意图"算成"要写什么文件、下一份 import 列表是什么"。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * 1. **纯函数**：相同输入必得相同输出；不产生任何副作用；不 import `vscode`，不 import `fs`，
 *    不读时钟、不读环境变量、不写盘。所有 I/O 能力都从参数注入。
 * 2. **不抛异常**：任何失败（资产缺失、不支持的渲染方式等）都体现为 `errors` 条目，
 *    绝不抛出，也绝不返回 `undefined`。返回值四个字段恒存在，可以是空数组。
 * 3. `readText` 是注入的读取能力：`(path: string) => string | null`。
 *    - 返回值是文件文本；返回 `null`（或任何非字符串）表示文件缺失。
 *    - 缺失不会中断其余计算，但会让所属效果整条失败（见第 8 条）。
 *    - 本工单只读取 CSS 资产文件；标记块式渲染落地后还会读取目标文件以做幂等替换。
 *    - 调用次数上限约为"已启用片段数"（目标文件读取落地后为"效果数 + 已启用片段数"），
 *      每次读取的文件都很小，这是可接受的性能特征。
 * 4. `writes` 是"**写什么**"，不是"去写"：它是 `{ path, content }` 数组，`content` 是文件的
 *    完整内容。真正写盘是调用方的责任；本函数不关心写入成功与否。
 * 5. `imports` 是下一份 `vscode_custom_css.imports` 列表。**本工单为直通**：原样返回
 *    `currentImports`（同值，浅拷贝）。真正的导入规划（新增/移除、去重、URI 形式转换、
 *    文件存在性判断）是 #12 的职责，此处不要误认为已经实现。
 * 6. `changeStates` 是 `{ [effectKey]: "none" | "reload" | "switch" }` 的变更意图快照。
 *    **本工单只是占位**：接收但完全不参与内容生成。它的用途留给 #12——由它把
 *    "某个效果发生了哪种变更"换算成 import 路径的增删，并结算下一轮状态。
 * 7. `notices` 是给使用者的提示文案，本工单恒为空数组；文案与展示时机由调用方决定，
 *    核心逻辑不依赖 UI。
 * 8. 失败的效果**不产生 `writes` 条目**。例如渐变效果依赖多个 CSS 片段，只要有一个
 *    片段缺失，整条效果就不写盘（避免写出残缺样式表把文件写坏），并在 `errors` 中报告。
 *    显式关闭所有片段是合法状态，此时会写入空内容（目标文件被清空）。
 *
 * ## 效果描述符（`effects` 的元素）
 *
 * 描述符是**数据**，不含函数；`kind` 是渲染方式判别字段：
 *
 * - `kind: "css-concat"`（**本工单实现**）
 *   ```
 *   {
 *     key,          // string，与 changeStates 的键一致；也是错误信息里标识效果的依据
 *     kind,         // "css-concat"
 *     targetPath,   // string，效果要写入的目标文件
 *     settings,     // object，该效果作用域的配置快照（{ [settingKey]: unknown }）
 *     segments,     // [{ setting, path }]，数组顺序即拼接顺序
 *   }
 *   ```
 *   片段选取语义（与重构前 `gradient-inject.js` 逐字节等价）：
 *   `settings[segment.setting] !== false` —— **未设置（`undefined`）视为开启**，
 *   只有显式 `false` 才排除该片段。片段内容直接首尾相接，不插入任何分隔符。
 *
 * - `kind: "marker-block"`（**本工单不实现**，仅为后续迁移预留）
 *   形态：在 `targetPath` 中定位起止标记，把标记块整块替换成（或首次插入）渲染出的配置块。
 *   预期字段：`{ key, kind, targetPath, markers: { start, end }, ... }`，
 *   具体载荷（变量名、配置对象、块格式）由迁移该效果的那张工单决定。
 *   本工单遇到该 kind 时**不写盘**，只返回一条"尚不支持"的 `errors` 条目——
 *   宁可显式失败，也不要静默跳过或写半成品逻辑。
 *
 * @param {{
 *   effects?: Array<object>,
 *   changeStates?: Record<string, "none" | "reload" | "switch">,
 *   currentImports?: string[],
 *   readText: (path: string) => string | null,
 * }} input
 * @returns {{
 *   writes: Array<{ path: string, content: string }>,
 *   imports: string[],
 *   notices: string[],
 *   errors: Array<{ path?: string, message: string }>,
 * }}
 */
export function planRefresh({
  effects = [],
  changeStates: _changeStates = {},
  currentImports = [],
  readText,
}) {
  const writes = [];
  const errors = [];

  for (const effect of effects) {
    const rendered = renderEffect(effect, readText);
    if (!rendered.ok) {
      errors.push(...rendered.errors);
      continue;
    }
    writes.push({ path: effect.targetPath, content: rendered.content });
  }

  return {
    writes,
    imports: [...currentImports],
    notices: [],
    errors,
  };
}

/**
 * 按 `kind` 分派渲染。新增渲染方式 = 在这里加一个分支，调用方与 Interface 不变。
 *
 * `marker-block` 尚未迁移，因此落入 default：显式报错而不是静默跳过，
 * 避免后续迁移者误以为它已经工作。
 *
 * @returns {{ ok: true, content: string, errors: [] } |
 *           { ok: false, errors: Array<{ path?: string, message: string }> }}
 */
function renderEffect(effect, readText) {
  switch (effect.kind) {
    case "css-concat":
      return renderCssConcat(effect, readText);
    default:
      return {
        ok: false,
        errors: [
          {
            path: effect.targetPath,
            message: `尚未支持的渲染方式：${effect.kind}（效果 ${effect.key}）`,
          },
        ],
      };
  }
}

/**
 * 拼接式渲染：按开关选取若干 CSS 片段，首尾相接。
 *
 * 选取语义与重构前 `gradient-inject.js` 逐字节等价：
 * `settings[segment.setting] !== false` —— 未设置（`undefined`）视为开启，
 * 只有显式 `false` 才排除该片段。片段之间不插入任何分隔符。
 *
 * @returns {{ ok: true, content: string, errors: [] } |
 *           { ok: false, errors: Array<{ path?: string, message: string }> }}
 */
function renderCssConcat(effect, readText) {
  const settings = effect.settings ?? {};
  const segments = effect.segments ?? [];
  const errors = [];
  let content = "";

  for (const segment of segments) {
    // 与重构前 `if (setting !== false)` 逐字节等价：未设置（undefined）也算开启。
    if (settings[segment.setting] === false) continue;

    const text = readText(segment.path);
    if (typeof text !== "string") {
      // 文件缺失：不抛异常，记为错误项，并让整条效果失败（其余片段继续读取，
      // 以便一次性报出所有缺失文件）。
      errors.push({
        path: segment.path,
        message: `无法读取 CSS 资产文件：${segment.path}`,
      });
      continue;
    }

    content += text;
  }

  // 失败的效果不产生写入：宁可什么都不写，也不写出残缺样式表。
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, content, errors };
}
