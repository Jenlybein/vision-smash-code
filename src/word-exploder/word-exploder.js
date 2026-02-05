/* __AUTO_CONFIG_START__ */
const explosionConfig = {
  /* ========= 基础设置 ========= */
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 25,
  fontWeight: "bold",
  mode: "drift", // 'random', 'gravity', 'zoom', 'drift'

  /* ========= 特效位置偏移 ========= */
  offsetX: -15,
  offsetY: -25,

  /* ========= 1. 重力效果参数 (gravity) ========= */
  gravityConfig: {
    gravity: 0.08, // 重力加速度
    initialVelocityY: -3.5, // 向上弹射力度
    initialVelocityX: 1.0, // 横向扩散范围
    lifeDecay: 0.015, // 消失速度
  },

  /* ========= 2. 缩放效果参数 (zoom) ========= */
  zoomConfig: {
    initialScale: 0.5, // 初始大小倍数
    maxScale: 2.0, // 最大扩张倍数
    zoomSpeed: 0.15, // 变大速率 (每帧增加的scale)
    lifeDecay: 0.02, // 变小时的消失速度 (影响透明度和生命周期)
  },

  /* ========= 3. 漂浮效果参数 (drift) ========= */
  driftConfig: {
    upwardSpeed: 1.2, // 向上漂浮速度
    swingRange: 15, // 左右摆动幅度
    swingSpeed: 0.06, // 摆动频率
    lifeDecay: 0.02, // 消失速度
  },

  /* ========= 颜色列表 ========= */
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

// === 特殊按键配置 ===
explosionConfig.specialKeys = {
  Enter: { text: "⏎", color: "#6495ED", sizeScale: 1 },
  Backspace: { text: "⌫", color: "#FF4500", sizeScale: 1 },
  " ": { text: "␣", color: "#808080", sizeScale: 1.2 },
};

// === 渲染策略引擎 ===
const EFFECT_RENDERERS = {
  // --- 重力模式 ---
  gravity: {
    init(p) {
      const cfg = explosionConfig.gravityConfig;
      p.vx = (Math.random() - 0.5) * 2 * cfg.initialVelocityX;
      p.vy = cfg.initialVelocityY;
      p.decay = cfg.lifeDecay;
    },
    update(p) {
      const cfg = explosionConfig.gravityConfig;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += cfg.gravity;
      p.life -= p.decay;
    },
    draw(ctx, p) {
      this.commonDraw(ctx, p, explosionConfig.fontSize * p.baseScale);
    },
    commonDraw(ctx, p, size) {
      ctx.font = `${explosionConfig.fontWeight} ${size}px ${explosionConfig.fontFamily}`;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillText(p.text, p.x, p.y);
    },
  },

  // --- 缩放模式 ---
  zoom: {
    init(p) {
      const cfg = explosionConfig.zoomConfig;
      p.currentScale = cfg.initialScale;
      p.stage = "growing"; // 'growing' or 'fading'
      p.decay = cfg.lifeDecay;
    },
    update(p) {
      const cfg = explosionConfig.zoomConfig;
      if (p.stage === "growing") {
        p.currentScale += cfg.zoomSpeed;
        if (p.currentScale >= cfg.maxScale) {
          p.stage = "fading";
        }
      } else {
        p.currentScale -= cfg.zoomSpeed * 0.5;
        p.life -= p.decay;
      }
    },
    draw(ctx, p) {
      const size = explosionConfig.fontSize * p.currentScale * p.baseScale;
      ctx.font = `${explosionConfig.fontWeight} ${size}px ${explosionConfig.fontFamily}`;
      ctx.globalAlpha = Math.max(0, p.life);
      // 稍微做点居中偏移处理，让缩放看起来是从中心进行的
      const offset = (size - explosionConfig.fontSize) / 2;
      ctx.fillText(p.text, p.x - offset, p.y);
    },
  },

  // --- 漂浮模式 ---
  drift: {
    init(p) {
      const cfg = explosionConfig.driftConfig;
      p.originX = p.x;
      p.time = 0;
      p.decay = cfg.lifeDecay;
    },
    update(p) {
      const cfg = explosionConfig.driftConfig;
      p.time += cfg.swingSpeed;
      p.y -= cfg.upwardSpeed;
      p.x = p.originX + Math.sin(p.time) * cfg.swingRange;
      p.life -= p.decay;
    },
    draw(ctx, p) {
      const size = explosionConfig.fontSize * p.baseScale;
      ctx.font = `${explosionConfig.fontWeight} ${size}px ${explosionConfig.fontFamily}`;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillText(p.text, p.x, p.y);
    },
  },
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
    this.cursorManager = new CursorManager(); // 假设 CursorManager 已定义
    this.init();
  }

  init() {
    this.canvas.style.cssText = `position: fixed; inset: 0; pointer-events: none; z-index: 99999;`;
    document.body.appendChild(this.canvas);
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    window.addEventListener("keydown", (e) => {
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      this.spawn(e.key);
    });
    this.loop();
  }

  spawn(key) {
    const positions = this.cursorManager.getAllCursorPositions();
    if (positions.length === 0) return;

    let text = key;
    let color =
      explosionConfig.colors[
        Math.floor(Math.random() * explosionConfig.colors.length)
      ];
    let baseScale = 1;

    if (explosionConfig.specialKeys[key]) {
      const s = explosionConfig.specialKeys[key];
      text = s.text;
      color = s.color;
      baseScale = s.sizeScale;
    }

    // 确定模式
    let mode = explosionConfig.mode;
    if (mode === "random") {
      const modes = Object.keys(EFFECT_RENDERERS);
      mode = modes[Math.floor(Math.random() * modes.length)];
    }

    positions.forEach((pos) => {
      const p = {
        mode,
        text,
        color,
        baseScale,
        x: pos.x + explosionConfig.offsetX,
        y: pos.y + explosionConfig.offsetY,
        life: 1.0,
      };
      // 初始化对应模式的特有属性
      EFFECT_RENDERERS[mode].init(p);
      this.particles.push(p);
    });
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const renderer = EFFECT_RENDERERS[p.mode];

      renderer.update(p);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      renderer.draw(this.ctx, p);
      this.ctx.restore();
    }
  }

  loop() {
    this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

// 启动
new CursorExplosionEffect();
