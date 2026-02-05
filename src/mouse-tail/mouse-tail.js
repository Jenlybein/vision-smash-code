/* __AUTO_CONFIG_START__ */
const mouseConfig = {
  mode: "ribbon", // dots | ribbon | beam | electric | smoke

  /* ========= 颜色 / 透明度 ========= */
  tailColor: "#FFD700", // 尾迹主颜色（HEX）
  tailOpacity: 0.9, // 全局透明度倍率（0 ~ 1）

  /* ========= 阴影 / 发光 ========= */
  useShadow: true, // 是否启用发光阴影
  shadowColor: "#FF0000", // 阴影颜色（HEX）
  shadowBlurFactor: 2, // 阴影模糊强度（乘以 startWidth）

  /* ========= 尾迹长度 / 生命周期 ========= */
  pointLife: 0.03, // 点的生命衰减速度
  maxPoints: 24, // 最大点数量

  /* ========= 宽度控制 ========= */
  startWidth: 4, // 鼠标头部最大宽度
  widthPower: 0.8, // 宽度衰减指数
  widthDecay: 0.8, // 宽度整体缩放系数

  /* ========= 亮度 / 能量 ========= */
  energyCompensation: 0.75, // 细线时的亮度补偿
};
/* __AUTO_CONFIG_END__ */

// === SECTION 2: 基础工具函数 (Utility Functions) ===

// HEX → RGB(255)
const mouseHexToRgb = (hex) => {
  let h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

// === SECTION 3: 渲染函数 (Render Functions) ===

const mouseRenderers = {
  dots(ctx, points) {
    for (const p of points) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life * mouseConfig.tailOpacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, mouseConfig.startWidth * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  ribbon(ctx, points) {
    const len = points.length;
    for (let i = 1; i < len; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (p1.life <= 0) continue;

      const width = this.widthLUT[i];

      ctx.globalAlpha =
        p1.life *
        (width / mouseConfig.startWidth) *
        mouseConfig.energyCompensation *
        mouseConfig.tailOpacity;

      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  },

  beam(ctx, points) {
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (p1.life <= 0) continue;

      ctx.globalAlpha = p1.life * mouseConfig.tailOpacity;
      ctx.lineWidth = mouseConfig.startWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  },

  electric(ctx, points) {
    const jitter = 6;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (p1.life <= 0) continue;

      ctx.globalAlpha = p1.life * mouseConfig.tailOpacity;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x + Math.random() * jitter, p0.y + Math.random() * jitter);
      ctx.lineTo(p1.x + Math.random() * jitter, p1.y + Math.random() * jitter);
      ctx.stroke();
    }
  },

  smoke(ctx, points) {
    for (const p of points) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life * 0.47;
      ctx.beginPath();
      ctx.arc(p.x, p.y, mouseConfig.startWidth * (1 - p.life), 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

// === SECTION 4: 渲染引擎 (Engine) ===

class MousePointerTrail {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    this.points = [];
    this.lastX = null;
    this.lastY = null;

    this.mouseX = null;
    this.mouseY = null;
    this.paused = false;

    const { r, g, b } = mouseHexToRgb(mouseConfig.tailColor);
    this.strokeStyle = `rgb(${r},${g},${b})`;
    this.fillStyle = `rgb(${r},${g},${b})`;

    const sc = mouseHexToRgb(mouseConfig.shadowColor);
    this.shadowCss = `rgba(${sc.r},${sc.g},${sc.b},1)`;

    this.renderer = mouseRenderers[mouseConfig.mode];

    this.init();
  }

  init() {
    this.canvas.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 9999;
    `;
    document.body.appendChild(this.canvas);

    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    window.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    document.addEventListener("visibilitychange", () => {
      this.paused = document.hidden;
    });

    // 生成宽度 LUT (优化性能，不实时计算宽度)
    this.widthLUT = new Array(mouseConfig.maxPoints);
    for (let i = 0; i < mouseConfig.maxPoints; i++) {
      const t = i / (mouseConfig.maxPoints - 1 || 1);
      this.widthLUT[i] =
        mouseConfig.startWidth * Math.pow(t, mouseConfig.widthPower);
    }

    // 生成electric的随机抖动(优化性能，但是这样会固定抖动样式，体现不出来闪电效果)
    // const jitter = 6;
    // this.jitterTable = new Array(16)
    //   .fill(0)
    //   .map(() => (Math.random() - 0.5) * jitter);

    this.loop();
  }

  sampleMouse() {
    if (this.mouseX === null) return;

    if (this.lastX !== null) {
      const dx = this.mouseX - this.lastX;
      const dy = this.mouseY - this.lastY;
      if (dx * dx + dy * dy < 1) return;
    }

    this.points.push({ x: this.mouseX, y: this.mouseY, life: 1 });
    if (this.points.length > mouseConfig.maxPoints) {
      this.points.shift();
    }

    this.lastX = this.mouseX;
    this.lastY = this.mouseY;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.sampleMouse();

    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      p.life -= mouseConfig.pointLife;
      if (p.life <= 0) {
        this.points[i] = this.points[this.points.length - 1];
        this.points.pop();
      }
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.strokeStyle;
    ctx.fillStyle = this.fillStyle;

    if (mouseConfig.useShadow) {
      ctx.shadowBlur = mouseConfig.startWidth * mouseConfig.shadowBlurFactor;
      ctx.shadowColor = this.shadowCss;
    }

    if (mouseConfig.mode === "beam") {
      ctx.globalCompositeOperation = "lighter";
    }

    this.renderer?.(ctx, this.points);

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  loop() {
    if (!this.paused) this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

new MousePointerTrail();
