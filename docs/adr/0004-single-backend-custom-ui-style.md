# ADR-0004：单一注入后端（Custom UI Style）

- **状态**：已采纳（Accepted）。**取代 ADR-0003 的「双后端可切换」部分**；ADR-0003 中关于
  条目形态（`file://` 字符串、`.js` 按 ESM 加载、对象条目只接受 `https://`）的核实结论仍然有效。
- **日期**：2026-11-07
- **范围**：`src/common/loader-adapter.js`（后端声明与可用性检测）、`extension.js`（接线）、
  `package.json` 的 `contributes.configuration`、`README.md` / `README-zh.md`、相关测试。
  **不涉及**渲染接缝（`refresh-plan.js`）、效果数据表、五个资产目录。
- **决策者**：维护者
- **相关文档**：ADR-0003（被取代）、ADR-0001、`docs/diagnosis/loader-and-effect-failures.md`

## 背景

ADR-0003 让本扩展同时支持两个注入后端，并由设置项 `visionSmashCode.loader` 选择：

- `be5invis`（Custom CSS and JS Loader）——默认；
- `custom-ui-style`（Custom UI Style）。

维护者随后决定**只保留 `custom-ui-style`**，彻底删除 `be5invis` 支持与切换能力。

## 决策理由：两个后端会互相污染同一个 `workbench.html`

两个后端都通过改写 VS Code **安装目录下同一个** `workbench.html` 来注入内容，并且**各自维护
自己的备份**。实测发现它们会互相污染：

1. 后端 A 打补丁，把 `workbench.html` 改成「原始内容 + A 的注入」；
2. 后端 B 此时拍备份——它备份到的是**已经被 A 改过**的文件，而不是原始文件；
3. 之后 B 执行「还原」时，会把这份脏备份写回去；
4. 结果是文件停在「被 A 改过的状态」，而 B 认为这就是原始状态。

后果是**用户级不可恢复**：某个效果在设置里关掉后，注入内容仍然留在 `workbench.html` 里，
重启也不会消失（重启加载的仍是被改过的文件）。而 `be5invis` **没有提供还原命令**，
这个污染无法从本扩展这一侧修复。只要两个后端都可能被安装、被切换，这个故障模式就始终存在。

因此唯一从根上消除它的办法是：**本扩展只使用一个后端，不再写另一个后端的配置**，
也不再去碰它的注入列表。

## 决策

### 1. 只保留 `custom-ui-style`

`src/common/loader-adapter.js` 收敛为一份声明 `CUSTOM_UI_STYLE_LOADER`：

| 事实 | 值 |
| --- | --- |
| 扩展 id | `subframe7536.custom-ui-style` |
| 配置节 | `custom-ui-style` |
| 注入列表键 | `custom-ui-style.external.imports` |
| 重载命令 | `custom-ui-style.reload` |
| 本地文件条目 | `file://` 字符串（`.js` 按 ES module 加载） |

条目形态的吸收逻辑（`readImports` / `writeImports` / `toEntry` / `buildEntries`）保持不变：
用户自己的条目形态与顺序原样保留，认不出的条目一条都不删。

### 2. 可用性仍是**运行时检测**，不用 `extensionDependencies`

维护者明确选择保留「运行时检测 + 提示安装」。因此：

- 新增 `resolveLoader({ vscode })`，返回
  `{ ok: true, adapter }` 或 `{ ok: false, message, extensionId }`；
- `extension.js` 在 `ok: false` 时把 `loader` 置为 `null`，并展示带「安装扩展」动作的错误；
- **既有约定不变**：后端不可用时**不写任何配置、也不写盘**（生成的文件没有人会注入，
  写它只会在安装目录里留下"看起来生效了"的假象）。

检测只看「装了没」（`vscode.extensions.getExtension(id)` 能拿到对象即可），不判断 `isActive`；
检测能力缺失或抛错时 fail-open，避免把可用环境误判成未安装。

### 3. 删除切换能力

删除以下内容（含测试）：

- `package.json` 里的 `visionSmashCode.loader` 枚举设置项；
- `loader-adapter.js` 里的 `CUSTOM_CSS_LOADER`、`LOADERS`、`DEFAULT_LOADER`、`selectLoader`；
- `src/install/loader-switch.js` 及 `test/loader-switch.test.mjs`；
- `extension.js` 里的 `LOADER_SETTING`、`handleLoaderChange()`、`dropEntriesFromOtherBackends()`、
  对 `switchLoader` 的引用，以及对 `visionSmashCode.loader` 变化的特殊处理；
- 与双后端/切换相关的测试与 README 章节。

**保留** `reconcileImportsOnActivate()`：安装目录带版本号（`…-1.2.0` → `…-1.2.1`），升级后旧条目
会让加载器报 ENOENT，这个激活时对账逻辑仍然需要。

### 4. 业务代码仍然不得出现后端名字面量

「后端差异只存在于一个可测试的适配层」这条不变量继续成立，由 `test/loader-adapter.test.mjs`
的扫描测试守护：`extension.js`、`src/install/**`、`src/common/**` 里只允许适配层出现
`custom-ui-style` / `subframe7536.custom-ui-style` / `external.imports` / 重载命令等字面量。
另加一条零豁免的扫描：`be5invis`、`vscode_custom_css`、`extension.updateCustomCSS`、
`Custom CSS and JS Loader` 在**所有**宿主模块（含适配层）里都不得再出现。

## 未验证项（不得当作已验证事实引用）

1. **ESM 下三个 JS 效果是否可用，未在真实编辑器验证。** Custom UI Style 把本地 `.js` 按
   **ES module** 加载（`<script type="module">`），而本扩展的光标拖尾、鼠标尾迹、文字爆炸是
   经典脚本。它们在 ESM 语义（严格模式、模块作用域、defer、三个文件拼进同一个模块）下
   是否能正常执行，**未经真实 VS Code 实例验证**。两个 CSS 类效果预期可用，同样未经真机验证。
2. 旧后端 `workbench.html` 里的历史注入内容是否会被 `be5invis` 自己的命令撤干净，未验证；
   本 ADR 只保证本扩展不再向它写入、也不再替它清理。

## 后果

- 正面：从根上消除「两个后端互相污染同一个 `workbench.html`」的故障模式；配置面只剩一个
  后端、一条注入列表；业务代码与适配层的关系比双后端时期更窄。
- 负面（如实记录）：
  - 之前使用 `be5invis` 的用户升级后效果会停止，需要安装 Custom UI Style 并执行
    `Custom UI Style: Reload`。
  - 旧后端 `vscode_custom_css.imports` 里可能残留本扩展的历史条目。本扩展**不再自动清理它**
    （那正是被删除的双后端协调逻辑），也不保证旧补丁被撤销；需要时请用户自行删除该条目，
    或按 `be5invis` 自己的卸载流程处理。
  - Custom UI Style 的用户级前置条件（`Custom UI Style: Reload`、`reloadWithoutPrompting`、
    Windows 上完全退出 VS Code、`external.loadStrategy = "disable"` 会忽略全部外部资源）
    已写入两份 README。
- 影响面：`src/common/loader-adapter.js`、`extension.js`、`package.json`、两份 README、ADR 与测试；
  `engines.vscode`、`main` / `exports`、`scripts`、`devDependencies`、`.vscodeignore` 未改动。

## 备选方案（未采纳）

- **保留双后端但加装护栏**：无法解决 `be5invis` 没有还原命令这一点，污染仍会发生。
- **改用 `extensionDependencies` 硬依赖**：维护者明确选择运行时检测 + 提示安装，且硬依赖会让
  「后端未安装」时的可操作提示消失。不采纳。
- **升级时自动清空另一个后端的列表**：等于继续写另一个后端的配置，与「只用一个后端」矛盾；
  而且清空配置也撤不掉已经内联进 `workbench.html` 的内容。不采纳。
