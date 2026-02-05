/* __AUTO_CONFIG_START__ */
const explosionConfig = {
  /* ========= 基础设置 ========= */
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 25, // 字体稍微调大一点更明显
  fontWeight: "bold",

  /* ========= 物理效果 ========= */
  gravity: 0.15, // 重力
  initialVelocityY: -4, // 初始向上弹射速度
  initialVelocityX: 1, // 横向扩散范围
  lifeDecay: 0.02, // 消失速度

  /* ========= 颜色设置 ========= */
  colors: [
    "#FFD700",
    "#FF6347",
    "#00BFFF",
    "#32CD32",
    "#FF69B4",
    "#8A2BE2",
    "#FFA500",
    "#00FA9A",
    "#FF00FF",
  ],

  /* ========= 特殊按键配置 ========= */
  specialKeys: {
    Enter: { text: "↵", color: "#6495ED", sizeScale: 1.5 },
    Backspace: { text: "DEL", color: "#FF4500", sizeScale: 1.5 },
    Delete: { text: "DEL", color: "#FF4500", sizeScale: 1.5 },
    " ": { text: "␣", color: "#808080", sizeScale: 1.0 },
    Tab: { text: "⇥", color: "#808080", sizeScale: 1.2 },
  },
};
/* __AUTO_CONFIG_END__ */

// === SECTION 2: 基础工具函数 ===

const getRandomColor = () => {
  return explosionConfig.colors[
    Math.floor(Math.random() * explosionConfig.colors.length)
  ];
};

const getRandomRange = (min, max) => {
  return Math.random() * (max - min) + min;
};

// === SECTION 3: 渲染引擎 ===

class CursorExplosionEffect {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.particles = [];
    this.paused = false;

    this.init();
  }

  init() {
    // 1. 初始化 Canvas
    this.canvas.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99999;
    `;
    document.body.appendChild(this.canvas);

    // 2. 窗口大小监听
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // 3. 页面可见性监听
    document.addEventListener("visibilitychange", () => {
      this.paused = document.hidden;
    });

    // 4. 键盘监听
    window.addEventListener("keydown", (e) => {
      if (["Control", "Alt", "Shift", "Meta", "CapsLock"].includes(e.key))
        return;
      this.spawnExplosion(e.key);
    });

    // 5. 启动循环
    this.loop();
  }

  /**
   * 核心修复：获取光标精确位置
   */
  getCursorPosition() {
    // 步骤 1: 必须先找到“当前获得焦点”的编辑器容器
    // VSCode 可能有多个编辑器（分屏），只有 focused 的那个才是我们在打字的
    const activeEditor = document.querySelector(".monaco-editor.focused");

    if (!activeEditor) {
      // 尝试退一步，查找可能存在的任意光标（容错）
      return this.findAnyVisibleCursor();
    }

    // 步骤 2: 在聚焦的编辑器中查找光标元素 (.cursor)
    const cursors = activeEditor.querySelectorAll(".cursor");
    for (const cursor of cursors) {
      const rect = cursor.getBoundingClientRect();
      // 验证坐标有效性：不能是 (0,0)，必须在视口内
      if (this.isValidRect(rect)) {
        return { x: rect.left, y: rect.top };
      }
    }

    // 步骤 3: 备用方案 - 查找 inputarea (VSCode 的隐藏输入框，通常跟随光标)
    // 当光标闪烁处于“消失”状态时，这个元素通常还在位置上
    const inputArea = activeEditor.querySelector(".inputarea");
    if (inputArea) {
      const rect = inputArea.getBoundingClientRect();
      if (this.isValidRect(rect)) {
        return { x: rect.left, y: rect.top };
      }
    }

    return null;
  }

  // 辅助：查找全局任意可见光标 (兜底)
  findAnyVisibleCursor() {
    const allCursors = document.querySelectorAll(".monaco-editor .cursor");
    for (const cursor of allCursors) {
      const rect = cursor.getBoundingClientRect();
      if (this.isValidRect(rect)) {
        return { x: rect.left, y: rect.top };
      }
    }
    return null;
  }

  // 辅助：验证矩形是否有效
  isValidRect(rect) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top > 5 &&
      rect.left > 5 && // 排除左上角 (0,0) 的情况
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  spawnExplosion(key) {
    const pos = this.getCursorPosition();
    if (!pos) return; // 如果找不到位置，绝不在左上角生成

    let text = key;
    let color = getRandomColor();
    let scale = 1;

    // 特殊按键处理
    if (explosionConfig.specialKeys[key]) {
      const config = explosionConfig.specialKeys[key];
      text = config.text;
      color = config.color;
      scale = config.sizeScale;
    } else if (key.length > 1) {
      return;
    }

    // 微调位置：pos.x 是光标左边缘。
    // 我们希望字出现在光标左边一点点（覆盖掉刚打出的字），而不是光标右边。
    const xOffset = -10;
    const yOffset = 0;

    this.particles.push({
      x: pos.x + xOffset,
      y: pos.y + yOffset,
      text: text,
      color: color,
      scale: scale,
      // 速度随机化
      vx: getRandomRange(
        -explosionConfig.initialVelocityX,
        explosionConfig.initialVelocityX,
      ),
      vy: explosionConfig.initialVelocityY * (scale > 1.2 ? 1.3 : 1),
      life: 1.0,
      font: `${explosionConfig.fontWeight} ${explosionConfig.fontSize * scale}px ${explosionConfig.fontFamily}`,
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // 物理更新
      p.x += p.vx;
      p.y += p.vy;
      p.vy += explosionConfig.gravity;
      p.life -= explosionConfig.lifeDecay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.font = p.font;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;

      // 发光效果
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;

      // 绘制文字
      ctx.fillText(p.text, p.x, p.y + explosionConfig.fontSize * p.scale);
      ctx.restore();
    }
  }

  loop() {
    if (!this.paused) this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

// 启动
try {
  new CursorExplosionEffect();
  console.log("Cursor Explosion Effect Loaded (Fixed Position).");
} catch (e) {
  console.error("Cursor Explosion Error:", e);
}
