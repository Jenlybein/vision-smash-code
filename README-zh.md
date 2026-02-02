# Vision Smash Code 🎨

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.80.1-blue)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-GPL-green.svg)](LICENSE)

一款为 VS Code 打造的视觉增强扩展，为你的编码体验注入活力！提供光标拖尾特效、窗口平滑动画和精美的渐变主题效果。

## 🚀 使用方法

### 启用扩展

1. 安装扩展后，按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Vision Smash Code: OpenSettings`
3. 在设置页面启用你想要的功能：
   - 光标拖尾特效
   - 窗口动画
   - 主题渐变效果

| 配置项                               | 类型    | 默认值  | 说明             |
| ------------------------------------ | ------- | ------- | ---------------- |
| `visionSmashCode.cursor.enabled`     | boolean | `false` | 启用光标拖尾动画 |
| `visionSmashCode.animations.enabled` | boolean | `false` | 启用窗口动效     |
| `visionSmashCode.gradient.enabled`   | boolean | `false` | 启用主题渐变效果 |

### 应用更改

修改配置后，扩展会自动提示你重载 VS Code 以应用更改。点击插件 `Custom CSS and JS Loader` 弹窗的确认按钮即可。

## ✨ 功能特性

### 🖱️ 光标拖尾特效

- 流畅的光标拖尾动画，让光标移动更加灵动
- 可自定义拖尾颜色、透明度、发光效果
- 支持多种动画时长和缓动效果
- 智能短距离位移优化

### 🪟 窗口动画

- 命令面板平滑展开/收起动画
- 标签页切换动画
- 活动项高亮动画
- 滚动时列表项渐入动画
- 平滑模式过渡效果

### 🌈 渐变主题增强

- 编辑器悬浮玻璃效果
- Git 变更数字图标渐变
- 行号彩虹辉光效果
- 快速输入框渐变效果
- 文本微渐变效果
- 顶部活动标签页渐变

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
