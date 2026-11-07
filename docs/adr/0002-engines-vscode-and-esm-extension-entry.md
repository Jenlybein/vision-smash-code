# ADR-0002：`engines.vscode` 与 ESM 扩展入口的相容性

- **状态**：已采纳（Accepted）——结论已落库；`package.json` 的 `engines.vscode` 已据此修正为 `^1.100.0`。
  阶段 4（esbuild → CJS）已于 #17 落地（`main` / `exports` 指向 `dist/extension.cjs`），
  **`engines.vscode` 仍为 `^1.100.0`**，「决策」第 5 条不变。
- **日期**：2026-11-07
- **范围**：`package.json` 的 `engines.vscode` 声明，以及扩展入口的模块系统形态（`"type": "module"` + ESM `main`）。**不涉及** `extension.js` / `src/` 的任何代码改动。
- **决策者**：维护者
- **相关文档**：Issue #9（本工单）、Issue #5（父规格，阶段 4「打包」）、Issue #17（阶段 4 落地）、`docs/adr/0001-deep-module-analysis-of-config-injection.md`

## 背景

本扩展的 manifest 同时具备以下四条事实：

1. `"type": "module"`
2. `"main": "./extension.js"`
3. `extension.js` 与 `src/` 下所有模块使用 ESM 语法（`import` / `export`），入口第一行即 `import * as vscode from "vscode";`
4. `"engines": { "vscode": "^1.80.1" }`

第 4 条是对使用者的对外承诺：Marketplace 与 VS Code 都会据此判断哪些版本可以安装。若 ESM 入口实际需要比 1.80.1 更高的版本，这条承诺就是失实的——用户在 1.80.1 ~ 该版本之间安装后扩展根本激活不了。

本 ADR 记录核实过程、结论与依据来源，避免以后再次凭猜测回答同一个问题。

## 先澄清两件容易混淆的事

调查中必须把这两件事分开，它们的版本号不同、影响对象也不同：

| 事件 | 内容 | 与「扩展能否用 ESM 入口」的关系 |
| --- | --- | --- |
| (a) VS Code **自身**迁移到 ESM | 1.94（2024-09 迭代，发布日 2024-10-03）起，VS Code 核心各层（electron / node.js / browser / worker）改用 `import` / `export` | **无关**。同版本 release notes 明确写了扩展不受影响 |
| (b) **扩展**以 ESM 入口被扩展宿主加载 | 1.100（2025-04 迭代，发布日 2025-05-08）起，Node.js 扩展宿主支持 `"type": "module"` 的扩展 | **直接相关**，这就是本工单的答案 |

尤其要防止把 (a) 的版本号（1.94）当成答案——1.94 的 release notes 恰恰是在说「扩展没有跟着 ESM 化」。

## 证据（按时间线）

### ① 2021-08 → 2024-09：长期不支持

[microsoft/vscode#130367「Enable consuming of ES modules in extensions」](https://github.com/microsoft/vscode/issues/130367) 创建于 2021-08-08，正文描述的现象与本次问题完全一致：

> setting the `type` to `module` and rewriting the extension to use `import` instead of `require` breaks the extension, generating an exception that states that all modules should use `import` instead of `require` in internal VS Code JavaScript files

该 issue 在 1.94 发布时仍然处于打开状态。

### ② 1.94：VS Code 自身 ESM 化，扩展**不动**

[1.94 release notes](https://code.visualstudio.com/updates/v1_94) 的 Engineering 一节「ESM is shipping for VS Code」在正文之后有一段明确注记：

> **Note**: extensions are not impacted by this change and not loaded via ESM, please see <https://github.com/microsoft/vscode/issues/130367> for details.

即：截至 1.94，扩展仍不是以 ESM 加载的。任何早于 1.100 的版本都没有这条加载路径。

### ③ 1.100：Node.js 扩展宿主开始支持 ESM 扩展（关键版本）

[1.100 release notes](https://code.visualstudio.com/updates/v1_100) 的 Extension Authoring 一节「ESM support for extensions」原文：

> The NodeJS extension host now supports extensions that use JavaScript-modules (ESM). All it needs is the `"type": "module"` entry in your extension's `package.json` file. With that, the JavaScript code can use `import` and `export` statements, including the special module `import('vscode')`.
>
> Note that ESM support isn't for the web worker extension host yet.

实现来源：[PR #245214「ESM for extensions」](https://github.com/microsoft/vscode/pull/245214)，2025-04-01 合入，所属 milestone 为「April 2025」（即 1.100 迭代）。

### ④ 1.101：确认适用范围只有 Node 扩展宿主

[1.101 release notes](https://code.visualstudio.com/updates/v1_101)「Adopting ESM in a real-world extension」：

> Last milestone, we have announced support for JavaScript-modules (ESM). This enables extensions to use `import` and `export` statements, but currently only when targeting the NodeJS extension host.

同版本还提到 [PR #248286「ESM improvements for hybrid extensions」](https://github.com/microsoft/vscode/pull/248286)（2025-05-07 合入，milestone「May 2025」）用于「Node 宿主用 ESM、web 宿主用 CJS」的混编场景。

### ⑤ 追踪 issue 的关闭说明：明确「contained in 1.100.0 and later」

#130367 于 2026-07-06 由 VS Code 维护者 alexdima 关闭（state_reason: `completed`），关闭说明：

> This is now implemented for the Node extension host in commit `15260e72ae15426bf6093b1ad97e7f29bbc2397e` via <https://github.com/microsoft/vscode/pull/245214> and is contained in **1.100.0 and later**. Current main detects `.mjs` / package type `"module"` extension entry points and loads them with `import(...)` …

注意：该 issue 上残留的 milestone 标签为 `1.129.0`，与合入版本（1.100）和时间线都不符，**不可作为版本依据**；以上版本结论以 release notes 与关闭说明为准，两者互相印证。

### ⑥ 机制侧旁证：为什么 1.80.1 一定跑不起来

VS Code 1.100 之前，扩展宿主的入口加载走的是 CommonJS 的 `require()`；而 Node 对「`"type": "module"` 的包中的 `.js`」调用 `require()` 会抛 `ERR_REQUIRE_ESM`（`require(esm)` 直到 Node 20.19 / 22.12 才可用）。

本地机械复现（Node v22.23.2，目录含 `{"type":"module"}` 与 ESM 入口 `extension.js`）：

- 默认（Node ≥ 22.12，`require(esm)` 已默认开启）：`require('./extension.js')` 成功 —— 这正是新版环境容易掩盖问题的原因；
- 加 `--no-experimental-require-module`（模拟更早的 Node）：`ERR_REQUIRE_ESM: require() of ES Module … not supported`。

而 VS Code 1.80.1 固定的 Electron 版本是 `22.3.14`（见该 tag 的 `package.json` 中的 `devDependencies.electron`），Electron 22.3.14 内置 **Node.js 16.17.1**（[electron releases](https://releases.electronjs.org/release/v22.3.14)），远早于 `require(esm)`。因此 1.80.1 上**既没有扩展宿主的 ESM 加载路径，底层 Node 也不可能用 require 兜住 ESM 入口**，两条路都断。

## 结论

1. 当前入口形式（`"type": "module"` + ESM `main`，且运行于桌面/Node 扩展宿主）的最低要求是 **VS Code 1.100.0**。
2. `^1.80.1` 是失实声明：1.80.1 ~ 1.99.x 的用户可以安装，但扩展无法激活。
3. 依据来源（全部为一手来源）：
   - <https://code.visualstudio.com/updates/v1_100>（「ESM support for extensions」，2025-05-08）
   - <https://code.visualstudio.com/updates/v1_94>（「extensions … not loaded via ESM」注记）
   - <https://code.visualstudio.com/updates/v1_101>（范围限定为 Node 扩展宿主）
   - <https://github.com/microsoft/vscode/issues/130367>（关闭说明：contained in 1.100.0 and later）
   - <https://github.com/microsoft/vscode/pull/245214>、<https://github.com/microsoft/vscode/pull/248286>

## 决策

1. **修正 manifest**：`package.json` 的 `engines.vscode` 由 `^1.80.1` 改为 `^1.100.0`。这是本工单范围内**唯一**的 manifest 字段改动。
2. **同步 lock 镜像**：`package-lock.json` 里 `packages[""].engines.vscode` 是 npm 由 manifest 生成的镜像字段，同步改为 `^1.100.0`，避免锁文件与 manifest 自相矛盾。
3. **不动 `@types/vscode`**：它是编译期类型版本，不构成运行时承诺；本次只修「对外承诺」这一项事实错误。是否提升由后续使用新 API 的需求决定，属于独立决定。
4. **不动 README 徽章**：`README.md` / `README-zh.md` 中的 `VS Code ^1.80.1` 徽章同样已过时，但本工单硬性约束为「不修改 `README*`」，故只登记为待办（见下）。该待办已于合并后由维护者在 `df0fbf3` 中补做完毕。
5. **长期保持 `^1.100.0`，不做回落**（维护者决定，2026-11-07）。即便阶段 4 以 CJS 产出使更低的 VS Code 版本在技术上可行，本项目仍以 1.100.0 作为对外支持下限：ESM 入口是当前代码的真实形态，且旧版本用户此前实际处于「能装不能跑」的静默失效状态，不值得为扩大兼容面而承担回落带来的实测负担与回归风险。阶段 4 若落地，**不得**据此下调 `engines.vscode`；如需变更必须新开决策并更新本 ADR。

   **落地后复核（#17 之后）**：阶段 4 已落地为 `dist/extension.cjs`（CJS），`engines.vscode`
   仍是 `^1.100.0`。本条决策**未变**：CJS 产物没有改变对外承诺，也没有触发任何回落动作。

## 后果

- 正面：安装过滤与激活行为一致；低版本用户会在安装阶段就被告知不支持，而不是装完后「扩展静默失效」。
- 负面：锁定旧版 VS Code 的用户（企业环境、离线环境、某些 Remote 场景）将无法再安装新版本。这是诚实代价，需要在发布说明里讲清楚。
- 影响面：只影响安装门槛，不影响任何运行时行为；`extension.js` 与 `src/` 未改动。

## 待验证项（未确证，写明验证方法）

本 ADR 的版本结论有官方一手来源支撑，但以下事项**未在实机上验证**，不得当作已验证事实引用：

1. **未在 1.80.1 / 1.99 / 1.100 上实际安装本 vsix 并观察激活**。
   验证方法：分别下载 1.99.x 与 1.100.x 的 portable/zip 版本；`code --install-extension vision-smash-code-<ver>.vsix`；打开「输出 → 扩展宿主」或在命令面板执行 `Developer: Show Running Extensions` 观察该扩展状态。预期：1.99 报激活失败（并被 manifest 的 engines 拦下，若用 `--force` 安装则应能看到 `ERR_REQUIRE_ESM` 类错误）；1.100 正常激活。
2. **未验证 web worker 扩展宿主路径**。本扩展依赖 `fs` 写入与 `extensionDependencies`（`be5invis.vscode-custom-css`），先天不面向 vscode.dev/web，故该限制对本项目无实际影响。
3. **未验证 Marketplace 的版本过滤实际表现**（发布后由市场页「兼容性」与安装时校验生效）。
4. **README 徽章**：曾写 `^1.80.1`，已由维护者在 `df0fbf3` 中同步为 `^1.100.0`，与 manifest 一致；该项现已闭合。

## 对阶段 4（esbuild → CJS）的影响

- 规格阶段 4 用 esbuild 输出 **CJS** 单文件，并因仓库声明了 `"type": "module"` 而使用
  「不会被当作 ESM 解析的扩展名」，manifest 的 `main` 同步指向该产物。
  **该阶段已落地**（#17，构建脚本 `build.mjs`）：产物是 `dist/extension.cjs`
  （`format: "cjs"`、`platform: "node"`、`target: "node20"`、`external: ["vscode"]`），
  `package.json` 的 `main` 与 `exports["."]` 均指向它。
- 入口因此**不再依赖 ESM 加载能力**，`engines.vscode` 理论上可以回落到代码实际使用的 API 版本
  （例如 1.80 系列），从而重新扩大兼容面。
- 但这条回落**不是自动的，也没有发生**：`"type": "module"` 仍留在 manifest 中（源码与
  `build.mjs` 都是 ESM），产物扩展名与 `main` 已同步调整，回落仍需重新核对并实测最低版本。
  按「决策」第 5 条，维护者已决定不做回落，因此阶段 4 落地后 `engines.vscode` **仍是
  `^1.100.0`**，与本 ADR 修正前的结论一致。若将来要下调，应当新开决策并更新本 ADR，
  而不是静默修改 `engines`。
- 这也修正了父规格「阶段 4 可绕开该问题」的表述：阶段 4 落地带来的是**构建流程统一**
  （单文件产物、资产目录仍在安装目录里原样分发），而不是兼容面扩大。

## 备选方案（未采纳）

- **保留 `^1.80.1`，在 README 里口头注明「实际需 1.100+」**：对外承诺仍失实，市场页过滤会继续放行低版本用户；文档备注不能替代 manifest 事实。不采纳。
- **立即实施阶段 4（esbuild → CJS）以绕开问题**：超出本工单范围；父规格把阶段 4 定为「可选、低收益」，且引入构建步骤会带来新的行为回归风险。当时不采纳，仅记录其影响。（阶段 4 后来仍由 #17 以「统一构建流程」为目标落地——理由与「绕开 engines 问题」无关，且未据此下调 `engines.vscode`。）
- **手写 CJS 入口（`.cjs` + `require`）替代现有 ESM 入口**：需要重写全部 `import`/`export`，违反「不改代码 / 行为不变」约束。不采纳。
- **把 `engines.vscode` 设成 `>=1.100.0 <2.0.0` 之类的自造区间**：与 `^1.100.0` 语义等价但不符合 VS Code 扩展的常规写法，且 `^` 已足够表达「不低于 1.100.0 的 1.x」。不采纳。
