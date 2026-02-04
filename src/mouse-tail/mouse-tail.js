// VS Code 鼠标指针尾迹
class MousePointerTrail {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    this.points = [];
    this.maxPoints = 64;

    this.lastX = null;
    this.lastY = null;

    this.init();
  }

  init() {
    // 设置全屏透明画板
    this.canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9999;
        background: transparent;
      `;

    document.body.appendChild(this.canvas);

    // 自适应覆盖窗口大小
    window.addEventListener("resize", () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // 系统鼠标移动
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

    this.points.push({
      x,
      y,
      life: 1,
    });

    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    this.lastX = x;
    this.lastY = y;
  }

  // points[0]：最旧的点，是尾巴
  // points[points.length - 1]：最新的点，是鼠标当前位置
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(255,140,255,0.8)";
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 无论是否画线，所有点都要衰减
    for (const p of this.points) {
      p.life -= 0.03;
    }

    if (this.points.length >= 2) {
      for (let i = 1; i < this.points.length; i++) {
        const p0 = this.points[i - 1];
        const p1 = this.points[i];

        if (p1.life <= 0) continue;

        const k = i / (this.points.length - 1);
        const width = 4 * (k * k * (3 - 2 * k));
        const alpha = p1.life * 0.6;

        ctx.strokeStyle = `rgba(255, 140, 255, ${alpha})`;
        ctx.lineWidth = width;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    ctx.restore();

    // 最终统一清理
    this.points = this.points.filter((p) => p.life > 0);
  }

  loop() {
    this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

// 启动
new MousePointerTrail();
