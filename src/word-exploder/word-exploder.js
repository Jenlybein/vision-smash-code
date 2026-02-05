/* __AUTO_CONFIG_START__ */
const explosionConfig = {
  /* ========= 基础设置 ========= */
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 25,
  fontWeight: "bold",

  /* ========= 特效位置 ========= */
  offsetX: -15,
  offsetY: -25,

  /* ========= 物理效果 ========= */
  gravity: 0.075, // 重力
  initialVelocityY: -3, // 向上弹射力度
  initialVelocityX: 0.8, // 横向扩散范围
  lifeDecay: 0.015, // 消失速度

  /* ========= 随机颜色列表设置 ========= */
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
};
/* __AUTO_CONFIG_END__ */

// === SECTION 1: 特殊按键 ===
explosionConfig.specialKeys = {
  Enter: { text: "⏎", color: "#6495ED", sizeScale: 1 },
  Backspace: { text: "⌫", color: "#FF4500", sizeScale: 1 },
  Delete: { text: "⌫", color: "#FF4500", sizeScale: 1 },
  " ": { text: "␣", color: "#808080", sizeScale: 1.2 },
  Tab: { text: "⇥", color: "#808080", sizeScale: 1.2 },
};

// === SECTION 2: 基础工具函数 ===

const getRandomColor = () => {
  return explosionConfig.colors[
    Math.floor(Math.random() * explosionConfig.colors.length)
  ];
};

const getRandomRange = (min, max) => {
  return Math.random() * (max - min) + min;
};

// === SECTION 3: 光标管理器 (核心新增) ===
class CursorManager {
  constructor() {
    // 缓存选择器字符串
    this.selectors = {
      editor: ".monaco-editor.focused", // 必须是聚焦的编辑器
      cursor: ".cursor", // 所有光标（包括多光标）
      input: ".inputarea", // 备用定位
    };
  }

  /**
   * 获取当前所有有效光标的坐标
   * @returns {Array<{x: number, y: number}>} 坐标数组
   */
  getAllCursorPositions() {
    const activeEditor = document.querySelector(this.selectors.editor);
    if (!activeEditor) return [];

    const positions = [];

    // 1. 获取所有可见的光标元素 (VS Code 在多光标模式下会有多个 .cursor div)
    const cursorNodes = activeEditor.querySelectorAll(this.selectors.cursor);

    if (cursorNodes.length > 0) {
      cursorNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (this.isValidRect(rect)) {
          positions.push({ x: rect.left, y: rect.top });
        }
      });
    }

    // 2. 兜底方案：如果找不到任何 .cursor 元素（极罕见），尝试使用 inputarea
    // inputarea 通常跟随主光标
    if (positions.length === 0) {
      const inputArea = activeEditor.querySelector(this.selectors.input);
      if (inputArea) {
        const rect = inputArea.getBoundingClientRect();
        if (this.isValidRect(rect)) {
          positions.push({ x: rect.left, y: rect.top });
        }
      }
    }

    return positions;
  }

  // 验证坐标是否在视口内的有效区域
  isValidRect(rect) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }
}

// === SECTION 4: 渲染引擎 ===
class CursorExplosionEffect {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.particles = [];
    this.paused = false;

    // 实例化光标管理器
    this.cursorManager = new CursorManager();

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

    // 2. 监听调整大小
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    // 3. 监听可见性
    document.addEventListener("visibilitychange", () => {
      this.paused = document.hidden;
    });

    // 4. 监听键盘输入
    window.addEventListener("keydown", (e) => {
      if (["Control", "Alt", "Shift", "Meta", "CapsLock"].includes(e.key))
        return;
      this.handleInput(e.key);
    });

    // 5. 启动渲染循环
    this.loop();
  }

  // 处理输入事件：获取所有光标位置并在每个位置生成爆炸
  handleInput(key) {
    const positions = this.cursorManager.getAllCursorPositions();

    // 如果没有找到光标，不执行任何操作
    if (positions.length === 0) return;

    // 确定文字样式（只需计算一次）
    let text = key;
    let color = getRandomColor();
    let scale = 1;

    if (explosionConfig.specialKeys[key]) {
      const config = explosionConfig.specialKeys[key];
      text = config.text;
      color = config.color;
      scale = config.sizeScale;
    } else if (key.length > 1) {
      // text = key[0].toUpperCase();
    }

    // 遍历所有光标位置生成粒子
    positions.forEach((pos) => {
      this.createParticle(pos, text, color, scale);
    });
  }

  createParticle(pos, text, color, scale) {
    this.particles.push({
      x: pos.x + explosionConfig.offsetX,
      y: pos.y + explosionConfig.offsetY,
      text: text,
      color: color,
      scale: scale,
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

      // 物理计算
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

      // 阴影发光效果
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;

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
new CursorExplosionEffect();
