import { basenameKey, removeByBasename } from "./import-paths.js";

/**
 * 配置刷新的纯函数接缝：把"配置快照 + 变更意图"算成
 * "要写什么文件、要注入哪些路径、下一轮变更状态是什么"。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * ### 纯性与错误模式
 *
 * 1. **纯函数**：相同输入必得相同输出；不产生任何副作用；不 import `vscode`、不 import `fs`，
 *    不读时钟、不读环境变量、不写盘。一切 I/O 能力都从参数注入。
 * 2. **不抛异常，也绝不返回 `undefined`**：任何失败（目标文件缺失、资产片段缺失、
 *    注入能力缺失）都体现为 `errors` 条目。返回值五个字段恒存在，可以是空数组 / 空对象。
 * 3. 输出是**计划**，不是**执行**：
 *    - `writes` 是"写什么"（`{ path, content }`，`content` 是目标文件的完整内容），不是"去写"；
 *      真正写盘是调用方的责任，本函数不关心写入成功与否。
 *    - `imports` 是**下一份导入列表的完整值**：调用方整份写回配置即可，不要自己再增删。
 *    - `notices` / `errors` 只是文案；何时展示、用哪个 API 展示由调用方决定。
 *
 * ### 注入的 I/O 能力（可选提供，缺失时的表现见第 5、6 条）
 *
 * 4. `readText(path) => string | null`：读取文件文本。
 *    - 返回 `null`（或任何非字符串）表示文件缺失。函数本身不抛异常，缺失记入 `errors`。
 *    - 缺失会让**所属效果整条内容生成失败**（见第 10 条），但不中断其他效果的计算。
 *    - 只在效果声明了 `kind` 时才会被调用；只读不写。
 *    - 调用次数上限约为"已启用片段数"（标记块式渲染落地后为"效果数 + 已启用片段数"），
 *      每次读到的文件都很小，这是可接受的性能特征。
 * 5. `fileExists(path) => boolean`：**同步**判断本地路径是否存在。
 *    - 只在需要**新增**导入项时调用（每轮调用次数 ≤ 新增路径数）；不需要新增时可以省略。
 *    - 必须返回 `true` 才算存在；`false` / `undefined` / Promise / 抛出异常一律按"不存在"处理：
 *      该条不加入 `imports`，`errors` 中留下一条"找不到配置文件"（文案与重构前一致）。
 * 6. `toImportUri(path) => string`：把本地路径转成注入用的 URI 形式
 *    （生产实现是 `vscode.Uri.file(path).toString()`）。
 *    - 返回非字符串 / 空字符串 / 抛出异常一律视为转换失败：该条不加入，`errors` 中有条目。
 *    - 与第 5 条一样，只在需要新增导入项时调用；缺失时该条不加入并记一条错误。
 *    - 由此保证：**`imports` 在任何情况下都只含非空字符串**。
 *
 * ### 输出字段
 *
 * 7. `imports: string[]`：下一份 `vscode_custom_css.imports`。语义与重构前
 *    `flushChanges` + `RemovePaths` / `AddPaths` 的组合同值：
 *    - 状态 `switch`：启用 → 加入；未启用 → 按 basename（**忽略大小写**）移除；
 *    - 状态 `reload`：**仅当启用时**先移除再加入（重新落到列表末尾，这是触发重载的关键）；
 *    - 状态 `none`：不动；
 *    - 顺序：先移除（移除集合 = 要移除的 + **要新增的**，等价于重构前的
 *      `removePaths.concat(addPaths)`），再按效果顺序把新增项追加到末尾；
 *    - 去重：同一份文件（basename 相同，忽略大小写）只保留一条，重复路径不产生重复条目；
 *    - `targetPath` 为空（效果尚未初始化）→ 整条跳过，既不增也不删；
 *    - 文件缺失 / URI 转换失败 / 注入能力缺失 → 该条不加入并记错误，
 *      **绝不让 `undefined` 或非字符串值流向"写全局配置"那一步**（本模块修掉的缺陷）。
 * 8. `nextChangeStates: Record<string, "none">`：结算后的新状态表。键集合与输入的
 *    `changeStates` 完全相同，值**全部为 `none`**——本轮已结算完毕，调用方整表替换即可。
 *    被跳过的效果（未启用、`targetPath` 为空、状态本来就是 `none`）同样归 `none`。
 * 9. `errors: Array<{ path?: string, message: string }>`；`notices: string[]` 当前恒为空：
 *    使用者可见的"修改成功"提示由执行层自己决定，核心逻辑不依赖 UI。
 * 10. 内容生成与导入规划**互不阻塞**：内容生成失败的效果不会因此被排除出导入规划
 *    （与重构前一致——`StyleConfigUpdate` 与 `flushChanges` 本来就各管一件），反之亦然。
 *    内容生成失败的效果不产生 `writes` 条目（宁可什么都不写，也不写残缺样式表），
 *    但"全部片段显式关闭"是合法状态，此时会写入空内容。
 *
 * ## 效果描述符（`effects` 的元素）
 *
 * 描述符是**数据**，不含函数：
 *
 * ```
 * {
 *   key,        // string，与 changeStates 的键一致；错误信息也用它标识效果
 *   targetPath, // string，该效果的目标文件（本地绝对路径），同时就是要注入的路径
 *   enabled,    // boolean，来自 visionSmashCode.base.<key>；只有 true 视为启用，
 *               //   undefined（配置未设置）按未启用处理，与重构前 `if (enabled)` 一致
 *   kind,       // 可选：渲染方式。省略（undefined / null）= 本轮不参与内容生成
 *   ...         // kind 决定的渲染载荷，见下
 * }
 * ```
 *
 * - `kind: "css-concat"`：按开关拼接若干 CSS 片段。
 *   ```
 *   { settings: { [settingKey]: unknown }, segments: [{ setting, path }] }
 *   ```
 *   片段选取语义（与重构前 `gradient-inject.js` 逐字节等价）：
 *   `settings[segment.setting] !== false` —— 未设置（`undefined`）视为开启，
 *   只有显式 `false` 才排除该片段。片段内容直接首尾相接，不插入任何分隔符。
 * - `kind: "marker-block"`：在 `targetPath` 里定位起止标记并整块替换。
 *   ```
 *   { markers: { start, end }, variableName, config }
 *   ```
 *   - 生成形状：`<start>\nconst <variableName> = <config 的两空格缩进 JSON>;\n<end>`。
 *   - `markers.start` / `markers.end` 按**字面量**匹配（内部转义正则元字符）；标记文本
 *     自带注释定界符，由调用方决定。
 *   - 标记存在 → 整块替换；不存在 → 整块插入到文件头，后跟两个换行再接原文。
 *   - 只替换**第一处**标记块：文件里出现两处时第二处原样保留（与迁移前的非全局正则一致）。
 *   - 目标文件缺失（`readText` 返回 `null`）→ `errors` 一条、不写盘、不抛异常。
 *   - 描述符缺字段 → `errors` 一条，且不读取目标文件。
 * - `kind` 省略（`undefined` / `null`）：不产生 `writes`、不报错。这是执行层的显式用法：
 *   `flushChanges` 只做导入规划，内容写入仍归各效果自己的 `StyleConfigUpdate`。
 *
 * @param {{
 *   effects?: Array<object>,
 *   changeStates?: Record<string, "none" | "reload" | "switch">,
 *   currentImports?: string[],
 *   readText?: (path: string) => string | null,
 *   fileExists?: (path: string) => boolean,
 *   toImportUri?: (path: string) => string,
 * }} input
 * @returns {{
 *   writes: Array<{ path: string, content: string }>,
 *   imports: string[],
 *   notices: string[],
 *   errors: Array<{ path?: string, message: string }>,
 *   nextChangeStates: Record<string, "none">,
 * }}
 */
export function planRefresh({
  effects = [],
  changeStates = {},
  currentImports = [],
  readText,
  fileExists,
  toImportUri,
}) {
  const writes = [];
  const errors = [];

  for (const effect of effects) {
    // 省略 `kind` = 该效果本轮不参与内容生成（内容仍由它自己的注入模块写入）。
    // 这是显式契约，不是遗漏：导入规划与内容生成是两件事，执行层可以只要前者。
    if (effect.kind === undefined || effect.kind === null) continue;

    const rendered = renderEffect(effect, readText);
    if (!rendered.ok) {
      errors.push(...rendered.errors);
      continue;
    }
    writes.push({ path: effect.targetPath, content: rendered.content });
  }

  const planned = planImports({
    effects,
    changeStates,
    currentImports,
    fileExists,
    toImportUri,
  });
  errors.push(...planned.errors);

  // 结算：状态表的键集合原样保留，值全部回到 `none`。
  // 注：重构前的 flushChanges 在 `targetPath` 为空时 `continue`，连 `changeMap[key] = "none"`
  // 都一起跳过了；这里统一结算为 none。该路径只可能在 init 之前出现，状态表残留反而会让
  // 下一轮误触发，因此把它收敛成"结算后全部归 none"这一条可陈述的语义。
  const nextChangeStates = Object.fromEntries(
    Object.keys(changeStates).map((key) => [key, "none"]),
  );

  return {
    writes,
    imports: planned.imports,
    notices: [],
    errors,
    nextChangeStates,
  };
}

/**
 * 导入规划：把"每个效果发生了哪种变更 + 是否启用"换算成下一份导入列表。
 *
 * 逐条对应重构前 `flushChanges` 的状态推导 + `RemovePaths` / `AddPaths` 的组合，
 * 唯一的行为差异是失败不再以 `undefined` 收场（见 Interface 第 7 条）。
 *
 * @returns {{ imports: string[], errors: Array<{ path?: string, message: string }> }}
 */
function planImports({
  effects,
  changeStates,
  currentImports,
  fileExists,
  toImportUri,
}) {
  const addPaths = [];
  const removePaths = [];
  for (const effect of effects) {
    const state = changeStates[effect.key] ?? "none";
    // 与重构前 flushChanges 一致：filePath 为空的效果整条跳过（既不增也不删）。
    if (!effect.targetPath) continue;

    if (state === "reload" && effect.enabled === true) {
      removePaths.push(effect.targetPath);
      addPaths.push(effect.targetPath);
    }

    if (state === "switch") {
      (effect.enabled === true ? addPaths : removePaths).push(effect.targetPath);
    }
  }

  // 与重构前 `RemovePaths(imports, removePaths.concat(addPaths))` 等价：
  // 移除集合里同时包含"要移除的"与"要新增的"，新增项因此总能重新落到列表末尾（去重 / 重加）。
  // removeByBasename 返回新数组，因此后续 push 不会修改调用方的 currentImports。
  const imports = removeByBasename(currentImports, [
    ...removePaths,
    ...addPaths,
  ]);
  // 去重集合：现有条目（已去掉本轮要移除/重加的）加上本轮已成功加入的。
  const planned = new Set(imports.map(basenameKey));

  const errors = [];
  for (const filePath of addPaths) {
    const key = basenameKey(filePath);
    // 去重：同一份文件（basename 相同，忽略大小写）在列表里只留一条。
    if (planned.has(key)) continue;

    // 注入能力缺失 = 无法校验存在性 / 无法转换形式：该条不加入并报告，
    // 绝不猜测、也绝不把空值塞进列表。
    if (typeof fileExists !== "function" || typeof toImportUri !== "function") {
      errors.push({
        path: filePath,
        message: `缺少注入能力（fileExists / toImportUri），跳过导入：${filePath}`,
      });
      continue;
    }

    let exists = false;
    try {
      exists = fileExists(filePath) === true;
    } catch {
      exists = false;
    }
    if (!exists) {
      // 文案与重构前 AddPaths 一致；区别只在于这里不再 `return undefined`，
      // 无效值不会流向"写全局配置"那一步。
      errors.push({
        path: filePath,
        message: `找不到配置文件，路径: ${filePath}`,
      });
      continue;
    }

    let uri;
    try {
      uri = toImportUri(filePath);
    } catch {
      uri = undefined;
    }
    if (typeof uri !== "string" || uri.length === 0) {
      errors.push({
        path: filePath,
        message: `无法把路径转换为导入用的 URI 形式：${filePath}`,
      });
      continue;
    }

    imports.push(uri);
    planned.add(key);
  }

  return { imports, errors };
}

/**
 * 按 `kind` 分派渲染。新增渲染方式 = 在这里加一个分支，调用方与 Interface 不变。
 *
 * 未识别的 `kind` 落入 default：显式报错而不是静默跳过，
 * 避免后续迁移者误以为它已经工作。
 *
 * @returns {{ ok: true, content: string, errors: [] } |
 *           { ok: false, errors: Array<{ path?: string, message: string }> }}
 */
function renderEffect(effect, readText) {
  switch (effect.kind) {
    case "css-concat":
      return renderCssConcat(effect, readText);
    case "marker-block":
      return renderMarkerBlock(effect, readText);
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

/**
 * 标记块式渲染：在目标文件里定位起止标记，把两者之间的内容整块替换；
 * 找不到标记时把配置块插入到文件头。
 *
 * 载荷（描述符上除 markers 外的字段）：
 * - `variableName`：生成 `const <variableName> = ...;` 的变量名。
 * - `config`：任意 JSON 可序列化的配置快照，按两空格缩进渲染。
 * - `markers.start` / `markers.end`：**逐字节匹配**的标记文本（含注释定界符）。
 *
 * @returns {{ ok: true, content: string, errors: [] } |
 *           { ok: false, errors: Array<{ path?: string, message: string }> }}
 */
function renderMarkerBlock(effect, readText) {
  const { start, end } = effect.markers ?? {};
  const { variableName } = effect;

  // 描述符是执行层拼出来的纯数据，字段缺失时不能靠 TypeError 冒泡（接缝不抛异常）。
  if (
    typeof start !== "string" ||
    start.length === 0 ||
    typeof end !== "string" ||
    end.length === 0 ||
    typeof variableName !== "string" ||
    variableName.length === 0
  ) {
    return {
      ok: false,
      errors: [
        {
          path: effect.targetPath,
          message: `marker-block 描述符不完整（需要 markers.start、markers.end、variableName）：效果 ${effect.key}`,
        },
      ],
    };
  }

  const original = readText(effect.targetPath);

  // 目标文件缺失（readText 返回 null / 非字符串）：不抛异常，记一条 errors 并让整条效果
  // 失败。这是与迁移前的唯一行为差异——旧实现 throw `没找到目标文件: <path>`，
  // 由 async 调用方的未处理拒绝吞掉；接缝统一改走 errors 通道。
  if (typeof original !== "string") {
    return {
      ok: false,
      errors: [
        {
          path: effect.targetPath,
          message: `无法读取目标文件，路径: ${effect.targetPath}`,
        },
      ],
    };
  }

  const configText = JSON.stringify(effect.config, null, 2);
  const block = `${start}\nconst ${variableName} = ${configText};\n${end}`;

  // 标记是字面量文本（`/* __AUTO_CONFIG_START__ */` 里含正则元字符），必须整体转义。
  // 非全局 + 惰性匹配 = 只替换**第一处**标记块：异常文件里出现两处时，第二处原样保留，
  // 与迁移前 `String.replace(非全局正则, ...)` 的行为一致。
  const markerRegex = new RegExp(
    `${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`,
    "m",
  );

  if (!markerRegex.test(original)) {
    return { ok: true, content: `${block}\n\n${original}`, errors: [] };
  }

  // 用函数式替换：配置值里若出现 `$&`、`$1` 之类的字符序列，不会被当成替换模式解释。
  return {
    ok: true,
    content: original.replace(markerRegex, () => block),
    errors: [],
  };
}

/** 正则转义：把一段文本变成只按字面量匹配的正则片段。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
