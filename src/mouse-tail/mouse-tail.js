// VS Code 鼠标指针尾迹
class MousePointerTrail {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    this.points = [];
    this.maxPoints = 32;

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

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      p.life -= 0.035;
      if (p.life <= 0) continue;

      const t = i / this.points.length;
      const radius = 4 + t * 6;
      const alpha = Math.min(1, p.life * 0.8);

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 140, 255, ${alpha})`;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    this.points = this.points.filter((p) => p.life > 0);
  }

  loop() {
    this.draw();
    requestAnimationFrame(() => this.loop());
  }
}

// 启动
new MousePointerTrail();
