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
 * ## 只有一个后端（ADR-0004）
 *
 * 历史上这里同时声明过 `be5invis`（Custom CSS and JS Loader）与 Custom UI Style，
 * 由设置项 `visionSmashCode.loader` 选择。ADR-0004 决定只保留 Custom UI Style：
 * 两个后端都会改写安装目录下**同一个** `workbench.html` 并各自维护备份，互相污染，
 * 而 `be5invis` 没有提供还原命令，污染无法从我们这侧修复。因此设置项、注册表、
 * 切换逻辑一并删除，本模块只剩一份声明。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * - `resolveLoader({ vscode })` 检测后端是否可用：
 *   - `{ ok: true, adapter }`：可用的适配器。
 *   - `{ ok: false, message, extensionId }`：后端未安装 / 未启用。`message` 是可展示的
 *     安装指引（含扩展 id）。此时调用方**不得**向该后端的配置键写入任何东西，
 *     也**不得**往磁盘写生成结果——没有人会消费它们（`extension.js` 的 `loader = null`）。
 *   - 可用性只回答"装了没"：`vscode.extensions.getExtension(id)` 能拿到对象即视为可用。
 *     不判断 `isActive`——后端按 `onStartupFinished` 自行激活，激活时机不属于本层。
 *     检测能力本身缺失或抛错时按"可用"处理（fail-open）：宁可让后端在消费时自己报错，
 *     也不要把一个装好的环境误判成未安装而彻底停掉效果。
 * - `createLoaderAdapter({ vscode })` 返回一个适配器对象。
 *   - `vscode`：**必须注入**——本模块不 import `vscode` 全局，因此可以被 `node --test`
 *     直接加载，并用假对象覆盖全部行为。
 * - 适配器暴露五个成员：
 *   - `id`：该适配器对应后端的 id（字符串，来自声明）。用于错误文案里点名后端。
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
 * ## 条目形态事实（2026-11-07 按上游源码核实，见 ADR-0003 / ADR-0004）
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
 * 这是 ADR-0004 里那条"三个 JS 效果未经真实编辑器验证"的由来。
 */

/**
 * 条目形态的**共享默认实现**（评审 F11）。
 *
 * 声明里的 `toEntry` / `toId` / `fromId` 逐字引用这里的函数，避免各抄一份后漂移。
 */

/** 本地路径 → 条目字符串视图（稳定 id）。`vscode.Uri.file(path).toString()`。 */
const filePathToEntry = ({ filePath, vscode }) =>
  vscode.Uri.file(filePath).toString();

/** 读到的条目 → 稳定字符串 id：只认字符串，别的一律归一化不了。 */
const stringToId = (entry) => (typeof entry === "string" ? entry : null);

/** id → 条目：条目就是那个字符串本身，因此是恒等。 */
const idToEntry = (id) => id;

/** 在字符串基础上，额外认 `{ type, url }` 对象条目的 `url`。 */
const stringOrObjectUrlToId = (entry) =>
  stringToId(entry) ??
  (entry && typeof entry === "object" && typeof entry.url === "string"
    ? entry.url
    : null);

/**
 * 唯一后端：`subframe7536.custom-ui-style`（Custom UI Style）。
 *
 * 这份声明就是"我们的后端是它"这件事的全部。字段一律与 ADR-0003 核实到的上游事实
 * 一致，`test/loader-backend.test.mjs` 对每条都有断言。
 *
 * 条目形态：
 * - 写入时产出的是 `file://` URI 字符串（`toEntry` / `fromId`）。不用对象形态，
 *   因为该后端的对象条目 `url` 只接受 `https://`，`file://` 会被静默丢弃——见
 *   文件头的「条目形态事实」。
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
  toEntry: filePathToEntry,
  // 字符串条目与默认实现相同；额外认对象条目的 `url`（用户自己的远端条目）。
  toId: stringOrObjectUrlToId,
  // 本地文件在该后端上只有字符串一种可用形态（`.js` 会被当作 ES module 执行）。
  fromId: idToEntry,
};

/**
 * 检测唯一后端是否可用。
 *
 * 这是"后端不可用时怎么办"的接口：调用方拿到 `ok: false` 时既不写配置、也不写盘，
 * 只把 `message` 展示给用户（并可用 `extensionId` 跳转扩展市场）。
 *
 * @param {{
 *   vscode: { extensions?: { getExtension: Function } },
 * }} deps
 * @returns {{
 *   ok: true, adapter: ReturnType<typeof createLoaderAdapter>,
 * } | {
 *   ok: false, extensionId: string, message: string,
 * }}
 */
export function resolveLoader({ vscode }) {
  if (!isExtensionAvailable(vscode, CUSTOM_UI_STYLE_LOADER.extensionId)) {
    return {
      ok: false,
      extensionId: CUSTOM_UI_STYLE_LOADER.extensionId,
      message:
        `注入后端「${CUSTOM_UI_STYLE_LOADER.displayName}」未安装或未启用` +
        `（${CUSTOM_UI_STYLE_LOADER.extensionId}）。` +
        `请在扩展面板安装并启用它，然后重新加载窗口。`,
    };
  }

  return {
    ok: true,
    adapter: createLoaderAdapter({ vscode }),
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
 * 按后端的声明造出适配器。
 *
 * @param {{
 *   vscode: { workspace: { getConfiguration: Function }, commands: { executeCommand: Function }, ConfigurationTarget: object, Uri: { file: Function } },
 * }} deps
 */
export function createLoaderAdapter({ vscode }) {
  const loader = CUSTOM_UI_STYLE_LOADER;
  const toId = loader.toId;
  const fromId = loader.fromId;

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
