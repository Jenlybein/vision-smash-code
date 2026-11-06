# ADR-0003：双注入后端与条目形态

- **状态**：已采纳（Accepted）——结论已落库；`visionSmashCode.loader` 设置项、后端注册表、
  切换清理与运行时可用性检测均已据此实现。
- **日期**：2026-11-07
- **范围**：`src/common/loader-adapter.js`（后端声明与注册表）、`src/install/loader-switch.js`
  （切换清理）、`extension.js`（选择与接线）、`package.json` 的 `contributes.configuration`
  与 `extensionDependencies`。**不涉及**渲染接缝（`refresh-plan.js`）、效果数据表、五个资产目录。
- **决策者**：维护者（工单 #22 的指示：manifest 采用方案 A，即移除 `extensionDependencies`；
  其余结论由实施者按核实到的一手来源整理成文，均已在「核实方法与结论」中标注依据）
- **相关文档**：Issue #22（本工单）、Issue #21（适配层）、Issue #5（父规格，「追加二：双注入后端」）、
  `docs/adr/0001-deep-module-analysis-of-config-injection.md`、`docs/diagnosis/loader-and-effect-failures.md`

## 背景

#21 把「底层加载器」的三件事（配置键、重载命令、路径→条目）收敛到了
`src/common/loader-adapter.js` 的一份声明里。本工单要在这之上同时支持两个后端，由设置项选择：

- `be5invis.vscode-custom-css`（Custom CSS and JS Loader）——**默认**，既有用户行为不得改变；
- `subframe7536.custom-ui-style`（Custom UI Style）——标注实验性。

父规格 #5「追加二」对条目形态给出的建议是：`custom-ui-style` 的裸字符串条目会被当作 ESM 加载，
因此应产出带 `type` 的显式条目对象（`{type:"js", url}` / `{type:"css", url}`）。本 ADR 记录
**核实该建议的结果**、由此产生的实现偏差，以及另外两项必须表态的决定（manifest 与切换清理）。

## 核实方法与结论

依据一律为上游一手来源：已发布版本的 manifest（Open VSX 0.7.2）与仓库源码
（`subframe7536/vscode-custom-ui-style`，`main` = v0.7.2，2026-10-03 发布）。核心文件是
`src/manager/external.ts` 的 `getResourceMeta()`。

### 结论 1：对象条目**只接受 `https://`**，不能用来注入本地文件

`getResourceMeta()` 的对象分支原文：

```ts
} else {
  if (!config.url.startsWith(httpsProtocol)) {
    promptWarn(`[${config.url}] must startsWith '${httpsProtocol}'`)
    return undefined
  }
  return await parseResourceMeta(config.type, new URL(config.url).toString(), fetchURLContent)
}
```

已发布 0.7.2 的 manifest 里，`external.imports` 的对象分支同样写着 `"url"` 的
`"pattern": "^https:\\/\\/"`，描述是「only 'https://' protocol」；字符串分支的 pattern 才是
`^(file://|https://).+\.(css|js)$`。v0.5.9 的同一段代码与判断也一样。

→ 因此 `{type:"js", url:"file:///…"}` **会被静默丢弃**（`promptWarn` 后 `return undefined`，
该条不进入注入）。若照父规格的建议实现，本地文件一个都注入不进去，且用户只会看到一条 warning。
**这条建议在本工单被有意偏离**：适配层为本地文件产出的条目是 `file://` **字符串**。

### 结论 2：本地 `.js` 会被当作 **ES module** 加载

字符串分支的映射是：`.css` → `css`，`.js` → **`js-module`**（不是 `js`）。加载器最终把它们分别
拼进 `external.css` / `external.js` / `external.module.js`，再以
`<script src="./external.module.js" type="module">` 引入。

→ 本扩展的三个 JS 效果是经典脚本，在该后端下会以 ESM 语义执行（严格模式、模块作用域、defer，
且三个文件被拼进**同一个**模块）。这是 `custom-ui-style` 被标注为实验性的直接原因，也是
README 里人工验证步骤要盯的点。**本仓库无法在真实 VS Code 中验证这一点**，故不声称已验证。

### 结论 3：配置键与重载命令

| 事实 | `be5invis` | `custom-ui-style` |
| --- | --- | --- |
| 配置节 | `vscode_custom_css` | `custom-ui-style` |
| 注入列表属性 | `imports` | `external.imports`（该扩展自己用 `getConfiguration("custom-ui-style").get("external.imports")` 读，见其 `src/config.ts`） |
| 重载命令 | `extension.updateCustomCSS` | `custom-ui-style.reload` |
| 扩展 id | `be5invis.vscode-custom-css` | `subframe7536.custom-ui-style` |
| 本地文件条目 | `file://` 字符串 | `file://` 字符串（`.js` → ESM） |

## 决策

### 1. 条目形态差异由适配层吸收，落点是「稳定字符串 id」

- 适配层对内只用**字符串 id**：`readImports()` 把读到的条目归一化成 id，`toEntry(path)` 产出 id。
  因此 `planRefresh` 的 `toImportUri` 契约（必须返回字符串）不需要改动，`import-paths.js` 的
  `basenameKey` / `removeByBasename` 也继续只认字符串——归一化点**落在适配层，不进计划**。
- 适配层对外负责两件事：
  - **写**：`writeImports(ids)` 把整份 id 列表还原成条目。仍然存在的 id 用**原来那条条目**
    （`{type,url}` 不会退化成裸字符串——那会把用户的远端条目从 ESM 换成别的语义），
    只有新增 id 才用声明里的 `fromId` 现造；认不出的条目**一个都不删**，原样追加到末尾。
  - **顺序**：严格按计划给出的顺序（计划用「移除再追加」表达 `reload` 的「重新落到末尾」）。
- 两个现有后端的 `fromId` 都是恒等（本地文件只有字符串形态），差别只在 `toId`
  （`custom-ui-style` 还要认对象条目的 `url`）与三个键名。

### 2. manifest 采用**方案 A**：移除 `extensionDependencies`

`be5invis.vscode-custom-css` 不再写进 `extensionDependencies`，改为运行时用
`vscode.extensions.getExtension(声明里的 extensionId)` 检测。

理由：#21 留下的硬依赖会让「可切换」形同虚设——用户若禁用 be5invis，**本扩展根本不会激活**，
`visionSmashCode.loader` 永远读不到，于是「切到另一个后端」这条路在障碍出现的第一秒就断了。
对现有用户无影响（他们本来就装着 be5invis）；只影响全新安装的用户，用带「安装扩展」动作的
提示补上（错误文案由 `selectLoader` 产出，入口处 `showErrorMessage(message, "安装扩展")`
并跳转到扩展市场搜索）。

代价（如实记录）：全新安装后不再自动获得加载器，需要用户按提示装一个。可接受——它换来的是
「默认值不变 + 后端真的可选」。

### 3. 后端不可用时不写任何配置，并保持旧后端继续工作

- 激活时不可用 → `loader = null`，`flushChanges` 直接返回，不往任何配置键写入。
- **切换**时不可用 → 不改动任何配置，继续用旧后端的适配器，只报错 + 安装指引。
  已经在工作的效果不会因为一次无效切换突然消失；也不会往新后端的配置键写进没人消费的东西。

检测只看「装了没」（`getExtension` 能拿到对象即可），不判断 `isActive`：后端按
`onStartupFinished` 自行激活，激活时机不属于本层。检测能力缺失或抛错时按可用处理（fail-open），
避免把一个装好的环境误判成未安装而彻底停掉效果。

### 4. 切换清理：只按 basename 删除本扩展的条目，失败各自独立

- 删除判据只有一个：`removeByBasename(旧列表, 本扩展的 5 个目标路径)`。用户的其它条目
  （哪怕形态是对象、哪怕我们认不出）都不会被删。
- 清理的三步（读、写、重载旧后端）与新后端写入**各自 try/catch**，每条失败独立上报，
  互不阻断。
- 只有真的改动了旧列表才写回并重载旧后端。**为什么重载旧后端**：两个后端都把内容内联写进
  `workbench.html`，光删配置条目不会撤掉已注入的内容；不刷新的话切换后旧后端的效果会继续生效，
  「切过去验证」就失去意义。重载失败（例如旧后端已卸载、命令不存在）同样只报错、不阻断。
- 已知残留（写进 README 的人工验证步骤）：旧后端自己 patch 过的 HTML 只有它自己的重载/
  卸载命令能撤销；本扩展只替它删条目并请求它重载一次，**不保证**旧内容一定被撤干净。

### 5. 定位（依 #18 的诊断结论归档）

`docs/diagnosis/loader-and-effect-failures.md` 的结论是：新版 VS Code 上「部分效果失效」最可能的
根因在本仓库自己的 JS（脚本在 `document.body` 尚不存在时就 `appendChild`），**不是**旧后端有
不可绕过的限制。因此本工单的定位是**「给用户自主排查与尝新的开关」**，而不是「必要修复」。
这一点也决定了默认值必须留在 `be5invis`：没有证据要求所有人换后端。

## 后果

- 正面：后端差异只存在于一个可测试的适配层；业务代码（`extension.js` 与各执行层）不出现任何
  后端名字面量或配置键——**该承诺由扫描测试保证**，范围见
  `test/loader-adapter.test.mjs`：扫描 `extension.js` 与 `src/install/**`、`src/common/**` 下的
  模块，字面量清单 `BACKEND_NAME_LITERALS` / `LOADER_LITERALS` 就在该文件里，适配层是唯一豁免；
  切换不会碰用户自己的注入项；缺后端有可操作提示。
- 负面：默认后端仍是 `be5invis`，`custom-ui-style` 上的 JS 效果**可能真的不生效**（ESM 语义），
  这是该后端的固有限制，不是本仓库的实现缺陷；在没有第三方修复前，文档只能如实标注实验性。
- 影响面：`package.json` 只动 `contributes.configuration` 与 `extensionDependencies`；
  `src/`、`extension.js`、测试、README 有改动；`engines.vscode`、`main` / `scripts` /
  `devDependencies` / `.vscodeignore` **未改动**（后者属并行工单 #17）。

## 未验证项（不得当作已验证事实引用）

本仓库环境无法启动扩展宿主，以下全部**未验证**：

1. `custom-ui-style` 上五个效果的真实表现（尤其三个 JS 效果作为 ESM 能否执行）。
2. 切换后端后旧后端 `workbench.html` 里的注入内容是否被旧后端自己的重载命令撤干净。
3. 真实 VS Code 里 `vscode.extensions.getExtension()` 对「已安装但被禁用」的扩展返回什么
   （本实现只把它当作「可用性参考」，被禁用时预计会走到「未安装或未启用」的提示分支，
   但未实测）。

人工验证步骤见 `README.md` / `README-zh.md` 的「Choosing the injection backend /
选择注入后端」一节，摘要：

1. 安装并启用 `Custom UI Style`（0.7.2）。
2. 把 `visionSmashCode.loader` 改为 `custom-ui-style`，按提示重载窗口。
3. 检查 `settings.json`：`custom-ui-style.external.imports` 出现已启用效果的 `file://…` 条目；
   `vscode_custom_css.imports` 里本扩展的条目被移除，**用户自己的条目仍在**。
4. DevTools Console 观察三个 JS 效果是否加载/报错。
5. 切回 `be5invis`，确认效果恢复。

## 备选方案（未采纳）

- **产出 `{type, url}` 对象条目**（父规格建议）：被结论 1 否证，`file://` 会被静默丢弃。不采纳。
- **保留 `be5invis` 为硬依赖（方案 B）**：只用新后端的用户被迫安装旧后端，且禁用旧后端会让本
  扩展无法激活。不采纳。
- **把两个后端的差异做进业务代码（if/else 分支）**：违反 #21 的收敛目标，也不满足
  「业务代码不得出现后端名字面量」。不采纳。
- **切换时调用旧后端的卸载命令**：`be5invis` 的卸载会删掉它自己 patch 过的 HTML 备份，副作用
  远大于「删条目 + 重载」。不采纳。
