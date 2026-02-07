/* __AUTO_CONFIG_START__ */
const explosionConfig = {
  /* ========= 基础设置 ========= */
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 25,
  fontWeight: "bold",
  mode: "zoom", // 'random', 'gravity', 'zoom', 'drift'

  /* ========= 特效位置偏移 ========= */
  offsetX: -10,
  offsetY: -20,

  /* ========= 旋转设置 ========= */
  fixedTilt: 10, // 固定起始角度 (单位：度)
  randomTilt: 0, // 随机范围角度 (单位：度, 0代表不随机)

  /* ========= 1. 重力效果参数 (gravity) ========= */
  gravityConfig: {
    gravity: 0.08, // 重力加速度
    initialVelocityY: -3.5, // 向上弹射力度
    initialVelocityX: 1, // 横向扩散范围
    lifeDecay: 0.015, // 消失速度
  },

  /* ========= 2. 缩放效果参数 (zoom) ========= */
  zoomConfig: {
    initialScale: 1.5, // 初始大小倍数
    maxScale: 2, // 最大扩张倍数
    minScale: 0.5, // 缩小后的最终大小
    zoomSpeed: 0.1, // 变大速率
    shrinkSpeed: 0.01, // 最大后的缩小速率
    lifeDecay: 0.01, // 透明度消失速度
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

  bannedKeys: [
    "Control",
    "Alt",
    "Shift",
    "Meta",
    "Tab",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Insert",
    "CapsLock",
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
      const size = explosionConfig.fontSize * p.baseScale;
      ctx.font = `${explosionConfig.fontWeight} ${size}px ${explosionConfig.fontFamily}`;
      ctx.fillText(p.text, 0, 0); // 在(0,0)绘图，位置由外层translate控制
    },
  },

  zoom: {
    init(p) {
      const cfg = explosionConfig.zoomConfig;
      p.currentScale = cfg.initialScale;
      p.stage = "growing";
      p.decay = cfg.lifeDecay;
    },
    update(p) {
      const cfg = explosionConfig.zoomConfig;
      if (p.stage === "growing") {
        p.currentScale += cfg.zoomSpeed;
        if (p.currentScale >= cfg.maxScale) p.stage = "shrinking";
      } else {
        if (p.currentScale > cfg.minScale) p.currentScale -= cfg.shrinkSpeed;
        p.life -= p.decay;
      }
    },
    draw(ctx, p) {
      const size = explosionConfig.fontSize * p.currentScale * p.baseScale;
      ctx.font = `${explosionConfig.fontWeight} ${size}px ${explosionConfig.fontFamily}`;
      ctx.fillText(p.text, 0, 0);
    },
  },

  drift: {
    init(p) {
      p.originX = p.x;
      p.time = 0;
      p.decay = explosionConfig.driftConfig.lifeDecay;
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
      ctx.fillText(p.text, 0, 0);
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

  refresh() {
    this.editor = document.querySelector(".monaco-editor.focused");
    if (this.editor) {
      this.cursorNodes = this.editor.querySelectorAll(".cursor");
    } else {
      this.cursorNodes = [];
    }
  }

  // 获取当前所有有效光标的坐标
  getAllCursorPositions() {
    const activeEditor = document.querySelector(this.selectors.editor);
    if (!activeEditor) return [];

    const positions = [];

    // 获取所有可见的光标元素 (VS Code 在多光标模式下会有多个 .cursor div)
    const cursorNodes = activeEditor.querySelectorAll(this.selectors.cursor);

    if (cursorNodes.length > 0) {
      cursorNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (this.isValidRect(rect)) {
          positions.push({ x: rect.left, y: rect.top });
        }
      });
    }

    const inputArea = activeEditor.querySelector(this.selectors.input);
    if (inputArea) {
      const rect = inputArea.getBoundingClientRect();
      if (this.isValidRect(rect)) {
        positions.push({ x: rect.left, y: rect.top });
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
    this.cursorManager = new CursorManager();
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
      if (explosionConfig.bannedKeys.includes(e.key)) return;
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

    // 计算旋转角度 (转为弧度)
    const degToRad = (deg) => (deg * Math.PI) / 180;
    const baseRotation = degToRad(explosionConfig.fixedTilt);
    const randomRange = degToRad(explosionConfig.randomTilt);
    const rotation = baseRotation + (Math.random() - 0.5) * randomRange;

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
        rotation, // 存储每个粒子独有的角度
        x: pos.x + explosionConfig.offsetX,
        y: pos.y + explosionConfig.offsetY,
        life: 1.0,
      };
      EFFECT_RENDERERS[mode].init(p);
      this.particles.push(p);
    });
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const renderer = EFFECT_RENDERERS[p.mode];

      renderer.update(p);

      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }

      this.ctx.save();

      // 1. 移动绘图中心到粒子坐标
      this.ctx.translate(p.x, p.y);

      // 2. 旋转画布
      this.ctx.rotate(p.rotation);

      // 3. 设置样式
      this.ctx.fillStyle = p.color;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.globalAlpha = Math.max(0, p.life);

      // 4. 执行绘图
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
