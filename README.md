# Vision Smash Code 🎨

[![VS Code Version](https://img.shields.io/badge/VS%20Code-%5E1.80.1-blue)](https://code.visualstudio.com/) [![Downloads](https://img.shields.io/vscode-marketplace/i/gentlybeing.vision-smash-code)](https://marketplace.visualstudio.com/items?itemName=gentlybeing.vision-smash-code) ![License](https://img.shields.io/badge/license-GPL-green.svg)

A visual enhancement extension for VS Code that injects life into your coding experience! It provides cursor trailing effects, smooth window animations, and beautiful gradient theme enhancements.

## 🚀 How to Use

### Enable the extension

**Note**: This extension requires the [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) extension to load effects.

1. After installing the extension, press `Ctrl+Shift+P` to open the Command Palette
2. Run `Vision Smash Code: OpenSettings`
3. Enable the features you want in the settings page:
   - Cursor trailing effects
   - Window animations
   - Gradient theme enhancements

| Setting                                 | Type    | Default   | Description                  |
| -------------------------------------- | ------- | --------- | ---------------------------- |
| `visionSmashCode.cursor.enabled`       | boolean | `false`   | Enable cursor trailing       |
| `visionSmashCode.animations.enabled`   | boolean | `false`   | Enable window animations     |
| `visionSmashCode.gradient.enabled`     | boolean | `false`   | Enable gradient theme effects|

### Applying changes

After changing configuration, the extension will prompt you to reload VS Code to apply the changes. Click the confirmation button in the `Custom CSS and JS Loader` prompt.

![restart](./images/restart.png)

## ✨ Features

### 🌈 Gradient Theme Enhancements

- Top active tab gradient

  ![topactivate](./images/topactivate.gif)

- Line number rainbow glow

  ![linenumber](./images/linenumber.gif)

- Command palette gradient

  ![quickinput](./images/quickinput.gif)

- Editor hover tooltip glass effect

  ![editorhover](./images/editorhover.gif)

- Text subtle gradients

  ![textgradient](./images/textgradient.png)

- Text glow (disabled by default)

  ![textglow](./images/textglow.png)

- Git change number icon gradients

### 🪟 Window Animations

- Fade-in animations for list items on scroll

  ![list](./images/list.gif) ![list2](./images/list2.gif)

- Active item highlight animations

  ![activateItem](./images/activateItem.gif) ![activateItem2](./images/activateItem2.gif)

- Smooth mode transitions

  ![smooth](./images/smooth.gif)

- Smooth expand/collapse animations for the command palette

### 🖱️ Cursor Trailing Effects

- Smooth cursor trailing animation for livelier cursor movement
- Customizable trail color, opacity, and glow
- Multiple duration and easing options
- Smart short-distance movement optimization

## 📦 Installation

### Install from VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` (Windows/Linux) or `Cmd+P` (macOS)
3. Type `ext install gentlybeing.vision-smash-code`
4. Click Install

### Install from VSIX

1. Download the latest `.vsix` file
2. Open the Extensions view in VS Code
3. Click the `...` menu and select "Install from VSIX..."
4. Choose the downloaded file

## 🙏 Credits

- [VS Code](https://code.visualstudio.com/) - Code editor
- [VSCode Animations](https://github.com/BrandonKirbyson/VSCode-Animations.git) - Reference for window animations
- [Neovide Cursor](https://github.com/30d98f9b2/Neovide-Cursor) - Reference for cursor effects
- [Gradient Theme](https://github.com/shaobeichen/gradient-theme) - Reference for gradient styling
- [Custom CSS and JS Loader](https://github.com/be5invis/vscode-custom-css) - Method for injecting styles

---

**Enjoy coding with style! 🎨✨**
