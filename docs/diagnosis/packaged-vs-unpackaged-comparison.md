# 打包版本与未打包版本的效果一致性：已做的桩级对照与未做的人工对照

- **对应工单**：#17（esbuild → CJS 单文件产物）
- **对应验收条件（AC）**：「打包版本与未打包版本 5 类效果行为一致（**人工对照**）」
- **状态**：**部分达成** —— 桩级（stub）自动对照**已执行**；真实 VS Code 编辑器内的人工视觉对照
  **仍未执行**。
- **记录日期**：2026-11-07（收尾评审 F6 补记）

> **一句话结论**：本仓库能自动证明的是「同一份资产 + 同一份配置，新旧代码算出来的文件内容
> 逐字节相同」；**不能**证明「两个版本在被注入真实 VS Code 之后，用户看到的效果一样」。
> 后者需要人工在编辑器里看，目前没有任何人做过，也没有任何记录声称做过。

## 一、已执行：桩级自动对照

### 方法与原理

效果生成是一条纯计算链：`配置快照 + 资产文件 → 目标文件内容`。这条链唯一的宿主依赖是 `vscode`
（`workspace.getConfiguration`、`window.show*Message`、`Uri.file`）。把 `vscode` 换成一个假的实现，
就能在**纯 Node**（没有扩展宿主）里分别跑「重构前」和「重构后」的代码，再比较两者生成的文件字节。

具体做法：

1. 用 `git archive main` 把重构前的源码导出到临时目录（不建 worktree、不建分支），
   得到 `src/install/{cursor,mouse,word,gradient,animation}-inject.js`；
2. 假的 `vscode` 模块从 `package.json` 的 `contributes.configuration` 读出每个设置项的 `default`
   （这正是 VS Code 在用户未显式设置时 `config.get(key)` 返回的值），支持按点分隔的嵌套键
   （`gravity.gravity` 等）与被覆盖的测试配置；
3. 用 ESM 解析钩子把裸标识符 `"vscode"` 指向该假模块；
4. 两个扩展目录里放**完全相同**的资产（`src/{vscode-animations,gradient-theme,neovide-cursor,
   mouse-tail,word-exploder}`，一律取重构后的版本），因此两边的差异只可能来自**代码行为**；
5. 旧代码走 `init(context)` + `StyleConfigUpdate()`，新代码走 `refreshEffect(key, extensionPath)`，
   随后逐字节比较 5 个目标文件。

### 结果（2026-11-07 实测）

两个配置场景下，5 类效果生成的文件**全部逐字节相同**：

| 场景 | 配置 | 光标拖尾 | 鼠标尾迹 | 文字爆炸 | 渐变主题 | 窗口动效 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 默认 | manifest 默认值 | 17532B ✅ | 8254B ✅ | 10635B ✅ | 4089B ✅ | 2976B ✅ | 全同 |
| 全开 | Smooth-Mode/Tokens 开、Tabs=Slide、Scrolling=Fade、`Durations.Tabs=500`、`Default-Duration=420`、`horizontal` 开、`tailColor=#123456`、`mouse.mode=beam` | 17532B ✅ | 8252B ✅ | 10635B ✅ | 4962B ✅ | 8582B ✅ | 全同 |

（✅ = 与重构前 `main` 的代码逐字节相同；sha256 前缀见对照脚本输出。）

### 这套对照能证明什么

- 重构没有改变「配置值 + 资产 → 目标文件字节」这条映射：三个标记块式效果（光标/鼠标/文字）
  的配置块正文、字段顺序、缩进、注释排版一致；两个拼接式效果（渐变/窗口动效）的片段顺序、
  选取规则、时长占位处理一致。
- 反向验证有效：在收尾评审把「时长占位」错误地扩到 `_Duration.css` 的那一版（commit `86ba74c`）上
  重跑同一套对照，窗口动效**立刻报出差异**（`--tabs-duration: 200ms` 等 4 行 vs 原来的
  `300ms` 占位），说明这套对照不是恒真的。修复后（`5d528d2`）重新回到全同。

### 这套对照**不能**证明什么（局限，逐条列清）

1. **没有真实 VS Code**：假的 `vscode` 只有 `getConfiguration` / `show*Message` / `Uri.file`，
   不模拟配置作用域继承、多根工作区、设置项类型校验，也不模拟真实 `workspace.getConfiguration`
   在值非法时的兜底行为。
2. **没有渲染**：对照的是**文件内容**，不是画面。CSS 在真实 workbench DOM 上的层叠、优先级、
   是否命中选择器，一个字节都不覆盖；JS 是否真的执行、是否报错，同样不覆盖。
3. **没有注入链路**：不覆盖加载器（`be5invis` / `custom-ui-style`）把条目写进配置、patch
   `workbench.html`、重载窗口这些环节，也不覆盖 `extension.js` 的状态机与防抖时序。
4. **没有激活与生命周期**：扩展激活、配置监听、`refreshEffect` 的触发时机都不在对照范围内。
5. **没有打包产物本身**：对照跑的是**源码**（ESM）。「打包成 `dist/extension.cjs` 后行为一致」
   这一步依赖 esbuild 的正确性，本次只做了间接论证（打包后入口仍是同一份模块图），
   **未**把 `dist/extension.cjs` 拿进对照里跑。
6. **配置面有限**：只跑了两个场景。极值（`Durations` 越界、空字符串、刻意写坏的配置）由单元测试
   覆盖，不在本对照的证明范围。

## 二、未执行：真实编辑器内的人工视觉对照

AC 要的是「**人工**对照」，即：在装了扩展的 VS Code 里，分别用打包版与未打包版看 5 类效果，
用眼睛确认快慢、位置、颜色、动画是否一致。**这一项从未执行**，本仓库也没有任何记录显示有人做过。
桩级自动对照不能替代它——上面「局限」第 1、2、3、4 条正是人工对照才能覆盖的部分。

### 复现步骤（任何人可照着做）

1. 准备两个可运行形态：
   - **未打包版**：检出一个 `manifest.main` 仍指向 `./extension.js`（ESM 源码、无构建步骤）的
     历史提交，用 F5「扩展开发宿主」启动（`code --extensionDevelopmentPath=<该检出>`）；
   - **打包版**：当前分支上 `npm run package`（`node build.mjs --production`）产出
     `dist/extension.cjs`，再用 `npx @vscode/vsce package` 打出 `.vsix` 安装。
     注意两个形态的 `manifest.main` 不同，其余配置与资产应当一致。
2. 在 VS Code 里 `code --install-extension vision-smash-code-<ver>.vsix --force`，按提示重载窗口。
3. 打开设置，先把 5 个总开关全部打开，再逐个打开单项：
   - 窗口动效：`Tabs` 在 Scale/Slide/Flip 间切换、`Active` 在 Indent/Scale 间切换、`Scrolling`
     在 Scale/Slide/Fade 间切换、`Smooth-Mode` 开关各一次、`Tokens` 开关各一次；
   - 光标拖尾：改 `tailColor` / `tailOpacity`，看拖尾颜色与长度；
   - 渐变主题：逐个开关 8 个渐变项，看对应区域；
   - 鼠标尾迹：`mouse.mode` 五档各看一次；
   - 文字爆炸：`word.mode` 四档各看一次。
4. 每一步记录：动画快慢（尤其 Tabs/Active/Scrolling 应始终是 300ms —— 见
   ADR-0001「仍未达成」里的既有缺陷）、元素位置、颜色、有无闪烁或残留。
5. 用未打包版重复同一组操作，逐项对比记录。
6. 额外确认注入链路：`settings.json` 里本扩展的条目形态与数量、窗口重载后效果是否生效、
   关闭总开关后条目是否被移除且**用户自己的条目仍在**。

## 三、与其它记录的关系

- 生成内容的正确性另有更细的自动化证据：`test/marker-block*.test.mjs`（标记块正文逐字节对照
  golden 参照）、`test/mouse-content.test.mjs`、`test/word-content.test.mjs`、
  `test/animation-concat.test.mjs`、`test/refresh-plan.test.mjs`。
- 「部分效果在真实 VS Code 上失效」的根因诊断见
  `docs/diagnosis/loader-and-effect-failures.md`，其结论同样基于桩级与源码级证据，
  不含真实编辑器内的验证。
- 双注入后端的人工验证步骤见 `README.md` / `README-zh.md` 的「Choosing the injection backend」
  一节，同样**未执行**（ADR-0003「未验证项」）。
