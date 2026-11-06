# 诊断：新版 VS Code 上「部分效果失效」的根因分析

- **状态**：调查完成，结论分级（已确证 / 高度可疑 / 未确证）
- **日期**：2026-11-07
- **关联**：Issue #18（本诊断）、Issue #1、Issue #2（用户报障）、Issue #4（旁证）、Issue #5（父规格）、PR #3（提议更换底层加载器，本诊断**不评论、不修改**）
- **范围**：只做静态分析与上游取证。**未修改任何产品代码、测试或 `package.json`。**
- **诚实声明**：本次调查**没有**可用的真实 VS Code 实例去复现，也**没有**安装扩展实测。凡未实际执行的验证一律标为「未确证」，文末给出可执行的人工验证步骤。
- **行号时点**：文中源码行号以**合并 `refactor/injection-seam`（含 #13「marker-block 渲染」迁移）之后**的代码为准。上游（VS Code / 加载器）的行号以 2026-11-07 抓取到的主干源码为准，会随上游变动；引用时请以内容为准，不要只信行号。
  **注意**：文中多处引用的 `src/install/{cursor,mouse,word,gradient,animation}-inject.js` 与
  `src/common/utils.js` **已在 #16 的重构中删除**（收敛为 `src/install/refresh-effect.js` +
  `src/common/effect-descriptors.js` + `src/common/refresh-plan.js`）。这些引用及其行号**仅指当时状态**，
  保留原样是为了不改写诊断记录本身；现在的对应关系见文末「代码位置对照」。

---

## 结论摘要

1. **最可能的根因不是「VS Code 变新了」，而是「底层加载器的注入点从 `<html>` 末尾搬到了 `<head>`」。**
   加载器 `be5invis/vscode-custom-css` 自 **7.5.0**（提交 `d35c9ac6`，2026-05-19，PR #281）起，把注入内容从 `</html>` 之前改到 `</head>` 之前。
   本仓库三个 JS 效果（光标 / 鼠标尾迹 / 文字爆炸）在脚本**顶层**立即 `new` 出渲染器，构造函数里**无条件**执行 `document.body.appendChild(canvas)`。
   内联 `<script>` 位于 `<head>` 中时，解析器尚未遇到 `<body>`，`document.body` 为 `null` → `TypeError` → 整个脚本终止 → 效果消失。
   **CSS 效果没有 DOM 依赖（内联 `<style>` 不需要走 `appendChild`），因此照常生效。**
   这与 issue #2「CSS 正常、两个 JS 不加载」、issue #4「1.134.0 上窗口动效仍在生效」、issue #1「别的功能都好」三条现象完全自洽。
   **置信度：中高（约 70%）。分级：高度可疑**（静态证据链完整，缺一次运行期确认）。

2. **issue #1 的两个症状是 CSS 选择器脆弱，与 JS 加载问题无关（独立成因）。**
   `top-active-tab.css` 用 **6 个类名串联**的硬与选择器；其中 `has-icon`、`tab-actions-right`、`tab-border-top` 在 VS Code 源码里都是**条件性添加**（取决于设置与主题颜色），任一缺失整条规则失效且无任何报错。
   `horizontal.css`（「鼠标拖轨」）同样是深链选择器，且该效果在 manifest 中**默认关闭**并自带「(buggy) / 存在BUG」描述。
   **置信度：中（约 60%）。分级：高度可疑。**

3. **CSP 不是当前的主嫌，但它是一个「症状完全相同」的历史性隐患。**
   2023 年加载器 issue #189 记录过一模一样的不对称失效：VS Code 的 CSP 里 `script-src` 没有 `'unsafe-inline'`，而 `style-src` 有 —— 于是内联 `<style>` 生效、内联 `<script>` 被拒。加载器的修法是**用正则把 CSP meta 整个删掉**，该正则至今仍在代码里。我**已实际执行**过一次静态匹配：该正则对当前 `microsoft/vscode` 主干的 `workbench.html` 仍然匹配成功（能删掉 1094 字符的 meta）。所以**目前没有证据表明 CSP 正在生效**；但这条正则一旦因 VS Code 改写 meta 的序列化形式或改为响应头下发而失效，就会复现「CSS 好、JS 死」——它必须留在观察项里。

4. **「是否需要更换底层加载器」：当前证据不支持「必须更换」。**
   见文末专章。核心论点：最强假设的修复点在**本仓库自己**（效果脚本不应假定 `document.body` 已存在），换依赖只能**碰巧掩盖**，不能消除根因；而且换依赖会同时改掉 5 类效果的注入语义。是否更换应等「未确证」项验证完再决定。

---

## 证据

### A. 注入链路的结构性差异（代码 + 加载器源码，已确证）

加载器做的是**内联**，不是 `<script src>`：`src/extension.js` 里的 `patchHtmlForItem()` 读文件内容后按扩展名拼标签。

```js
if (ext === ".css")      return `<style>${fetched}</style>`;
else if (ext === ".js")  return `<script>${fetched}</script>`;
else throw new Error(`Unsupported extension type: ${ext}`);
```

（来源：`be5invis/vscode-custom-css` `master` 的 `src/extension.js`，`patchHtmlForItem`；`README.md` 亦有「CSS/JS files being applied will be inlined into VSCode's workbench」（自 6.0 起））

| 维度 | 两个 CSS 类效果（渐变 / 窗口动效） | 三个 JS 类效果（光标 / 鼠标 / 文字） |
| --- | --- | --- |
| 目标文件 | `src/gradient-theme/gradient-theme.css`、`src/vscode-animations/Vscode-Animations.css` | `src/neovide-cursor/neovide-cursor.js`、`src/mouse-tail/mouse-tail.js`、`src/word-exploder/word-exploder.js` |
| 内容生成 | 静态 CSS 片段拼接（`gradient-inject.js:9-18`、`animation-inject.js:30-66`） | 把**自身资产文件**读进内存、替换/插入配置块后**覆写原文件**（`mouse-inject.js:54-113`、`word-inject.js:82-163`；光标已由 #13 迁到 `planRefresh` 的 `marker-block` 渲染：`cursor-inject.js:77-113` + `refresh-plan.js:339-401`） |
| 写入位置 | 仓库内 CSS 资产 → 写入同名目标文件 | 仓库内 JS 资产 → 原地覆写（即"改自己的安装文件"） |
| 加载器生成的标签 | `<style>…</style>` | `<script>…</script>`（经典脚本，非 module、非 IIFE） |
| 运行期依赖 | 无（样式表不需要 DOM） | **有**：脚本顶层立刻 `new`，构造函数直接 `document.body.appendChild(canvas)` |
| 失败时的可见信号 | 选择器不匹配 → 静默无效果 | `document.body` 为 null → 抛 `TypeError` → 脚本终止（有控制台报错） |

源码定位：

- `src/neovide-cursor/neovide-cursor.js:539` → `new GlobalCursorManager();`（顶层立即执行）
  - `:332` `document.createElement("canvas")`
  - `:351` `document.head.appendChild(style)`（这一步在 head 里也能成功）
  - `:363` **`document.body.appendChild(this.canvas);`**（无 null 保护）
  - `:393` `observer.observe(document.body, …)`（同上）
- `src/mouse-tail/mouse-tail.js:248` → `new MousePointerTrail();`；`:153` **`document.body.appendChild(this.canvas);`**
- `src/word-exploder/word-exploder.js:356` → `new CursorExplosionEffect();`；`:250` **`document.body.appendChild(this.canvas);`**
- 全仓库检索确认：三个文件里**没有** `document.readyState`、`DOMContentLoaded`、`document.body &&` 之类的保护（`grep` 无匹配）。

### B. 注入点变更：`<head>` vs `</html>`（上游提交，已确证）

PR #281（提交 `d35c9ac6`，2026-05-19，标题 `fix: inject CSS into <head> for auxiliary window support (#281)`）的 diff 直接改掉了注入锚点：

```diff
- html = html.replace(/(<\/html>)/, … + injectHTML + … "</html>");
+ html = html.replace(/(<\/head>)/, … + injectHTML + … "</head>");
```

它的动机是「副窗口（New Chat Window）会克隆 `<head>`，注入到 `</html>` 之前则副窗口拿不到样式」。副作用没有被评估：**JS 也一起被搬进了 `<head>`**。

与之配套的上游事实：

- `d35c9ac6` 处 `package.json` 的 `version` 为 **7.5.0**；同日随后一次提交（`fca4a2f7`）bump 到 **7.5.1**（当前 master 亦为 7.5.1）。
- 该提交之前的锚点是 `</html>`，在 `workbench.html` 里位于 `<body>` 之后。

对照当前 VS Code 的 `workbench.html`（`microsoft/vscode` 主干，`src/vs/code/electron-browser/workbench/workbench.html`，已实际抓取并逐行确认）：

```
 4: <head>
 7:   http-equiv="Content-Security-Policy"
27:     script-src …
74: </head>
76: <body aria-label="">
77: </body>
80: <script src="./workbench.js" type="module"></script>
82: </html>
```

即可得三个可直接推理的结论：

1. 注入点从第 82 行搬到第 74 行之后，内联脚本的执行时刻从「`</body>` 之后」变成「`<body>` 出现之前」。
2. 经典内联脚本在解析期**同步执行**；`<body>` 尚未被解析 → `document.body === null`。
3. 第 80 行是 `type="module"`（天然 defer），所以「脚本先于 workbench 主程序执行」这一点新旧版本一致——**变化的是 body 存不存在，不是先后**。

### C. 配置块 `/* __AUTO_CONFIG_START__ */ const xxx = {...};` 是否影响执行（静态结论）

**结论：静态上不会破坏语法，也不是「新版 VS Code 特有」的失效原因；但它有 3 条能在特定输入下彻底毁掉脚本的现实路径。**

不构成问题的一面：

- 内联到 `<script>` 里的顶层 `const` 是**经典脚本的全局词法声明**（不进 `window`，但同一脚本内按词法作用域可见）——三个文件都在同一脚本内引用自己的 `cursorConfig` / `mouseConfig` / `explosionConfig`，不跨脚本，因此合法。
- `JSON.stringify` 生成的块（光标：`refresh-plan.js:380-381`）与字符串拼接生成的块（`mouse-inject.js:64-93`、`word-inject.js:92-141`）都产出合法对象字面量；正则替换只替换第一个标记块，重复调用幂等。
- 该机制在本仓库长期存在，**不随 VS Code 版本变化**，因此无法解释「新版才失效」。

三条真实风险路径（都只在特定输入下触发，故不列为主因）：

1. **替换字符串里的 `$` 语义**：`originalCode.replace(markerRegex, configBlock)` 把配置块当作**替换模式**，其中 `$&`、`` $` ``、`$'`、`$1`、`$$` 会被解释。默认配置里没有 `$`，但用户把颜色/字体设成含 `$` 的字符串时，写回内容会被破坏（可能重复插入文件尾部 → 语法错误）。
   **现状**：光标这条路径已由 #13 改成函数式替换（`refresh-plan.js:395-398`，`replace(markerRegex, () => block)`），该风险对光标已消除；`mouse-inject.js:105`、`word-inject.js:155` 仍是字符串替换，风险仍在。
2. **未转义的字符串插值**：`mouse-inject.js:67-70`、`word-inject.js:96-98,107,137` 把设置值直接塞进 `"…"` 里。用户的 `fontFamily` / `fontWeight` / `mode` / `colors[]` 只要含 `"` 或 `\`，生成的 JS 就不合法 → **整个效果脚本 SyntaxError**。光标因为走 `JSON.stringify` 不受影响。
3. **重复标记块 → 重复声明**：若文件里出现两个 `__AUTO_CONFIG_START__` 块（历史残留、手工编辑），`replace`（非全局）只换第一个，剩下的产生 `const cursorConfig` 二次声明 → `SyntaxError: Identifier 'cursorConfig' has already been declared`。这是**被显式保留**的行为（`refresh-plan.js:383-389` 的注释写明「第二处原样保留，与迁移前一致」），迁移并未消除它。同理，若同一份 JS 在 `vscode_custom_css.imports` 里出现两次，第二个内联 `<script>` 会被这条规则打死（本仓库 `src/common/import-paths.js` 的 basename 去重可以避免自己写重复，但不阻止用户手工添加）。

### D. CSP / 脚本加载策略（历史已确证，当前未确证）

- **历史事实（已确证）**：加载器 issue #189「Inline Scripts are not executing due to updates VS code made to the security policy」贴出了当时 workbench 的 CSP 与浏览器报错：
  - `script-src 'self' 'unsafe-eval' blob:`（无 `'unsafe-inline'`）→ 内联脚本被拒；
  - `style-src 'self' 'unsafe-inline'` → 内联样式**放行**。
  - 报错原文：`Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'unsafe-eval' blob:"`。
  - 同类现象另见 issue #190「custom.css loads but custom.js doesn't」。
- **加载器的应对（仍在代码里）**：`html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, "")` —— 直接把 CSP meta 删掉。
- **本次实际执行的静态检查**：我用 Node/PowerShell 对该正则匹配了 `microsoft/vscode` 主干 `workbench.html` 原文，**匹配成功**（匹配长度 1094 字符，覆盖了从 `<meta` 到 `/>` 的整段，包含 `require-trusted-types-for 'script'`）。因此**没有证据表明 CSP 现在正在拦截**。
- **需要注意的新变量（未确证）**：当前 CSP 里已经出现 `require-trusted-types-for 'script'` 与一串 `trusted-types` 白名单。它随同一个 meta 一起被删，眼下无影响；但如果将来 VS Code 把 CSP 改为**响应头下发**（HTML 里删不掉）或改写成该正则匹配不到的序列化形式，症状就会精确复现为「CSS 好、JS 死」。这条必须留作长期观察项。
- 另有一条与「加载器能否工作」有关的旁证：加载器用 `require.main.filename` 或 `globalThis._VSCODE_FILE_ROOT` 定位安装目录，并按 `electron-browser/workbench`（1.102+）/ `electron-sandbox/workbench`（旧）等候选路径找 `workbench.html`。**本次已确证该路径与当前上游源码结构一致**（`src/vs/code/electron-browser/workbench/workbench.html` 存在，`electron-sandbox` 路径已 404）。

### E. issue #1 的两个症状（CSS 选择器，独立成因）

`src/gradient-theme/css/adaptive/top-active-tab.css`：

```css
.tab.tab-actions-right.sizing-fit.has-icon.tab-border-top.active { … }
.tab.tab-actions-right.sizing-fit.has-icon.tab-border-top.active:after { … }
```

**6 个类名硬串联**，任一不符 → 整条规则静默失效（CSS 不会报错）。VS Code 源码里这些类名的产生条件：

| 类名 | 产生条件（`src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts`） | 是否恒定 |
| --- | --- | --- |
| `tab` / `active` | 基础类 / `classList.toggle('active', isActive)`（:1897） | 是 |
| `sizing-fit` | `classList.toggle(\`sizing-${option}\`, tabSizing === option)`（:1802），取决于 `workbench.editor.tabSizing` | 取决于设置 |
| `tab-actions-right` | `classList.toggle(\`tab-actions-${option}\`, …)`（:1786），取决于 `workbench.editor.tabActionLocation` | 取决于设置 |
| `has-icon` | `classList.toggle('has-icon', options.showIcons && options.hasIcons)`（:1805） | **条件性**（关掉图标即消失） |
| `tab-border-top` | `classList.toggle('tab-border-top', !!tabBorderColorTop)`（:1929），取决于主题是否给了 `tab.activeBorderTop` 颜色 | **条件性** |

即：这不是「新版 VS Code 把类名改了」那么简单的结论；更准确的说法是**该选择器把自己绑死在 5 个可变条件同时成立的交叉点上**，其中 2 个还取决于用户的主题与设置。任何一次主题切换、设置调整或 VS Code 对 tab 内部结构（现有 `.tab-border-top-container`、以及 2026 年新增的 `modern-ui-tabs` / `.tab-fill` / `connected-tab-*` 分支）的调整，都会让它「无声消失」。

`src/gradient-theme/css/adaptive/horizontal.css`（「鼠标拖轨 / 水平拖动条」）：

```css
.monaco-scrollable-element .split-view-view .monaco-grid-branch-node .monaco-sash.horizontal
```

同样是 4 层祖先链 + 2 个状态的硬链。类名本身在上游仍存在（`src/vs/base/browser/ui/grid/gridview.css:13` 有 `.monaco-grid-branch-node`；`src/vs/base/browser/ui/sash/sash.css`、`src/vs/base/browser/ui/splitview/splitview.css` 有 `.monaco-sash`），但**祖先链形状**（谁在谁里面）属于 VS Code 内部布局实现细节，没有契约。2026-11 起上游还在新增 `src/vs/workbench/browser/parts/partGrid/`（提交 `7ea5245e`，`part-grid-gap-sash` 类），说明布局层的 DOM 仍在演进。

另外一条被忽略的事实：**该效果默认关闭**，manifest 描述写着 `Enable horizontal drag bar gradient (buggy)` / `启用水平拖动条渐变 (存在BUG)`。报障者若未打开 `visionSmashCode.gradient.horizontal`，看到的就是「不生效」——这与选择器问题会给出**完全相同的视觉结果**，必须先区分。

### F. 两类失败必须分开看（可判别的特征）

| | 「本扩展写文件 / 写配置失败」 | 「加载器没把内容加载进去」 | 「加载进去了但执行失败」 |
| --- | --- | --- | --- |
| 触发点 | `mouse/word-inject.js` 的 `没找到目标文件` 抛出、`fs.writeFileSync` 的 EACCES/EPERM、`workspace.getConfiguration().update()` 被无效 `settings.json` 拒绝（光标路径已由 #13 改为 `errors` 通道，不再抛出） | 加载器定位不到安装目录、patch 未执行、VS Code 升级后 patch 被覆盖 | 内联脚本抛错（如 `document.body` 为 null） |
| `vscode_custom_css.imports` | **缺条目** | 条目齐全但无效 | 条目齐全且有效 |
| 工作台 `workbench.html` | 无 `VSCODE-CUSTOM-CSS-START` 标记 | 无标记，或标记里没有对应标签 | 标记在、内容在 |
| CSS 效果 | 一起失效（内容也没写） | 一起失效 | **正常** |
| 用户可见信号 | 通常**无弹窗**：`eventMap[key]()` 在 `onDidChangeConfiguration` 里同步调用，抛错会中断该处理器，`flushChanges` 的防抖定时器**不会被设置**（见 `extension.js:144-155`），于是配置根本不写、也不提示（鼠标/文字仍如此；光标自 #13 起会走 `showErrorMessage`，`cursor-inject.js:108-112`） | 加载器会弹 `unable to locate …` / `cannot load` 类消息 | DevTools 控制台有 `Uncaught TypeError` |
| 典型处置 | 看扩展宿主日志 + `settings.json` | 重跑 `Reload Custom CSS and JS` | 改效果脚本的初始化时序 |

**这次两个报障都属于第三列**（CSS 正常 ⇒ patch 存在、imports 生效 ⇒ 加载器工作正常），这一点是后面「不需要换加载器」判断的关键前提。

### G. 反面证据的处置（为什么它们排除了另外三种假设）

| 反面证据 | 排除的假设 |
| --- | --- |
| `be5invis/vscode-custom-css` 2026-10-19 仍有提交、`archived=false`、开放 issue 仅 1 个（#140「Publish extension on OpenVSX」，2021 年创建，与失效无关） | 「已停止维护」→ **不成立**。已用 GitHub API 实测确认这三项。 |
| issue #4 报障者 VS Code **1.134.0** 上「窗口动效」仍生效（否则不会有动效冲突） | 「新版整体失效」→ **不成立**。CSS 类效果在新版上确实工作。 |
| issue #1「别的功能都好」、issue #2「css 文件可以正常加载，效果正常」 | 「加载器挂了 / patch 被覆盖」→ **不成立**（见 F 表第三列）。 |
| 上游 issue #273 / #266 / #275 显示：加载器历史上确有「新版不工作」「找不到 workbench.esm.html」的整批失效报告，且都被修掉或随版本自愈 | 「新版一定跑不起来」不是稳定结论；整批失效的表现形如**全部效果一起失效**，与本工单「部分失效」不同。 |

---

## 分档判定

### 已确证（静态可复核，不依赖实机）

1. 三个 JS 效果在脚本顶层立即实例化，构造函数**无条件**执行 `document.body.appendChild(canvas)`，无 null 保护。（`neovide-cursor.js:539/363`、`mouse-tail.js:248/153`、`word-exploder.js:356/250`）
2. 加载器 7.5.0（`d35c9ac6`，PR #281）把注入锚点从 `</html>` 改到 `</head>`；当前版本 7.5.1 仍如此。
3. 加载器是把文件内容**内联**成 `<style>` / `<script>`，用 URL 路径扩展名 `.css` / `.js` 分派，其它扩展名会被静默跳过（只弹 warning）。
4. 当前 VS Code `workbench.html` 中 `</head>` 在 `<body>` 之前，且 `workbench.js` 是 `type="module"`（放在 `</body>` 之后）。
5. 因此「`<head>` 中的经典内联脚本执行时 `document.body === null`」是可从 HTML 解析语义直接推出的事实。
6. CSS 注入路径完全不触碰 `document.body`，故不受第 1、2 条影响 —— 这就是「CSS 好、JS 坏」不对称的机制解释。
7. 加载器至今**没有**任何 issue 报告「CSS 正常但 JS 不加载」用于 7.5.x（已翻查全部 issue 列表与关键词搜索：只有 2023 年的 #189 / #190）。→ 这是**新**回归，尚未被上游察觉。
8. CSP 剔除正则对当前上游 `workbench.html` **仍然匹配**（本次实际执行的正则匹配；匹配长度 1094）。
9. 当前 CSP 中 `script-src` 无 `'unsafe-inline'`、`style-src` 有 `'unsafe-inline'`（历史 #189 的机制仍具备「只杀 JS」的能力）。
10. `top-active-tab.css` 的 6 类名中，`has-icon`、`tab-border-top` 在 VS Code 源码中为**条件性**添加；`sizing-fit`、`tab-actions-right` 取决于用户设置。
11. `gradient.horizontal`（鼠标拖轨）在 manifest 中**默认关闭**，且描述自承 `(buggy)`。
12. 本仓库 `.vscodeignore` 未排除 `src/`，三个 JS 资产会随扩展发布 → 「目标文件缺失」不是 #2 的成因（`mouse-inject.js:55` / `word-inject.js:83` 的 `没找到目标文件` 路径可排除；光标路径在 #13 后已改走 `errors` 通道）。
13. CSS 能生效 ⇒ 加载器已成功定位并写入 `workbench.html` ⇒ #2 的 `vscode_custom_css.imports` 里至少 CSS 条目存在且可用。

### 高度可疑（证据强但缺运行期确认）

1. **#2 的根因 = `<head>` 注入导致 `document.body` 为 null，三个 JS 脚本在初始化阶段抛 `TypeError` 后整体终止。** 与 #1「别的功能都好」、#4「新版仍有 CSS 动效」、#2「CSS 正常 JS 不加载」三条现象全部自洽；也是唯一能同时解释「只有 JS 类效果失效」的机制。**置信度 ~70%。**
2. **#1 的「顶部标签页渐变不生效」= CSS 选择器过脆**（6 类名硬串联 + 两个条件性类名），而非 JS/CSP 问题。直接证据是「别的功能都好」，间接证据是类名的条件性。**置信度 ~60%。**
3. **#1 的「鼠标拖轨不生效」= 该效果默认关闭 + 深链选择器脆弱**（或它其实指的是 `mouse-tail.js`，见文末歧义说明）。**置信度 ~50%。**
4. **#4 报障者仍在 1.134.0 上看到「窗口动效」**，说明 CSS 注入在新版上工作正常，因此任何「新版整体失效」的叙事都不成立——这条同时是 #2 结论的支撑证据。

### 未确证（必须实机验证，不得当成已知事实引用）

1. 报障者（#1 / #2）实际安装的加载器版本是否 ≥ 7.5.0。**若 < 7.5.0，则高度可疑第 1 条当场被推翻**（并转而怀疑 CSP 或配置块损坏）。
2. #2 报障者的 VS Code 版本与其 DevTools 控制台是否真有 `Cannot read properties of null (reading 'appendChild')`。
3. 1.134.0 发布版**实际安装目录内**的 `workbench.html` 是否与上游源码一致、CSP meta 是否被成功剔除（本次只匹配了仓库源码，没匹配发行产物）。
4. 加载器 7.5.0 / 7.5.1 是否已发布到 Marketplace 并被用户侧自动更新（仓库里只能看到版本号，无 release 记录）。
5. #1 报障者的 `visionSmashCode.gradient.horizontal` 与 `top-active-tab` 两个开关的实际取值；其主题是否提供 `tab.activeBorderTop` 颜色；是否开启了 `workbench.editor.showIcons`。
6. 三个 JS 资产文件当前的注入结果里，配置块是否只有一份（无重复标记块），内容是否可被 JS 解析。
7. 「鼠标拖轨」到底指 `gradient.horizontal`（水平拖动条）还是 `visionSmashCode.base.mouse`（鼠标尾迹）——issue 文本有歧义，只能靠追问或看其设置确认。

---

## 是否需要更换底层加载器

**结论：当前证据不支持「必须更换」，因此本工单的答案是「不需要更换」，并且反对用更换来替代修复。**

理由（按权重排序）：

1. **最强假设的修复点在本仓库，不在加载器。**
   「脚本在 `document.body` 尚未存在时就 `appendChild`」是本仓库自己的健壮性缺陷。任何加载器只要把 JS 注入 `<head>`（7.5.x 为了副窗口样式克隆已经这么做了，将来的加载器同样会因为类似动机这么做）都会踩中它。在**本仓库**修（等 body / 用 `DOMContentLoaded` / 挂到 `document.documentElement`）是一次性、可测试、对用户透明的修复；换加载器只是换一个「今天恰好注入到 body 末尾」的实现，把同一个坑留给下次。
2. **反面证据已经否决了「换依赖」的前提。** PR #3 的动机写的是「旧依赖已停止维护、在 ≥1.80 全部失效」，而实测：仓库 2026-10-19 仍有提交、`archived=false`、开放 issue 仅 1 个；issue #4 的 1.134.0 上动效仍生效。前提失实，结论自然不能采纳。
3. **部分失效的现象本身就否证了「加载器整体不可用」。** CSS 能进去 ⇒ 定位、备份、patch、写盘四步都成功。
4. **换依赖不是薄改动。** 它同时改变 5 类效果的内容形态、配置键名（`vscode_custom_css` → `custom-ui-style`、`imports` → `external.imports`）、重载命令与失败语义；PR #3 另有三个实现缺陷（初始化检测恒为真、路径与 URI 类型不匹配、`switch` 分支不再触发重载）且零测试。父规格 #5 已把「抽取加载器适配层」单列为 #21，正是为了让这件事在**有测试兜底**时再做。
5. **仍有尚未验证的替代假设（CSP）。** 如果验证结果显示真正的失败是 CSP 未剔除，那需要的是「与上游一起修剔除逻辑」或「在适配层里做更健壮的剔除」，而不是换一家同样依赖「删 CSP meta」的加载器。

**什么时候才应该重新考虑更换**：完成下方验证步骤后，若发现失败与 `<head>`/body 无关、而是加载器在 1.13x 上**结构性**失效（例如上游把 CSP 改成响应头、或 workbench 结构改为不再有可 patch 的 HTML），则换加载器/自研注入才具备依据。届时也应先走 #21 的适配层，让更换成为可测试的薄改动。

---

## 验证方法（针对每条「未确证」）

> 全部需要在**真实 VS Code** 上操作。本次调查**没有**执行其中任何一步。

### V1 —— 确认加载器版本与 VS Code 版本（对应未确证 1、2、4）

1. 在出问题的机器上执行：`code --version`（或在「帮助 → 关于」里读 Version / Electron / Chromium 三行）。
2. 命令面板 → `Extensions: Show Installed Extensions` → 找 `Custom CSS and JS Loader` → 记下版本号（关注是否 ≥ 7.5.0）。
3. 结论判读：
   - 版本 **< 7.5.0** 且 JS 正常 → 与高度可疑第 1 条矛盾，转去查 CSP（V4）与配置块（V5）。
   - 版本 **≥ 7.5.0** 且 JS 不工作 → 继续 V2/V3，几乎可定案。

### V2 —— 看控制台有没有 null-body 报错（对应未确证 2）

1. 打开 VS Code → 命令面板 → `Developer: Toggle Developer Tools` → 切到 **Console**。
2. 重跑一次加载器命令：命令面板 → `Reload Custom CSS and JS`，确认后 `Restart`。
3. 在 Console 里找 `Uncaught TypeError: Cannot read properties of null (reading 'appendChild')`，并把折叠的调用栈展开，确认栈顶来自 `neovide-cursor.js` / `mouse-tail.js` / `word-exploder.js` 的 `init()`。
4. 在同一 Console 里执行两条探针：
   - `document.querySelectorAll('canvas').length` —— 预期为 **0**（canvas 从未被挂上）；
   - `[...document.head.querySelectorAll('style')].some(s => s.textContent.includes('cursor-trail'))` —— 若为 **true**，说明脚本**已经开始执行**（`neovide-cursor.js:351` 那步成功），死在 `:363`，即可把 CSP 假设与「脚本根本没跑」的假设一起排除。
5. 判读：栈顶落在 `appendChild` + head 里有残留 style + 0 个 canvas ⇒ **高度可疑第 1 条升级为确认**。

### V3 —— 区分「执行失败」与「CSP 拦截」（对应未确证 3）

1. 用 V2 的 Console 过滤 `Refused to execute inline script` / `Content Security Policy`。
   - 出现该报错且 V2 的 style 探针为 **false**（连 `document.head.appendChild(style)` 都没发生） ⇒ 是 **CSP 拦截**，不是 body 时序问题。
   - 无 CSP 报错、style 探针为 true ⇒ 是时序问题（V2 结论成立）。
2. 直接看产物：打开 `<VS Code 安装目录>/resources/app/out/vs/code/electron-browser/workbench/workbench.html`（macOS 为 `…/Visual Studio Code.app/Contents/Resources/app/out/…`；Linux 为 `/usr/share/code/resources/app/out/…`），搜索：
   - 是否还有 `<meta http-equiv="Content-Security-Policy"` —— 有 ⇒ CSP 剔除失败；
   - 是否有 `<!-- !! VSCODE-CUSTOM-CSS-START !! -->` —— 无 ⇒ 加载器没 patch（此时 CSS 也不该生效，可交叉验证）；
   - 标记块里是否同时有 `<style>` 与 `<script>` —— 只有 `<style>` ⇒ 我们的 `imports` 里少了 JS 路径（转向 F 表第二列）。

### V4 —— 复现「head 注入必然失败」这个机制（对应未确证 1、3）

1. 任选一版 VS Code（1.13x 任一），安装加载器 **7.5.1**，只启用一个 JS 效果（例如 `visionSmashCode.base.cursor`）。
2. 按 V2 看控制台 → 预期出现 null-body 报错（复现）。
3. 把加载器**回退到 7.4.x**（`Extensions: Install Specific Version…` 或手工装旧 vsix），重新 `Reload Custom CSS and JS` + `Restart`，其它条件不变。
4. 判读：7.4.x 上光标效果恢复、7.5.x 上消失 ⇒ 「注入点变更」是唯一变量，**高度可疑第 1 条闭合**。若两版都失败，则该假设被推翻，转向 CSP / 配置块。

### V5 —— 检查配置块是否被写坏（对应未确证 6）

1. 打开扩展安装目录下的三个 JS 资产（`~/.vscode/extensions/gentlybeing.vision-smash-code-<ver>/src/…`）。
2. 在文件首部搜索 `__AUTO_CONFIG_START__`，**确认只出现一次**；块内 `const … = { … };` 必须能被解析。
3. 最直接的机检：`node --check <文件路径>`（`node --check` 只做语法解析，不执行，不需要 DOM）。三条文件都应无输出。
4. 若出现 `SyntaxError`，再检查用户设置里是否含 `"` / `\` / `$`（对应证据 C 的 3 条风险路径）。

### V6 —— 判定 #1 到底是选择器问题还是开关问题（对应未确证 5、7）

1. 在 `settings.json` 里核对：`visionSmashCode.base.gradient`、`visionSmashCode.gradient.top-active-tab`、`visionSmashCode.gradient.horizontal`、`visionSmashCode.base.mouse`。
   - `horizontal: false` → 「鼠标拖轨不生效」先按**默认关闭**结案（不需要改代码）。
2. 打开 DevTools → Elements，选中一个活动标签页元素，读它的 `class` 属性。核对是否**同时**含 `tab-actions-right`、`sizing-fit`、`has-icon`、`tab-border-top`、`active`。
   - 缺任一 → 确认是选择器过脆（修改方向：退化到 `.tab.active` 这类稳定锚点，或改写 `:where()` 提高容错）。
3. 在 Console 里验证渐变条是否被画出：`getComputedStyle(document.querySelector('.tab.active'), '::after').backgroundImage` —— 输出 `linear-gradient(...)` 说明规则命中；输出 `none` 说明未命中。
4. 同法检查拖动条：Elements 里找一个 `.monaco-sash.horizontal`，向上打印 `el.parentElement.className` 链，核对是否仍满足 `.monaco-scrollable-element .split-view-view .monaco-grid-branch-node …` 的形状。

### V7 —— 确认 #4 与 #2 不是同一个成因（交叉验证）

1. 在 1.134.0 上：窗口动效可见（#4 已报告）而光标/文字 JS 不可见（#2 报告）——若在同一台机器同一版本上能同时观察到，则「CSS 通、JS 死」得到最强的现场证据。
2. 若无法在同一环境复现，则退化为：分别记录两台机器上的（VS Code 版本 / Electron 版本 / 加载器版本 / 控制台报错）四元组再做归因。

---

## 不建议的做法

1. **不要为了「让效果回来」而换底层加载器。** 根因在本仓库的初始化时序；换依赖只是把坑推迟，并且会同时改掉 5 类效果的注入语义（见 PR #3 的三个实现缺陷与零测试）。这也正是「换依赖掩盖未知根因」的典型反模式。
2. **不要在效果脚本里靠 `setTimeout`/`requestAnimationFrame` 硬等 body。** 时序竞态会随机器性能漂移，产生「有时好有时坏」的不可诊断状态。正确做法是有明确判据的等待（`document.body` 已存在则直接初始化，否则 `DOMContentLoaded` / `MutationObserver` 等一次）。
3. **不要把 `<head>` 注入这一点也当成「要改加载器源码」的理由去 fork 加载器。** 上游改 `<head>` 有正当动机（副窗口克隆样式）。本仓库适配它，成本低得多；真要隔离，走 #21 的适配层。
4. **不要改 `imports` 的手工顺序/去重逻辑来「试着修」。** 现象已经定位到执行期，`imports` 规划是正确的；乱动会引入新的 `undefined` 污染类问题（#12 刚修掉）。
5. **不要在未验证前删掉 `top-active-tab.css` 的选择器或放宽成 `.tab`。** 放宽会波及所有标签（包括未激活的、拖拽中的），属于行为变更，应先由 #20 用现场 Elements 证据定夺。
6. **不要顺手把三个 JS 文件里的配置块机制重写。** 它是本仓库 5 份重复实现的一部分，已被 #13/#14/#15 的迁移序列安排；本工单不改产品代码。
7. **不要声称「已在 1.13x 上验证」。** 本次调查没有任何实机执行；把「静态推理」写成「已验证」会污染后续 #20 的判断依据。
8. **不要因为上游 issue 里有人说「装回旧版就好了」就当作根因证据。** 那些报告（#273 / #266 / #275）的处置都是「重装 / 升级加载器 / 等自愈」，属于现象层面的 workaround，且其症状是**全部效果一起失效**，与本工单的「部分失效」不是同一类。

---

## 给 #20 的交接要点（不构成本工单的改动）

- 优先级 1：三个 JS 效果的初始化改为「不假定 `document.body` 已存在」。这是唯一能同时解释现有三条报障的修复点，且改动局限在三个资产文件（或迁移到 #13/#14/#15 的计划接缝后统一处理）。
- 优先级 2：`top-active-tab.css` 选择器退化到稳定锚点（`.tab.active` + `:where()` 容错），并保留 `.tab-border-top` 变量覆盖；**需要现场 Elements 证据**。
- 优先级 3：`gradient.horizontal` 要么修好，要么在 README 里给出「默认关闭 + 需要手动开启」的明确说明（当前只有 manifest 描述里的 `(buggy)`）。
- 回归手段：本仓库目前没有能覆盖渲染进程的自动化测试，因此这两项都必须在工单里写明**人工验证步骤**（可直接引用本文 V2/V6），不得声称已验证。

---

## 代码位置对照（#16 重构之后，供阅读历史引用时换算）

本文正文引用的是**当时**的模块与行号。`*-inject.js` 已在 #16 删除，对应关系如下
（**只在此处维护最新位置，正文不动**）。

| 正文里的旧位置 | 现在的位置 |
| --- | --- |
| `cursor-inject.js` / `mouse-inject.js` / `word-inject.js` 的配置块生成与标记替换 | `src/common/refresh-plan.js` 的 `renderMarkerBlock` + `src/common/marker-bodies.js`（鼠标/文字的正文排版） |
| 五个 `*-inject.js` 共用的执行流程（读配置 → 调更新 → 写盘 → 提示错误） | `src/install/refresh-effect.js` 的 `refreshEffect` |
| 各 `getCursorConfig` / `getWordConfig` / `getMouseConfig` 与配置作用域、目标路径解析 | `src/common/effect-descriptors.js` 的 `EFFECTS` 数据表 |
| `gradient-inject.js` 的 CSS 片段循环 | `effect-descriptors.js` 的 `GRADIENT_CSS_FILES` + `refresh-plan.js` 的 `renderCssConcat` |
| `animation-inject.js` 的片段顺序与 `updateDuration` | `src/common/animation-segments.js` 的 `buildAnimationSegments` + `refresh-plan.js` 的 `replaceDurationPlaceholder` |
| `src/common/utils.js` 的 `AddPaths` / `RemovePaths`（`undefined` 污染路径） | `refresh-plan.js` 的 `planImports` + `src/common/import-paths.js` 的 `removeOwnedEntries` |
| `extension.js` 的 `flushChanges`（#12 之前的形态） | 仍是 `extension.js` 的 `flushChanges`，但状态机与导入规划已移入 `planRefresh` |
