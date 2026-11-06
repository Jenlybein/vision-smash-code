/**
 * 底层加载器适配层。
 *
 * 本模块是「本扩展依赖哪个底层加载器」这个事实的**唯一**存放处。加载器与我们的
 * 全部差异只有三件，且都在这里：
 *
 * 1. 注入列表的配置键（读 / 写）；
 * 2. 触发重载的命令；
 * 3. 本地路径 → 注入条目。
 *
 * 除此之外的"哪些路径该被注入""下一轮状态是什么""提示什么文案"都不在这里，
 * 它们分别在 `refresh-plan.js`（纯函数接缝）与各执行层里。本模块不含业务判断。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * - `createLoaderAdapter({ vscode, loader })` 返回一个适配器对象。
 *   - `vscode`：**必须注入**——本模块不 import `vscode` 全局，因此可以被 `node --test`
 *     直接加载，并用假对象覆盖全部行为。
 *   - `loader`：加载器差异声明，省略时用默认后端 `CUSTOM_CSS_LOADER`。
 *     换后端 = 传另一份声明，适配层与调用方都不需要改。
 * - 适配器暴露四个方法，每个都只是"转手给加载器"：
 *   - `readImports() => string[]`：读出整份注入列表；配置未设置时返回空数组（不是 `undefined`）。
 *   - `writeImports(entries) => Promise<void>`：发出"把**整份**列表写回用户级（`Global`）配置"
 *     这个动作。要写入什么由 `planRefresh` 决定：本方法不增删、不去重、不校验。
 *     返回的 Promise **不等到配置真正写完**——与重构前一致（见方法内注释）。
 *   - `reload() => unknown`：触发加载器重载，原样返回加载器命令的返回值（不等待）。
 *   - `toEntry(filePath) => string`：把一个本地绝对路径转成该加载器认识的条目形态。
 *     默认后端的条目就是字符串，因此它可直接作为 `planRefresh` 的 `toImportUri` 能力。
 *     条目形态不是字符串的后端，需要在各自声明里产出一个字符串视图（#22）。
 * - 本层不吞异常：`getConfiguration` / `update` / `executeCommand` / `Uri.file` 抛出的
 *   错误原样冒泡给调用方。错误该如何展示是执行层的决定。
 */

/**
 * 默认后端：`be5invis.vscode-custom-css`（Custom CSS & JS Loader）。
 *
 * 这份声明就是"我们的加载器是它"这件事的全部。字段一律与重构前逐字节一致，
 * 改动任何一条都会体现在行为上，因此 `test/loader-adapter.test.mjs` 对每条都有断言。
 */
export const CUSTOM_CSS_LOADER = {
  // 注入列表所在的配置节与属性名。
  configSection: "vscode_custom_css",
  importsProperty: "imports",
  // 修改配置后由该命令触发重载。
  reloadCommand: "extension.updateCustomCSS",
  // 该加载器把注入列表当作 URI 字符串数组，因此路径转条目就是
  // `vscode.Uri.file(path).toString()`——与重构前 extension.js 的 toImportUri 逐字节一致。
  toEntry: ({ filePath, vscode }) => vscode.Uri.file(filePath).toString(),
};

/**
 * 按一份加载器声明造出适配器。
 *
 * @param {{
 *   vscode: { workspace: { getConfiguration: Function }, commands: { executeCommand: Function }, ConfigurationTarget: object, Uri: { file: Function } },
 *   loader?: typeof CUSTOM_CSS_LOADER,
 * }} deps
 */
export function createLoaderAdapter({ vscode, loader = CUSTOM_CSS_LOADER }) {
  return {
    readImports() {
      return (
        vscode.workspace
          .getConfiguration(loader.configSection)
          .get(loader.importsProperty) || []
      );
    },

    async writeImports(entries) {
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
