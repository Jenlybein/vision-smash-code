/**
 * 底层加载器适配层。
 *
 * 本模块是「本扩展依赖哪个底层加载器」这个事实的**唯一**存放处。加载器与我们的
 * 全部差异只有四件，且都在这里：
 *
 * 1. 注入列表的配置键（读 / 写）；
 * 2. 触发重载的命令；
 * 3. 本地路径 → 注入条目，以及读到的条目 → 稳定字符串 id；
 * 4. 后端扩展本身是谁（供运行时可用性检测）。
 *
 * 除此之外的"哪些路径该被注入""下一轮状态是什么""提示什么文案"都不在这里，
 * 它们分别在 `refresh-plan.js`（纯函数接缝）与各执行层里。本模块不含业务判断。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * - `selectLoader({ vscode, settingValue })` 按设置值挑后端，并**先**检测后端是否可用：
 *   - `{ ok: true, adapter }`：所选后端的适配器。
 *   - `{ ok: false, message, extensionId }`：后端未安装 / 未启用。`message` 是可展示的
 *     安装指引（含扩展 id 与退回默认后端的提示）。此时调用方**不得**向该后端的配置键
 *     写入任何东西——没有人会消费它。
 *   - 设置值未知（手改 `settings.json`、拼错）时回退到默认后端，不让整个扩展失效。
 *   - 可用性只回答"装了没"：`vscode.extensions.getExtension(id)` 能拿到对象即视为可用。
 *     不判断 `isActive`——后端按 `onStartupFinished` 自行激活，激活时机不属于本层。
 *     检测能力本身缺失或抛错时按"可用"处理（fail-open）：宁可让后端在消费时自己报错，
 *     也不要把一个装好的环境误判成未安装而彻底停掉效果。
 * - `createLoaderAdapter({ vscode, loader })` 返回一个适配器对象。
 *   - `vscode`：**必须注入**——本模块不 import `vscode` 全局，因此可以被 `node --test`
 *     直接加载，并用假对象覆盖全部行为。
 *   - `loader`：加载器差异声明，省略时用默认后端 `DEFAULT_LOADER`（`be5invis`）。
 *     换后端 / 加第三个后端 = 加一份声明并登记到 `LOADERS`，适配层与业务代码都不需要改。
 * - 适配器暴露五个成员：
 *   - `id`：该适配器对应后端的 id（字符串，来自声明）。用于判断"后端有没有真的变"。
 *   - `readImports() => string[]`：读出整份注入列表并**归一化**成稳定字符串 id；
 *     配置未设置时返回空数组（不是 `undefined`）。无法归一化的条目（用户手写的非法值）
 *     不会出现在结果里，但也不会因此被删除——见 `writeImports`。
 *   - `writeImports(ids) => Promise<void>`：把 `planRefresh` 给出的**整份** id 列表变成
 *     该后端认识的条目并写回用户级（`Global`）配置。条目形态差异全部在这里被吸收：
 *     读到的条目原样保留（用户的其它注入项一个字节都不改，顺序也不动），只有新 id
 *     才会用声明里的 `fromId` 现造。
 *     返回的 Promise **不等到配置真正写完**——与重构前一致（见方法内注释）。
 *   - `reload() => unknown`：触发加载器重载，原样返回加载器命令的返回值（不等待）。
 *   - `toEntry(filePath) => string`：把本地绝对路径转成该后端的条目**字符串视图**
 *     （稳定 id），可直接作为 `planRefresh` 的 `toImportUri` 能力。`planRefresh` 的契约
 *     要求这里是字符串，条目不是字符串的后端必须在 `fromId` 里再还原成真实形态。
 * - 本层不吞异常：`getConfiguration` / `update` / `executeCommand` / `Uri.file` 抛出的
 *   错误原样冒泡给调用方。错误该如何展示是执行层的决定。
 *
 * ## 条目形态事实（2026-11-07 按上游源码核实，见 ADR-0003）
 *
 * `subframe7536.custom-ui-style` 的 `external.imports` 接受两种条目：
 * - 字符串（`file://` / `https://` 开头，以 `.css` / `.js` 结尾）：本地文件只有这一种
 *   可用形态；`.js` 会被当作 **ES module** 加载（其 `getResourceMeta` 把 `.js` 映射成
 *   `js-module`）。
 * - 对象 `{ type, url }`：`url` **只接受 `https://`**（manifest 的 schema 与实现里的
 *   `url must startsWith 'https://'` 都这么写）。因此对象形态**无法**用来注入本地文件，
 *   用它只会被静默丢弃——这正是 #22 工单正文里那条建议不成立的地方。
 *
 * 结论：本扩展注入的本地文件在该后端上只能是 `file://` 字符串，JS 会被当作 ESM 执行。
 * 这是该后端被标注为实验性的直接原因，也写进了 ADR-0003 与 README 的人工验证步骤。
 */

/**
 * 默认后端：`be5invis.vscode-custom-css`（Custom CSS & JS Loader）。
 *
 * 这份声明就是"我们的默认加载器是它"这件事的全部。字段一律与重构前逐字节一致，
 * 改动任何一条都会体现在行为上，因此 `test/loader-adapter.test.mjs` 对每条都有断言。
 *
 * 条目形态：`file://` URI 字符串数组（与重构前逐字节一致）。
 */
export const CUSTOM_CSS_LOADER = {
  // 后端 id：就是设置项 `visionSmashCode.loader` 的取值，也是注册表的键。
  id: "be5invis",
  // 展示名与扩展 id：只用于可用性检测与安装指引。
  displayName: "Custom CSS and JS Loader",
  extensionId: "be5invis.vscode-custom-css",
  // 注入列表所在的配置节与属性名。
  configSection: "vscode_custom_css",
  importsProperty: "imports",
  // 修改配置后由该命令触发重载。
  reloadCommand: "extension.updateCustomCSS",
  // 该加载器把注入列表当作 URI 字符串数组，因此路径转条目就是
  // `vscode.Uri.file(path).toString()`——与重构前 extension.js 的 toImportUri 逐字节一致。
  toEntry: ({ filePath, vscode }) => vscode.Uri.file(filePath).toString(),
  // 读到的条目 → 稳定字符串 id。该后端只认字符串，别的一律归一化不了。
  toId: (entry) => (typeof entry === "string" ? entry : null),
  // 由 id 造出条目。该后端的条目就是那个字符串本身，因此是恒等。
  fromId: (id) => id,
};

/**
 * 新后端：`subframe7536.custom-ui-style`（Custom UI Style）。
 *
 * 差异同样只在这份声明里：配置节 / 属性名 / 重载命令 / 扩展 id 各一条，
 * 外加"读到的条目可能不是字符串"这一条归一化规则。
 *
 * 条目形态：
 * - 写入时产出的是 `file://` URI 字符串（`toEntry` / `fromId`）。不用对象形态，
 *   因为该后端的对象条目 `url` 只接受 `https://`，`file://` 会被静默丢弃——见
 *   文件头的「条目形态事实」与 ADR-0003。
 * - 读取时既要认字符串，也要认对象（用户自己的远端条目可能是 `{ type, url }`）。
 *   对象的 id 取 `url`，写回时原样保留对象形态（见 `writeImports` 的条目重建逻辑）。
 */
export const CUSTOM_UI_STYLE_LOADER = {
  id: "custom-ui-style",
  displayName: "Custom UI Style",
  extensionId: "subframe7536.custom-ui-style",
  configSection: "custom-ui-style",
  importsProperty: "external.imports",
  reloadCommand: "custom-ui-style.reload",
  toEntry: ({ filePath, vscode }) => vscode.Uri.file(filePath).toString(),
  toId: (entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object" && typeof entry.url === "string") {
      return entry.url;
    }
    return null;
  },
  // 本地文件在该后端上只有字符串一种可用形态（`.js` 会被当作 ES module 执行）。
  fromId: (id) => id,
};

/**
 * 后端注册表：设置值 → 后端声明。
 *
 * 加第三个后端 = 在这里加一条登记 + 在 `package.json` 的枚举里加一个取值，
 * 业务代码（`extension.js` 与各执行层）一行都不用改。
 */
export const LOADERS = {
  [CUSTOM_CSS_LOADER.id]: CUSTOM_CSS_LOADER,
  [CUSTOM_UI_STYLE_LOADER.id]: CUSTOM_UI_STYLE_LOADER,
};

/**
 * 默认后端。
 *
 * **必须是 `be5invis`**：设置项未设置时用它，既有用户升级后行为因此完全不变。
 */
export const DEFAULT_LOADER = CUSTOM_CSS_LOADER;

/**
 * 按设置值挑一个后端，并检测它是否可用。
 *
 * @param {{
 *   vscode: { extensions?: { getExtension: Function }, workspace: object, commands: object, ConfigurationTarget: object, Uri: object },
 *   settingValue?: string,
 * }} deps
 * @returns {{
 *   ok: true, loaderId: string, adapter: ReturnType<typeof createLoaderAdapter>,
 * } | {
 *   ok: false, loaderId: string, extensionId: string, message: string,
 * }}
 */
export function selectLoader({ vscode, settingValue }) {
  // 未知取值（手改 settings.json / 拼错）回退到默认后端：坏设置不该让整个扩展失效。
  const loader = LOADERS[settingValue] ?? DEFAULT_LOADER;

  if (!isExtensionAvailable(vscode, loader.extensionId)) {
    return {
      ok: false,
      loaderId: loader.id,
      extensionId: loader.extensionId,
      message:
        `所选注入后端「${loader.displayName}」未安装或未启用（${loader.extensionId}）。` +
        `请在扩展面板安装并启用它，然后重新加载窗口；` +
        `或把设置 visionSmashCode.loader 切回 ${DEFAULT_LOADER.id}。`,
    };
  }

  return {
    ok: true,
    loaderId: loader.id,
    adapter: createLoaderAdapter({ vscode, loader }),
  };
}

/**
 * 后端是否可用。
 *
 * 只回答"装了没"：拿到扩展对象即视为可用，不判断 `isActive`（后端自行激活）。
 * 检测能力缺失或抛错时按可用处理（fail-open），避免把可用环境误判成未安装而停掉效果。
 */
function isExtensionAvailable(vscode, extensionId) {
  const extensions = vscode.extensions;
  if (!extensions || typeof extensions.getExtension !== "function") return true;
  try {
    return Boolean(extensions.getExtension(extensionId));
  } catch {
    return true;
  }
}

/**
 * 按一份加载器声明造出适配器。
 *
 * 声明里 `toId` / `fromId` 省略时按"条目就是字符串"处理：这样只关心配置键与命令的
 * 后端（例如测试里的假想后端）也能用一份最短的声明接入。
 *
 * @param {{
 *   vscode: { workspace: { getConfiguration: Function }, commands: { executeCommand: Function }, ConfigurationTarget: object, Uri: { file: Function } },
 *   loader?: typeof CUSTOM_CSS_LOADER,
 * }} deps
 */
export function createLoaderAdapter({ vscode, loader = DEFAULT_LOADER }) {
  const toId = loader.toId ?? ((entry) => (typeof entry === "string" ? entry : null));
  const fromId = loader.fromId ?? ((id) => id);

  // 读配置里**原始**的条目数组（可能是字符串，也可能是对象）。
  // 非数组（用户手写坏了）按空列表处理：planRefresh 的契约只接受字符串数组。
  function readRawEntries() {
    const value = vscode.workspace
      .getConfiguration(loader.configSection)
      .get(loader.importsProperty);
    return Array.isArray(value) ? value : [];
  }

  return {
    id: loader.id,

    readImports() {
      return readRawEntries()
        .map((entry) => toId(entry))
        .filter((id) => typeof id === "string");
    },

    async writeImports(ids) {
      // 条目形态差异在这里被吸收：先把计划给出的 id 列表还原成条目。
      // 现读一次原始列表，是为了让用户自己条目的**形态与顺序**原样保留——
      // 引用它写回，而不是按 id 重新构造（重新构造会把 `{type,url}` 变成裸字符串，
      // 在 custom-ui-style 里等于把用户的远端条目从 ESM 换成别的语义）。
      const entries = buildEntries({
        currentEntries: readRawEntries(),
        nextIds: ids,
        toId,
        fromId,
      });

      // 与重构前的 `UpdateImports` 一致：**不等待** `update` 完成（旧实现同样丢弃了它的
      // Promise）。这决定了"修改成功"提示与 400ms 重载计时器的时点——await 它会让提示变晚，
      // 属于行为变化，因此这里刻意保持"发出即完"。
      vscode.workspace
        .getConfiguration(loader.configSection)
        .update(
          loader.importsProperty,
          entries,
          vscode.ConfigurationTarget.Global,
        );
    },

    reload() {
      return vscode.commands.executeCommand(loader.reloadCommand);
    },

    toEntry(filePath) {
      return loader.toEntry({ filePath, vscode });
    },
  };
}

/**
 * 把 `planRefresh` 给出的 id 列表还原成要写回配置的条目数组。
 *
 * 三条规则就是"只动自己的、不动用户的"这个硬要求的实现：
 * 1. 计划里仍然存在的 id → 用**原来那条条目**（形态不变），因此用户自己的对象形态条目
 *    不会被改写成裸字符串；
 * 2. 计划里新出现的 id → 用声明的 `fromId` 现造；
 * 3. 认不出的条目（不是字符串、也没有 `url`）**一个都不删**，原样追加到末尾——
 *    它们不在计划里，无法参与排序，但绝不能因为"我们不认识"就消失。
 *
 * 顺序严格按计划给出的顺序：计划用"移除再追加"来表达"重新落到末尾"（这是触发重载的关键，
 * 见 `refresh-plan.js` 的 Interface 第 7 条），因此这里不能按原列表顺序回填。
 *
 * 纯函数：不读配置、不写盘，因此可以脱离 vscode 验证。
 *
 * @param {{
 *   currentEntries: unknown[],
 *   nextIds: string[],
 *   toId: (entry: unknown) => string | null,
 *   fromId: (id: string) => unknown,
 * }} input
 * @returns {unknown[]}
 */
function buildEntries({ currentEntries, nextIds, toId, fromId }) {
  const rawById = new Map();
  const unreadable = [];

  for (const entry of currentEntries) {
    const id = toId(entry);
    if (typeof id !== "string") {
      unreadable.push(entry);
      continue;
    }
    // 同一 id 的重复条目只保留第一条：写回时不应多出一条。
    if (!rawById.has(id)) rawById.set(id, entry);
  }

  const entries = [];
  const written = new Set();
  for (const id of nextIds) {
    if (written.has(id)) continue;
    entries.push(rawById.has(id) ? rawById.get(id) : fromId(id));
    written.add(id);
  }

  return [...entries, ...unreadable];
}
