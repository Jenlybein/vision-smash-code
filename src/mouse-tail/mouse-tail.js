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

// HEX → RGBA(255)
function mouseHexToRgba(hex, alpha255 = 255) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: alpha255,
  };
}

// RGBA → CSS
const mouseRgbaToCss = ({ r, g, b, a }) => `rgba(${r}, ${g}, ${b}, ${a / 255})`;

const mouseClamp = (v, min, max) => Math.min(Math.max(v, min), max);

class MousePointerTrail {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    this.points = [];
    this.lastX = null;
    this.lastY = null;

    this.tailBase = mouseHexToRgba(mouseConfig.tailColor);
    this.shadowBase = mouseHexToRgba(mouseConfig.shadowColor);

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
      this.onMouseMove(e.clientX, e.clientY);
    });

    this.loop();
  }

  onMouseMove(x, y) {
    if (this.lastX !== null) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      if (dx * dx + dy * dy < 1) return;
    }

    this.points.push({ x, y, life: 1 });
    if (this.points.length > mouseConfig.maxPoints) {
      this.points.shift();
    }

    this.lastX = x;
    this.lastY = y;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const p of this.points) {
      p.life -= mouseConfig.pointLife;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (mouseConfig.useShadow) {
      ctx.shadowBlur = mouseConfig.startWidth * mouseConfig.shadowBlurFactor;
      ctx.shadowColor = mouseRgbaToCss({ ...this.shadowBase, a: 255 });
    }

    switch (mouseConfig.mode) {
      /* ========= 圆点 ========= */
      case "dots":
        for (const p of this.points) {
          if (p.life <= 0) continue;
          const r = mouseConfig.startWidth * p.life;
          ctx.fillStyle = mouseRgbaToCss({
            ...this.tailBase,
            a: p.life * 255 * mouseConfig.tailOpacity,
          });
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      /* ========= 丝带 ========= */
      case "ribbon":
        for (let i = 1; i < this.points.length; i++) {
          const p0 = this.points[i - 1];
          const p1 = this.points[i];
          if (p1.life <= 0) continue;

          const t = i / (this.points.length - 1);
          const width =
            mouseConfig.startWidth * Math.pow(t, mouseConfig.widthPower);

          const alpha =
            p1.life *
            (width / mouseConfig.startWidth) *
            mouseConfig.energyCompensation *
            mouseConfig.tailOpacity;

          ctx.strokeStyle = mouseRgbaToCss({
            ...this.tailBase,
            a: mouseClamp(alpha * 255, 0, 255),
          });
          ctx.lineWidth = width;

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        break;

      /* ========= 能量束 ========= */
      case "beam":
        ctx.globalCompositeOperation = "lighter";
        for (let i = 1; i < this.points.length; i++) {
          const p0 = this.points[i - 1];
          const p1 = this.points[i];
          if (p1.life <= 0) continue;

          ctx.lineWidth = mouseConfig.startWidth;
          ctx.strokeStyle = mouseRgbaToCss({
            ...this.tailBase,
            a: p1.life * 255,
          });

          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
        break;

      /* ========= 电流 ========= */
      case "electric":
        for (let i = 1; i < this.points.length; i++) {
          const p0 = this.points[i - 1];
          const p1 = this.points[i];
          if (p1.life <= 0) continue;

          const jitter = 6;
          ctx.lineWidth = 2;
          ctx.strokeStyle = mouseRgbaToCss({
            ...this.tailBase,
            a: p1.life * 255,
          });

          ctx.beginPath();
          ctx.moveTo(
            p0.x + Math.random() * jitter,
            p0.y + Math.random() * jitter,
          );
          ctx.lineTo(
            p1.x + Math.random() * jitter,
            p1.y + Math.random() * jitter,
          );
          ctx.stroke();
        }
        break;

      /* ========= 烟雾 ========= */
      case "smoke":
        for (const p of this.points) {
          if (p.life <= 0) continue;
          const r = mouseConfig.startWidth * (1 - p.life);
          ctx.fillStyle = mouseRgbaToCss({
            ...this.tailBase,
            a: p.life * 120,
          });
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }

    ctx.restore();
    this.points = this.points.filter((p) => p.life > 0);
  }

  loop() {
    this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

new MousePointerTrail();
