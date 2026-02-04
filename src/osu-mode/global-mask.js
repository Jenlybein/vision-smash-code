/**
 * global-mask.js
 * 在页面全局创建一个透明遮罩 (overlay)，并在正中间渲染一个抖动的方块。
 * 这是一个极简、无依赖的实现，便于在 VS Code webview 或其它 DOM 注入场景使用。
 *
 * API:
 *   const mask = new GlobalMask(options);
 *   mask.show();
 *   mask.hide();
 *   mask.toggle();
 *   mask.update({ squareSize, squareColor, shakeDuration, zIndex });
 *   mask.destroy();
 *
 */
(function (global) {
  const STYLE_ID = "vsm-global-mask-style";
  const OVERLAY_ID = "vsm-global-overlay";
  const SQUARE_CLASS = "vsm-jitter-square";

  const defaultConfig = {
    zIndex: 9999,
    squareSize: 60, // px
    squareColor: "#FF6B6B",
    shakeDuration: 0.18, // s
    opacityTransition: 120, // ms
  };

  class GlobalMask {
    /**
     * @param {{ zIndex?: number, squareSize?: number, squareColor?: string, shakeDuration?: number, opacityTransition?: number }} [options]
     */
    constructor(options = {}) {
      this.config = { ...defaultConfig, ...options };
      /** @type {HTMLDivElement | null} */
      this.overlay = null;
      /** @type {HTMLDivElement | null} */
      this.square = null;
      /** @type {boolean} */
      this._isVisible = false;
      this._init();
    }

    _init() {
      if (typeof document === "undefined") return;

      // 注入样式（只注入一次）
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = this._generateCss();
        document.head.appendChild(style);
      }

      // 防止重复创建 overlay
      /** @type {HTMLDivElement | null} */
      let overlay = /** @type {HTMLDivElement | null} */ (
        document.getElementById(OVERLAY_ID)
      );
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.className = "vsm-global-overlay";
        overlay.style.opacity = "0";
        overlay.style.pointerEvents = "none"; // 不阻塞交互
        overlay.style.zIndex = String(this.config.zIndex);

        /** @type {HTMLDivElement} */
        const square = /** @type {HTMLDivElement} */ (
          document.createElement("div")
        );
        square.className = SQUARE_CLASS;
        square.style.width = `${this.config.squareSize}px`;
        square.style.height = `${this.config.squareSize}px`;
        square.style.background = this.config.squareColor;
        square.style.animationDuration = `${this.config.shakeDuration}s`;

        overlay.appendChild(square);
        (document.body || document.documentElement).appendChild(overlay);

        this.overlay = overlay;
        this.square = square;
      } else {
        this.overlay = overlay;
        this.square = /** @type {HTMLDivElement | null} */ (
          overlay.querySelector(`.${SQUARE_CLASS}`)
        );
        if (this.square) {
          this.square.style.width = `${this.config.squareSize}px`;
          this.square.style.height = `${this.config.squareSize}px`;
          this.square.style.background = this.config.squareColor;
          this.square.style.animationDuration = `${this.config.shakeDuration}s`;
        }
      }
    }

    /**
     * Generate CSS string.
     * @returns {string}
     */
    _generateCss() {
      return `
        .vsm-global-overlay {
          pointer-events: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          transition: opacity ${this.config.opacityTransition}ms ease;
        }
        .vsm-jitter-square {
          width: ${this.config.squareSize}px;
          height: ${this.config.squareSize}px;
          border-radius: 6px;
          transform-origin: center center;
          will-change: transform;
          box-shadow: 0 6px 18px rgba(0,0,0,0.12);
          animation-name: vsm-jitter;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          animation-duration: ${this.config.shakeDuration}s;
        }
        @keyframes vsm-jitter {
          0%   { transform: translate(0, 0) rotate(0deg); }
          20%  { transform: translate(-3px, 1px) rotate(-0.6deg); }
          40%  { transform: translate(2px, -2px) rotate(0.6deg); }
          60%  { transform: translate(-2px, 2px) rotate(-0.4deg); }
          80%  { transform: translate(1px, -1px) rotate(0.4deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .vsm-jitter-square {
            animation: none !important;
            transition: transform ${this.config.opacityTransition}ms linear;
          }
        }
      `;
    }

    /**
     * Show the overlay.
     * @returns {void}
     */
    show() {
      if (!this.overlay) this._init();
      if (!this.overlay) return;
      this.overlay.style.opacity = "1";
      this._isVisible = true;
    }

    /**
     * Hide the overlay.
     * @returns {void}
     */
    hide() {
      if (!this.overlay) return;
      this.overlay.style.opacity = "0";
      this._isVisible = false;
    }

    /**
     * Toggle visibility.
     * @returns {void}
     */
    toggle() {
      if (this._isVisible) this.hide();
      else this.show();
    }

    /**
     * Update configuration.
     * @param {{ zIndex?: number, squareSize?: number, squareColor?: string, shakeDuration?: number, opacityTransition?: number }|undefined} [options]
     * @returns {void}
     */
    update(options = {}) {
      this.config = { ...this.config, ...options };
      if (!this.square || !this.overlay) return;
      if (options.squareSize) {
        this.square.style.width = `${options.squareSize}px`;
        this.square.style.height = `${options.squareSize}px`;
      }
      if (options.squareColor)
        this.square.style.background = options.squareColor;
      if (options.shakeDuration)
        this.square.style.animationDuration = `${options.shakeDuration}s`;
      if (options.zIndex) this.overlay.style.zIndex = String(options.zIndex);
    }

    /**
     * Destroy overlay and injected style.
     * @returns {void}
     */
    destroy() {
      if (this.overlay && this.overlay.parentNode)
        this.overlay.parentNode.removeChild(this.overlay);
      const style = document.getElementById(STYLE_ID);
      if (style && style.parentNode) style.parentNode.removeChild(style);
      this.overlay = null;
      this.square = null;
      this._isVisible = false;
    }
  }

  // 暴露到全局，方便在控制台或注入场景直接用
  if (typeof global !== "undefined") {
    /** @typedef {Window & typeof globalThis & { GlobalMask?: typeof GlobalMask }} GlobalWindow */
    /** @type {GlobalWindow} */ (global).GlobalMask = GlobalMask;
  }
  if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    /** @type {typeof GlobalMask} */ (module.exports) = GlobalMask;
  }
})(typeof window !== "undefined" ? window : this);
(function (global) {})(typeof window !== "undefined" ? window : this);