// class GlobalCursorManager {
//   constructor() {
//     this.cursors = new Map(); // 存储活跃光标实例及其对应的 DOM 元素
//     this.canvas = document.createElement("canvas");
//     this.ctx = this.canvas.getContext("2d");
//     this.isScrolling = false; // 滚动状态锁
//     this.init();
//   }

//   // init 方法: 启动环境初始化
//   init() {
//     // 注入全局样式
//     // const style = document.createElement("style");
//     // style.textContent = ``;
//     // document.head.appendChild(style);

//     // 设置全屏透明画板
//     this.canvas.style.cssText = `
//             pointer-events: none;
//             position: fixed;
//             top: 0;
//             left: 0;
//             z-index: 9999;
//             opacity: 0;
//             transition: none;
//         `;
//     document.body.appendChild(this.canvas);

//     window.addEventListener("resize", () => {
//       this.canvas.width = window.innerWidth;
//       this.canvas.height = window.innerHeight;
//     });
//     this.canvas.width = window.innerWidth;
//     this.canvas.height = window.innerHeight;

//     this.loop();
//     setInterval(() => this.scan(), config.cursorUpdatePollingRate);
//   }

//   // scan 方法: 探测并匹配 DOM 元素与物理实例
//   scan() {
//     const ids = new Set();
//     const els = /** @type {NodeListOf<HTMLElement>} */ (
//       document.querySelectorAll(".monaco-editor .cursor")
//     );
//     els.forEach((el) => {
//       let id =
//         el.dataset.cursorId || "c" + Math.random().toString(36).slice(2, 7);
//       el.dataset.cursorId = id;
//       ids.add(id);

//       // 如果发现新的光标 DOM, 立即创建对应的物理引擎对象
//       if (!this.cursors.has(id)) {
//         const r = el.getBoundingClientRect();
//         const inst = createNeovideCursor({ canvas: this.canvas });
//         if (r.left > 0 || r.top > 0) {
//           inst.updateSize(r.width, r.height);
//           inst.move(
//             r.left,
//             r.top,
//             globalCursorState.lastX
//               ? {
//                   x: globalCursorState.lastX,
//                   y: globalCursorState.lastY,
//                 }
//               : null,
//           );
//           this.cursors.set(id, {
//             instance: inst,
//             target: el,
//             lastX: r.left,
//             lastY: r.top,
//             isActive: false,
//           });
//         }
//       }
//     });
//     // 回收已经消失的 DOM 对应的实例
//     for (const id of this.cursors.keys()) {
//       if (!ids.has(id)) this.cursors.delete(id);
//     }
//   }

//   /**
//    * loop 方法: 顶层渲染引擎, 控制每一帧的最终输出
//    */
//   loop() {
//     this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
//     let isAnyAnimating = false;

//     for (const [id, data] of this.cursors) {
//       if (!data.target || !data.target.isConnected) {
//         this.cursors.delete(id);
//         continue;
//       }
//       const r = data.target.getBoundingClientRect();
//       const style = getComputedStyle(data.target);
//       // 判定原生光标当前是否在界面上逻辑可见 (排除因分屏隐藏的光标)
//       const isNowActive =
//         style.visibility !== "hidden" &&
//         style.display !== "none" &&
//         !style.transform.includes("-10000px");
//       const hasMoved = r.left !== data.lastX || r.top !== data.lastY;

//       // 状态管理: 处理光标首次激活时的跳转引导
//       if (isNowActive && !data.isActive) {
//         data.isJumping = true;
//         data.jumpSource = globalCursorState.lastX
//           ? { x: globalCursorState.lastX, y: globalCursorState.lastY }
//           : null;
//       }

//       if (data.isJumping && hasMoved) {
//         data.instance.updateSize(r.width, r.height);
//         data.instance.move(r.left, r.top, data.jumpSource);
//         data.isJumping = false;
//         data.lastX = r.left;
//         data.lastY = r.top;
//       } else if (isNowActive && hasMoved) {
//         data.instance.updateSize(r.width, r.height);
//         data.instance.move(r.left, r.top);
//         data.lastX = r.left;
//         data.lastY = r.top;
//       }

//       data.isActive = isNowActive;
//       if (isNowActive) {
//         const anim = data.instance.updateLoop(
//           this.isScrolling,
//           r.left >= 0 && r.top >= 0 && r.left <= window.innerWidth,
//         );
//         if (anim) isAnyAnimating = true;
//         data.isAnimating = anim;
//       } else {
//         data.isAnimating = false;
//       }
//     }

//     // 显隐逻辑策略:
//     // 动画中: 隐藏原生光标, 渲染物理 Canvas
//     // 静止后: 恢复原生光标 (确保清晰度), 渐隐物理 Canvas
//     if (isAnyAnimating) {
//       this.canvas.style.transition = "none";
//       this.canvas.style.opacity = "1";
//       this.cursors.forEach((d) => {
//         if (d.isActive && d.target) {
//           d.target.style.transition = config.nativeCursorDisappearTransitionCss;
//           d.target.style.opacity = "0";
//         }
//       });
//     } else {
//       if (this.canvas.style.opacity === "1") {
//         setTimeout(() => {
//           this.canvas.style.transition = config.canvasFadeTransitionCss;
//           this.canvas.style.opacity = "0";
//         }, config.cursorDisappearDelay);
//       }
//       this.cursors.forEach((d) => {
//         if (d.isActive && d.target) {
//           d.target.style.transition = config.nativeCursorRevealTransitionCss;
//           d.target.style.opacity = "1";
//         }
//       });
//     }

//     requestAnimationFrame(this.loop.bind(this));
//   }
// }

// // 启动全局光标管理器
// new GlobalCursorManager();
