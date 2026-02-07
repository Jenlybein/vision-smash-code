
# Vision Smash Code 🎨

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.80.1-blue)](https://code.visualstudio.com/) [![Downloads](https://img.shields.io/vscode-marketplace/i/gentlybeing.vision-smash-code)](https://marketplace.visualstudio.com/items?itemName=gentlybeing.vision-smash-code) ![License](https://img.shields.io/badge/license-GPL-green.svg)

A visual enhancement extension for VS Code that injects life into your coding experience! Provides mouse/cursor trails, typing effects, smooth window animations, and beautiful gradient themes.

🌐 English | [中文文档](https://github.com/Jenlybein/vision-smash-code/blob/main/README-zh.md)

---

## 🚀 Quick Start

### 📋 Prerequisites

> ⚠️ **Important:** You must install [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) before using this extension, or no visual effects will work!

VS Code extensions cannot directly modify editor styles, so Custom CSS and JS Loader is required to inject custom CSS/JS.

### 📝 Enable Steps

1. Open VS Code Extension Marketplace
2. **Install dependency:** `Custom CSS and JS Loader` (by be5invis)
3. **Install this extension:** Search and install `Vision Smash Code` (by gentlybeing)
4. **Open Settings**
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) to open the Command Palette
   - Type `Vision Smash Code: OpenSettings` and run
5. **Enable features:** Toggle the features you want in the settings page
6. **Apply changes**
   - After changing config, the extension will prompt you to reload VS Code
   - Click **Confirm** in the `Custom CSS and JS Loader` prompt
   - Wait for VS Code to restart and apply all effects

![restart](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/restart.png)

### ⚙️ Configuration Options

| Setting | Default | Description |
| --- | --- | --- |
| `visionSmashCode.base.cursor` | `false` | Enable cursor trail effects |
| `visionSmashCode.base.animations` | `false` | Enable window animation effects |
| `visionSmashCode.base.gradient` | `false` | Enable gradient theme effects |
| `visionSmashCode.base.word` | `false` | Enable typing explosion effects |
| `visionSmashCode.base.mouse` | `false` | Enable mouse tail effects |

### ❓ Why does VS Code show "corrupted"?

This is normal! Custom CSS and JS Loader modifies VS Code's internal files to inject styles. **It does not affect any VS Code features or your experience.**

To dismiss the warning:
- Click **"Don't show again"** in the popup
- Or see [Custom CSS and JS Loader docs](https://github.com/be5invis/vscode-custom-css)

---

## ✨ Features

All features can be enabled/disabled independently.

### 🌈 Gradient Theme Enhancements

Add beautiful gradients to various VS Code UI elements for a more vivid experience.

| Feature | Description | Preview |
| --- | --- | --- |
| **Top active tab gradient** | Gradient color for the active editor tab | ![topactivate](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/topactivate.gif) |
| **Line number rainbow glow** | Rainbow glow for line numbers | ![linenumber](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/linenumber.gif) |
| **Command palette gradient** | Gradient background for command palette (`Ctrl+Shift+P`) | ![quickinput](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput.gif) |
| **Editor hover glass effect** | Frosted glass effect for hover tooltips | ![editorhover](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/editorhover.gif) |
| **Text subtle gradients** | Subtle gradient for text | ![textgradient](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textgradient.png) |
| **Text glow** | Glowing text effect (off by default) | ![textglow](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/textglow.png) |
| **Git change icon gradients** | Gradient for Git change indicators | Built-in |

### 🪟 Window Animations

Smooth animations for VS Code UI interactions, making operations more fluid and natural.

| Feature | Description | Preview |
| --- | --- | --- |
| **Command palette expand/collapse** | Smooth animation when opening/closing command palette | ![quickinput_animation](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/quickinput_animation.gif) |
| **List item fade-in** | List items fade in when scrolling | ![list](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/list.gif) |
| **Active item highlight** | Smooth highlight transition for list items | ![activateItem](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/activateItem.gif) |
| **Smooth mode transitions** | Smooth transitions for UI changes | ![smooth](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/smooth.gif) |

### 🖱️ Mouse Trail Effects

Add colorful mouse trails for a more dynamic coding experience. Five built-in styles (customizable):

| Style | Description | Effect |
| --- | --- | --- |
| **Dots** | Small dot trail | ![dots](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/dots.gif) |
| **Beam** | Continuous beam | ![beam](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/beam.gif) |
| **Ribbon** | Ribbon-like trail | ![ribbon](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/ribbon.gif) |
| **Smoke** | Smoke diffusion | ![smoke](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/smoke.gif) |
| **Electric** | Electric flicker | ![electric](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/electric.gif) |

### 🆚 Typing Effects

Add visual effects to text input for a more fun typing experience.

| Effect | Demo |
| --- | --- |
| Zoom | ![word1](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word1.gif) |
| Gravity | ![word2](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word2.gif) |
| Drift | ![word3](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word3.gif) |
| Fixed (with random angle) | ![word4](https://raw.githubusercontent.com/Jenlybein/vision-smash-code/refs/heads/main/images/word4.gif) |

### 🟪 Cursor Trail Effects

Smooth trailing animation for the cursor, making movement more lively.

**Features:**
- ✨ Smooth cursor tracking animation
- 🎨 Customizable trail color
- 👻 Supports opacity and glow
- ⚡ Multiple animation durations and easing
- 🎯 Can be enabled/disabled independently

---

## 📦 Installation

### From VS Code Marketplace (Recommended)

1. Open VS Code
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS) to open Quick Open
3. Type `ext install gentlybeing.vision-smash-code`
4. Click the extension in the results
5. Click **Install**

**Or**

1. Click the **Extensions** icon in the sidebar (or press `Ctrl+Shift+X`)
2. Search for `Vision Smash Code`
3. Find the version by `gentlybeing`
4. Click **Install**

---

## 🙏 Acknowledgements

Thanks to the following projects for inspiration and reference:

| Project | Purpose | Link |
| --- | --- | --- |
| **VS Code** | Powerful code editor | [code.visualstudio.com](https://code.visualstudio.com/) |
| **VSCode Animations** | Window animation inspiration | [GitHub](https://github.com/BrandonKirbyson/VSCode-Animations) |
| **Neovide Cursor** | Cursor effect inspiration | [GitHub](https://github.com/30d98f9b2/Neovide-Cursor) |
| **Gradient Theme** | Gradient beautification | [GitHub](https://github.com/shaobeichen/gradient-theme) |
| **Custom CSS and JS Loader** | Style injection solution | [GitHub](https://github.com/be5invis/vscode-custom-css) |

## 📄 License

This project is licensed under **GPL-3.0**. See [LICENSE](../LICENSE.txt) for details.

## ⭐ Support

If you like this project, please:
- Star it on GitHub
- Share with other developers
- Mention it on social media
- Consider sponsoring the developer (if possible)

---

**Enjoy coding with style! 🎨✨**
