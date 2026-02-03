# Vision Smash Code 🎨

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.80.1-blue)](https://code.visualstudio.com/) [![Downloads](https://img.shields.io/vscode-marketplace/i/gentlybeing.vision-smash-code)](https://marketplace.visualstudio.com/items?itemName=gentlybeing.vision-smash-code) ![License](https://img.shields.io/badge/license-GPL-green.svg)

一款为 VS Code 打造的视觉增强扩展，为你的编码体验注入活力！提供光标拖尾特效、窗口平滑动画和精美的渐变主题效果。

中文文档 | [English Document](https://github.com/Jenlybein/vision-smash-code/blob/main/README.md)

## 🚀 使用方法

### 启用扩展

**注意**：需按照前置插件 [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) ，否则无法加载效果！

1. 安装扩展后，按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Vision Smash Code: OpenSettings`
3. 在设置页面启用你想要的功能：
   - 光标拖尾特效
   - 窗口动画
   - 主题渐变效果

| 配置项                                 | 类型    | 默认值    | 说明             |
| -------------------------------------- | ------- | --------- | ---------------- |
| `visionSmashCode.cursor.enabled`     | boolean | `false` | 启用光标拖尾动画 |
| `visionSmashCode.animations.enabled` | boolean | `false` | 启用窗口动效     |
| `visionSmashCode.gradient.enabled`   | boolean | `false` | 启用主题渐变效果 |

### 应用更改

修改配置后，扩展会自动提示你重载 VS Code 以应用更改。点击插件 `Custom CSS and JS Loader` 弹窗的确认按钮即可。

![restart](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/restart.png)

## ✨ 功能特性

### 🌈 渐变主题增强

- 顶部活动标签页渐变

  ![topactivate](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/topactivate.gif)
- 行号彩虹辉光效果

  ![linenumber](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/linenumber.gif)
- 命令面板渐变效果

  ![quickinput](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput.gif)
- 编辑器悬浮提示框玻璃效果

  ![editorhover](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/editorhover.gif)
- 文本微渐变效果

  ![textgradient](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textgradient.png)
- 文字发光（默认关闭！）

  ![textglow](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textglow.png)
- Git 变更数字图标渐变

### 🪟 窗口动画

- 命令面板平滑展开/收起动画

  ![quickinput_animation](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput_animation.gif)
  
- 滚动时列表项渐入动画

  ![list](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/list.gif)
  
- 活动项高亮动画

  ![activateItem](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/activateItem.gif)
  
- 平滑模式过渡效果smooth.gif

  ![smooth](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/smooth.gif)

### 🖱️ 光标拖尾特效

- 流畅的光标拖尾动画，让光标移动更加灵动
- 可自定义拖尾颜色、透明度、发光效果
- 支持多种动画时长和缓动效果
- 智能短距离位移优化

## 📦 安装

### 从 VS Code 市场安装

1. 打开 VS Code
2. 按 `Ctrl+P` (Windows/Linux) 或 `Cmd+P` (macOS)
3. 输入 `ext install gentlybeing.vision-smash-code`
4. 点击安装

### 从 VSIX 安装

1. 下载最新的 `.vsix` 文件
2. 在 VS Code 中，点击扩展视图（四个方块图标）
3. 点击 `...` 菜单，选择 "从 VSIX 安装"
4. 选择下载的文件

## 🙏 致谢

- [VS Code](https://code.visualstudio.com/) - 代码编辑器
- [Vscode Animation](https://github.com/BrandonKirbyson/VSCode-Animations.git) - 窗口动效参考
- [Neovide Cursor](https://github.com/30d98f9b2/Neovide-Cursor) - 光标特效参考
- [Gradient Theme](https://github.com/shaobeichen/gradient-theme) - 渐变美化参考
- [Custom CSS and JS Loader](https://github.com/be5invis/vscode-custom-css) - 样式注入的方式

---

**Enjoy coding with style! 🎨✨**
