# global-mask.js — 透明遮罩与抖动方块 📦

## 概述 ✅

`global-mask.js` 在页面全局创建一个透明的遮罩层（overlay），并在遮罩正中间渲染一个持续抖动的方块。该实现极简、无依赖，方便在 VS Code 的 webview 或注入脚本场景中使用。

---

## 实现要点 🔧

- 注入一段 CSS（`<style id="vsm-global-mask-style">`），定义遮罩层与方块样式与抖动关键帧（`@keyframes vsm-jitter`）。
- 将遮罩 DOM（`<div id="vsm-global-overlay">`）添加到 `document.body`，并使用 flexbox 将子元素在视窗中居中。
- 遮罩使用 `pointer-events: none`，以免阻塞底层编辑器的交互。
- 提供易用的 API：`show()` / `hide()` / `toggle()` / `update()` / `destroy()`。
- 支持 `prefers-reduced-motion`，以尊重系统的“减少动画”设置。

---

## 使用示例 🔍

```js
// 控制台或注入脚本中：
const mask = new GlobalMask({ squareSize: 80, squareColor: '#0cf' });
mask.show();
// 2 秒后隐藏
setTimeout(() => mask.hide(), 2000);
// 销毁
mask.destroy();
```

---

## 可配置项（示例） ✨

- `squareSize` (number): 方块尺寸，单位 px。
- `squareColor` (string): 方块背景色（任意 CSS 颜色）。
- `shakeDuration` (number): 抖动一个周期的秒数。
- `zIndex` (number): 遮罩的层级。

---

## 在 VS Code 中集成小贴士 💡

- 如果你在扩展中使用 `webview`，可以将此脚本作为静态文件注入到 webview 的 HTML 中。
- 如果需要在编辑器主窗口 DOM（非 webview）注入，需要通过扩展的 content scripts（或在合适的注入点）执行该脚本，并注意权限与稳定性。

---

若需我把这个遮罩集成到插件的注入流程或演示页面中，我可以继续帮你添加相应的示例与说明。