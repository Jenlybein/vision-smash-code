# ADR-0001：配置注入模块的深度分析（深模块设计评估）

- **状态**：**已实施（部分）** — 原为「提议（Proposed）」。分析结论已作为 Issue #5（父规格）的设计依据落地实施，实施进度见文末「实施记录」。本文正文保留当时的分析原貌，不改写历史判断。
- **日期**：2026-11-07
- **范围**：`extension.js`、`src/install/*-inject.js`、`src/common/utils.js`
- **决策者**：维护者
- **相关文档**：`docs/agents/domain.md`（本仓库为 single-context，ADR 放 `docs/adr/`）、`docs/adr/0002-engines-vscode-and-esm-extension-entry.md`、Issue #5

## 背景

本扩展通过 VS Code 配置驱动 5 类视觉效果（光标拖尾、窗口动效、渐变主题、鼠标尾迹、文字爆炸）。配置变更后，`extension.js` 统一结算，把生成的 JS/CSS 文件路径写入 `vscode_custom_css.imports`，再触发 `extension.updateCustomCSS` 重载。配置值本身由 5 个 `*-inject.js` 模块写进目标文件的 `__AUTO_CONFIG_START__/__AUTO_CONFIG_END__` 标记块，或拼接 CSS 片段。

本次评估使用 `/codebase-design` 的词汇表：**Module / Interface / Implementation / Depth / Seam / Adapter / Leverage / Locality**，并遵循 DEEPENING.md 的依赖分类与接缝纪律。

## 术语约定

本 ADR 中：

- **Interface** 指调用者为正确使用所必须知道的一切（类型签名 + 不变量 + 顺序约束 + 错误模式 + 必需配置 + 性能特征），不只是函数签名。
- **Depth** 是 Interface 上的杠杆，不是实现行数与接口行数之比。
- **Seam** 指 Interface 所在之处；本 ADR 不用「边界」一词。
- **Adapter** 指在 Seam 上满足 Interface 的具体实现，描述角色而非实质。

## 现状评估

### 已经具备深度的部分

`extension.js` 的模块声明表（`modules` + `eventMap` + `changeMap` + 防抖 `flushChanges`）是全仓库最接近深模块的部分：新增一个特效只需增加一条 `{scope, baseKey, api}` 声明，配置监听、`none/reload/switch` 状态机、路径增删与重载结算全部复用。**结论：保留，不要拆分。** 一份实现供养 5 个特效（Leverage），配置语义变化只集中在这一处（Locality）。

### 可加深的机会（按杠杆排序）

#### ① 5 个 `*-inject.js` 是重复的浅模块群

`cursor-inject.js`、`mouse-inject.js`、`word-inject.js` 几乎逐行同构：相同的标记常量、模块级 `targetFilePath`、拼路径的 `init(context)`、「读文件 → 生成配置块 → 正则转义 → 替换或头部插入 → 写回」流程、以及 `GetPath()`。`gradient-inject.js` 与 `animation-inject.js` 又各自复制了 `getCSSFile`。真正值钱的复杂逻辑（转义、幂等替换、首次插入、两种配置块格式差异）被复制了多份。

- **删除测试**：删掉其中一个，复杂度不消失，只在别处继续存在 → 它们没有在挣饭吃，属于透传/重复，应合并。
- **加深形状**：把「生成配置块」与「替换/插入标记块」做成两个**纯函数**（无 fs、无 vscode），I/O 留在薄外层。Interface 由「3 个导出方法 + 隐含顺序约束」收缩到 1~2 个纯函数；实现藏起转义、幂等与格式差异。5 个特效只提供数据（变量名、配置对象、目标路径）。
- **接缝纪律**：变化的是**数据**而非行为，按「一个 Adapter = 假设的接缝；两个 Adapter = 真实的接缝」，**不要**给每个特效引入 port；数据驱动的声明表即可。

#### ② Interface 上的纯负担与隐藏的顺序约束

- `GetPath()` 在 5 个文件中导出，但全仓库无调用者（调用方使用 `init()` 的返回值）→ 可删。
- `StyleConfigUpdate()` 隐含「必须先调用 `init()`」的**顺序约束**，且依赖模块级可变全局 `targetFilePath`。按 Interface 的定义，这是未写进接口的 ordering constraint，测试时也无法隔离。可改为 `init` 返回捕获了路径的对象，或按「接受依赖，不创建依赖」让更新函数接收路径参数。

#### ③ `utils.js` 混合副作用，错误模式未进入 Interface

`AddPaths` 同时做 `fileExists` I/O、弹出错误提示、URI 转换；失败时 `return undefined`（`src/common/utils.js:39`），而 `extension.js:92` 直接把结果传给 `UpdateImports`，未做检查 —— `undefined` 可能被写入全局配置。

建议把「算出下一份 imports 列表」抽成纯函数（如 `planImports(current, {add, remove})` → 返回新数组），配置读写、文件检查、UI 提示挪到外层 adapter。`RemovePaths` 与 `animation-inject.js` 的 `updateDuration` 本身已是纯函数，形状良好，可作为**内部接缝**保留。`RemovePaths` 靠 `path.basename()` 在 URI 字符串与本地路径之间匹配，是一个未文档化的格式不变量，较脆弱，应在 Interface 文档中写明或消除。

#### ④ `flushChanges` 的状态机值得纯函数化

`planChanges(changeMap, baseConfig, modulePaths)` → `{addPaths, removePaths, nextChangeMap}`，无 I/O、可直接测试；提示消息与 `extension.updateCustomCSS` 命令属于真外部依赖，留在最外层。

### 依赖分类与 Seam 位置

| 类别 | 本仓库对应 | 处理方式 |
| --- | --- | --- |
| 进程内纯计算 | 配置块生成、标记替换、`RemovePaths`、`updateDuration`、`planChanges` | 永远可加深，直接在新 Interface 上测，无需 adapter |
| 本地可替换 | Node `fs`、VS Code 配置对象 | 有内存/临时目录 stand-in，可加深；接缝是**内部**的，不暴露到外部 Interface |
| 真外部 | `showInformationMessage`、`extension.updateCustomCSS`（第三方扩展命令） | 薄 adapter 放在最外层，不进深模块 Interface |

**外部接缝应放在「配置值 + 变更意图 → 要写入的文件内容 / 要注入的路径集合」这一层**：纯计算、返回结果；所有 vscode / fs / UI 都在这条缝之外。示意（仅用于把约束具体化，不是最终提案）：

```js
// 纯函数：Interface 的全部
const nextCode = replaceOrInsertBlock(originalCode, renderConfigBlock("mouseConfig", config));
// 副作用留在外面
await writeFile(targetFilePath, nextCode);
```

### 测试策略（replace, don't layer）

- 在新的深模块 Interface 上写测试，断言可观察结果（生成的文件内容、路径集合），不测内部状态。
- 旧的、针对重复浅模块的单元测试在 Interface 测试建立后删除，不叠加。
- 测试应能经受内部重构：若实现一改测试就得改，说明测到了 Interface 后面。

## 决策

**暂不实施。** 本 ADR 仅记录分析结果与加深方向，供后续 `/domain-modeling`、Design It Twice 或重构任务作为输入。实施与否、以及最终 Interface 形状，需另行决定并更新本文件状态。

> **后续更新（2026-11-07）**：维护者决定实施，拆解为 Issue #5 的 12 张子工单（#6–#17），本 ADR 的分析结论已逐项落地。逐条对应关系与偏离说明见文末「实施记录」。

## 后果

- 正面：给后续重构一个明确的、以 Depth / Locality / Seam 为准绳的起点；避免在没有第二个 Adapter 时引入多余 port。
- 负面 / 风险：现状的重复逻辑仍然存在；`AddPaths` 的 `undefined` 回传路径未被修复；`StyleConfigUpdate` 的隐式顺序约束仍可能误导新调用者。

> **后续更新（2026-11-07）**：上述风险已随实施发生变化——`AddPaths` 的 `undefined` 回传已被修复并有回归测试（#12）；`RemovePaths` 未按本文建议「作为内部接缝保留」，而是被删除（详见实施记录中的偏离说明）。`StyleConfigUpdate` 的隐式顺序约束已随 #16 消除（执行层改为显式入参的 `refreshEffect`）。
- 若未来实施：需同时补齐 Interface 文档（顺序约束、错误模式、格式不变量），并把测试迁移到新接缝。

## 备选方案（未采纳）

- **为每个特效定义 port + 多套 adapter**：违反「两个 adapter 才构成真实接缝」，当前只有一种 I/O 行为，属于多余间接层。
- **按特效拆分 `extension.js` 的状态机**：会破坏现有声明表带来的 Leverage 与 Locality，不采纳。
- **把深度理解为「实现行数 / 接口行数」之比**（Ousterhout 式）：本技能明确拒绝，因为会奖励给实现灌水。

## 实施记录（2026-11-07）

本文的四项加深机会对应的落地情况。**这份记录只陈述事实，不重写正文的历史判断。**

### ① 重复的浅模块群 → 已收敛

五个 `*-inject.js` 中重复的「生成配置块 → 转义标记 → 整块替换或头部插入」「读 CSS 片段并拼接」「解析时长占位」逻辑，收敛进 `src/common/refresh-plan.js` 的纯函数 `planRefresh`。

#16 起这五个模块本身也已删除：被抄了五遍的薄执行层（读配置 → 构造描述符 → 调 `planRefresh` → 写盘 → 展示错误）收敛成 `src/install/refresh-effect.js` 一份，每个效果只在 `src/common/effect-descriptors.js` 的数据表里提供作用域、目标路径解析、配置快照与描述符载荷。

接缝形状（与本文第 ③ 项预测的「配置值 + 变更意图 → 文件内容 / 路径集合」一致）：

```
planRefresh({ effects, changeStates, currentImports, readText, fileExists, toImportUri })
  → { writes, imports, nextChangeStates, notices, errors }
```

**两个 Adapter 使其成为真实接缝**：生产环境注入基于 `fs`/`vscode` 的实现，测试注入内存实现——正是本文引用的「两个 adapter 才构成真实接缝」判据。

按本文建议，**未**为每个特效引入 port：特效之间变化的是数据而非行为，统一走描述符 + `kind` 分派（`css-concat` / `marker-block`）。

### ② 接口上的纯负担 → 已移除

- `GetPath()` 从 5 个模块删除（#8），全仓库无残留引用。
- `StyleConfigUpdate()` 的隐式 `init()` 顺序约束**已随 #16 消除**：执行层改为 `refreshEffect(key, extensionPath)`，目标路径与配置快照都是显式入参，不再有"必须先调用 init"的约定，也不再依赖模块级可变全局状态。

### ③ 混合副作用与未声明的错误模式 → 已修复

- `AddPaths` 失败时 `return undefined`、且该值会被直接写入全局配置的缺陷已修复。现在规划阶段对每条待新增路径做「能力存在 → 存在性 → URI 转换」三段校验，任一失败只记 `errors`，`imports` 永远只含非空字符串。有独立回归测试。
- 失败语义明确为：**任一资产缺失 → 该效果整条不产出 `writes`**（避免写出残缺样式表），并一次性列出所有缺失项。

### ④ 可纯函数化的状态机 → 已收敛

`changeMap` 的 `none / reload / switch` 结算逻辑搬进 `planRefresh`，以 `nextChangeStates` 整表返回（全部归 `none`），调用方整表替换。

### 偏离本文建议之处

1. **`RemovePaths` 被删除，而非「作为内部接缝保留」。** 它的唯一调用点已改由 `planRefresh` → `removeOwnedEntries` 承担（该函数原名 `removeByBasename`，收尾评审 F8 收紧判据后改名）；删除后它已无任何调用者，留着就变成本文自己批评过的「接口上的虚假承诺」（与 `GetPath()` 同类）。基元函数保留在 `src/common/import-paths.js` 中作为实现细节。
2. **`updateDuration` 未单独保留为内部接缝**，其能力并入窗口动效的渲染实现（#14）——即
   `css-concat` 的 `duration: true` 片段上做占位替换，判定规则（`Durations[key]` 优先、
   回退 `Default-Duration`、越界按未配置处理、替换成 `<值>ms`）逐条等价。
   **替换范围也必须与重构前一致**：只作用于 `<枚举值>.css`，不作用于 `_Duration.css`
   （见下条）。

### 更正：`Durations` 对四类枚举动画从未生效是**既有缺陷**，本次未修

实施 #14 时曾把 `_Duration.css` 片段也标上 `duration: true`，理由是"占位符实际写在这个文件里，
顺带把没生效的时长配置修好"。这**违反了本工单「行为不变」的硬约束**，已在收尾评审（F3）中回退：

- 重构前 `updateDuration` 只对 `${key}/${setting}.css` 调用，而那些 `<枚举值>.css` 里没有占位符，
  所以替换是空操作；
- 占位符真正所在的 `_Duration.css` 是**原样拼接**的，样式表里始终是资产写死的 `300ms`；
- 于是默认配置（`Durations.Tabs/Active/Scrolling = 200`）下，Tabs / Active / Scrolling 的时长
  一直是 300ms，而不是配置里的 200ms。把它"修好"会让这三类动画真的变快 —— 这是用户可见的行为变更。

结论：该缺陷被**保留**，并登记到「仍未达成」。修复它需要单独的行为变更决策（改 `package.json`
里 `Durations` 的说明文案，或在补丁说明里明确告知用户时长会变），不属于「行为不变」的重构收尾。

### 仍未达成

- `extension.js` 里内容写入仍在 `eventMap` 中即时触发，与 `flushChanges` 的导入结算分离；两者是否合并，需要一个显式的时序决策（见 #14 的注意事项）。
- **`Durations`（以及它的回退 `Default-Duration`）对 `Command-Palette` / `Tabs` / `Active` / `Scrolling`
  四类枚举动画从未生效**（占位符在 `_Duration.css` 里，而替换只作用于 `<枚举值>.css`）。
  重构前后行为一致，本次按「行为不变」硬约束**未修**。同一缺陷还让 `package.json` 中
  `visionSmashCode.animations.Durations` 的说明（"可以为每个动画单独设置时长"）对四类枚举动画不成立，
  该文案同样未改。修复它属于有意的行为变更，需要单独决策。

