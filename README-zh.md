# Vision Smash Code 🎨

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.80.1-blue)](https://code.visualstudio.com/) [![Downloads](https://img.shields.io/vscode-marketplace/i/gentlybeing.vision-smash-code)](https://marketplace.visualstudio.com/items?itemName=gentlybeing.vision-smash-code) ![License](https://img.shields.io/badge/license-GPL-green.svg)

一款为 VS Code 打造的视觉增强扩展，为你的编码体验注入活力！提供鼠标拖尾特效、打字特效、光标拖尾特效、窗口平滑动画和精美的渐变主题效果。

🌐 中文文档 | [English Document](https://github.com/Jenlybein/vision-smash-code/blob/main/README.md)

---

## 🚀 快速开始

### 📋 前置要求

> ⚠️ 重要：使用本扩展前，必须安装 [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) 插件，否则无法加载任何视觉效果！

这是因为 VS Code 扩展本身无法直接修改编辑器样式，需要通过 Custom CSS and JS Loader 来注入自定义 CSS 和 JavaScript。

### 📝 启用步骤

1. 打开 VS Code 扩展商店
2. **安装依赖插件**： `Custom CSS and JS Loader`（发布者：be5invis）
3. **安装本扩展**：搜索安装 `Vision Smash Code`（发布者：gentlybeing）
4. **打开设置**
   - 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS) 打开命令面板
   - 输入 `Vision Smash Code: OpenSettings` 并运行
5. **启用功能**：在打开的设置页面中启用你想要的功能
6. **应用更改**
   - 修改配置后，扩展会自动提示你重载 VS Code
   - 点击 `Custom CSS and JS Loader` 提示框中的 **确认** 按钮
   - 等待 VS Code 重启并应用所有效果

![restart](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/restart.png)

### ⚙️ 配置选项

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `visionSmashCode.base.cursorEnabled` | `false` | 启用光标拖尾特效 |
| `visionSmashCode.base.animationsEnabled` | `false` | 启用窗口动画效果 |
| `visionSmashCode.base.gradientEnabled` | `false` | 启用渐变主题效果 |
| `visionSmashCode.base.word` | `false` | 启用打字文字爆炸效果 |
| `visionSmashCode.base.mouse` | `false` | 启用鼠标尾迹效果 |

### ❓ VS Code 提示"已损坏"？

这是正常现象！因为 Custom CSS and JS Loader 需要修改 VS Code 的内部文件来注入样式。**这不会影响 VS Code 的任何功能和使用体验**。

如果想关闭这个警告提示：
- 点击弹窗中的 **"不再提示"** 按钮
- 或查阅 [Custom CSS and JS Loader 文档](https://github.com/be5invis/vscode-custom-css)

## ✨ 功能特性

所有功能都可以独立启用/禁用，不会相互影响。

### 🌈 渐变主题增强

为 VS Code 的多个界面元素添加精美的渐变效果，提升视觉体验。

| 功能 | 描述 | 预览 |
| --- | --- | --- |
| **顶部活动标签页渐变** | 当前编辑文件标签页应用渐变色 | ![topactivate](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/topactivate.gif) |
| **行号彩虹辉光** | 代码行号显示彩虹色辉光效果 | ![linenumber](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/linenumber.gif) |
| **命令面板渐变** | 命令面板（Ctrl+Shift+P）应用渐变背景 | ![quickinput](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput.gif) |
| **编辑器悬浮提示玻璃效果** | 代码提示框显示玻璃毛玻璃效果 | ![editorhover](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/editorhover.gif) |
| **文本微渐变** | 文字应用细微的渐变效果 | ![textgradient](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textgradient.png) |
| **文字发光** | 文字添加发光效果（默认关闭） | ![textglow](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textglow.png) |
| **Git 变更图标渐变** | Git 行变更指示器应用渐变色 | 内置效果 |

### 🪟 窗口动画

为 VS Code 的界面交互添加平滑的动画效果，使操作更加流畅自然。

| 功能 | 描述 | 预览 |
| --- | --- | --- |
| **命令面板展开/收起动画** | 打开和关闭命令面板时的平滑动画 | ![quickinput_animation](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput_animation.gif) |
| **列表项淡入动画** | 滚动列表时列表项渐入显示 | ![list](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/list.gif) |
| **活动项高亮动画** | 鼠标悬停时列表项高亮的平滑过渡 | ![activateItem](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/activateItem.gif) |
| **平滑模式过渡** | 界面切换时的平滑过渡动画 | ![smooth](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/smooth.gif) |

### 🖱️ 鼠标拖尾特效

为鼠标移动添加多种炫彩拖尾特效，让编码体验更生动有趣。

以下展示 5 种拖尾风格（可自定义更多风格）：

| 风格 | 描述 | 效果 |
| --- | --- | --- |
| **点** | 小圆点追踪效果 | ![dots](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/dots.gif) |
| **光束** | 连续光束跟踪 | ![beam](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/beam.gif) |
| **丝带** | 丝带状拖尾效果 | ![ribbon](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/ribbon.gif) |
| **烟雾** | 烟雾扩散效果 | ![smoke](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/smoke.gif) |
| **闪电** | 电流闪烁效果 | ![electric](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/electric.gif) |

### 🆚 打字特效

为文字输入添加视觉特效，让打字过程更加有趣。

| 效果 | 演示 |
| --- | --- |
| 缩放效果 | ![word1](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word1.gif) |
| 重力效果 | ![word2](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word2.gif) |
| 漂浮效果 | ![word3](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word3.gif) |
| 固定效果(加上了随机角度设置) | ![word4](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word4.gif) |

### 🟪 光标拖尾特效

为光标移动添加流畅的拖尾动画，让光标移动更加灵动生动。

**功能特点**
- ✨ 流畅的光标跟踪动画
- 🎨 可自定义拖尾颜色
- 👻 支持透明度和发光效果
- ⚡ 多种动画时长和缓动函数
- 🎯 支持单独启用/禁用

## 📦 安装方式

### 从 VS Code 市场安装（推荐）

1. 打开 VS Code
2. 按 `Ctrl+P` (Windows/Linux) 或 `Cmd+P` (macOS) 打开快速打开对话框
3. 输入 `ext install gentlybeing.vision-smash-code`
4. 在搜索结果中点击扩展
5. 点击 **安装** 按钮

**或者**

1. 点击左侧边栏的 **扩展** 图标（或按 `Ctrl+Shift+X`）
2. 搜索 `Vision Smash Code`
3. 找到 `gentlybeing` 发布的版本
4. 点击 **安装**

---

## 🙏 致谢

感谢以下项目为本扩展提供的灵感和参考：

| 项目 | 用途 | 链接 |
| --- | --- | --- |
| **VS Code** | 强大的代码编辑器基础 | [code.visualstudio.com](https://code.visualstudio.com/) |
| **VSCode Animations** | 窗口动效灵感 | [GitHub](https://github.com/BrandonKirbyson/VSCode-Animations) |
| **Neovide Cursor** | 光标特效灵感 | [GitHub](https://github.com/30d98f9b2/Neovide-Cursor) |
| **Gradient Theme** | 渐变美化灵感 | [GitHub](https://github.com/shaobeichen/gradient-theme) |
| **Custom CSS and JS Loader** | 样式注入解决方案 | [GitHub](https://github.com/be5invis/vscode-custom-css) |

## 📄 许可证

本项目采用 **GPL-3.0** 许可证。详见 [LICENSE](../LICENSE.txt) 文件。

## ⭐ 支持项目

如果你喜欢这个项目，请：
- 在 GitHub 上 Star 这个项目
- 分享给其他开发者朋友
- 在社交媒体上提及本项目
- 考虑赞助开发者（如果可能）

---

**Enjoy coding with style! 🎨✨**
