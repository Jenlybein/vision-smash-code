import * as path from "node:path";

import {
  ANIMATION_SETTING_KEYS,
  buildAnimationSegments,
} from "./animation-segments.js";
import {
  ANIMATIONS_SOURCE_DIR,
  ANIMATIONS_TARGET_FILE,
} from "./asset-paths.js";
import {
  renderMouseConfigBody,
  renderWordConfigBody,
} from "./marker-bodies.js";

/**
 * 效果数据表：5 类效果各自的「知识」——配置作用域、目标路径、配置快照、描述符载荷。
 *
 * 这是全仓库唯一按效果分叉的地方。行为（读配置 → 构造描述符 → 调 `planRefresh` →
 * 写盘 → 展示错误）只有一份，在 `src/install/refresh-effect.js` 里；本模块只提供数据。
 *
 * 纯模块：不 import vscode、不 import fs、不读配置、不写盘。因此测试可以在纯 Node
 * 环境里给出「扩展安装路径 + 配置快照」，直接断言产出的描述符。
 *
 * ## 每个条目提供什么
 *
 * ```
 * {
 *   label,        // string：展示用名称，也是执行层错误提示的前缀（「光标拖尾：…」）
 *   scope,        // string：`vscode.workspace.getConfiguration(scope)`
 *   baseKey,      // string：总开关在 `visionSmashCode.base` 下的键名
 *   paths,        // (extensionPath) => ({ targetPath, ...该效果自己需要的根目录 })
 *                 //   目标路径解析集中在这里；targetPath 同时就是要注入的文件
 *   readSettings, // (get) => 配置快照（纯对象）。get(name, fallback) 由执行层注入，
 *                 //   生产实现是 `config.get(name, fallback)`；测试可给内存实现。
 *                 //   默认值的折叠发生在这里，所以「未设置时取什么」也可被测试锁定。
 *   describe,     // ({ snapshot, paths }) => 描述符载荷（`kind` 与它的全部字段）
 *                 //   纯映射：相同快照 + 相同路径 → 相同载荷。
 * }
 * ```
 *
 * 描述符的字段语义见 `refresh-plan.js` 的 Interface；本模块只负责把配置搬成那个形状。
 */

// 标记块：三个 JS 类效果共用的起止标记（含注释定界符，按字面量匹配）。
const MARKER_BLOCK = Object.freeze({
  start: "/* __AUTO_CONFIG_START__ */",
  end: "/* __AUTO_CONFIG_END__ */",
});

// 渐变片段：键名与顺序必须与重构前本仓库的循环逐项一致。
// 注意 top-active-tab 在 horizontal 之前——这是既有字节顺序，不要按设置项声明顺序重排。
const GRADIENT_CSS_FILES = [
  "editor-hover",
  "git-num-icon",
  "linenumber-rainbow-glow",
  "quick-input",
  "text-glowing",
  "text-gradient",
  "top-active-tab",
  "horizontal",
];

export const EFFECTS = {
  cursor: {
    label: "光标拖尾",
    scope: "visionSmashCode.cursor",
    baseKey: "cursor",
    paths: (extensionPath) => ({
      targetPath: path.join(
        extensionPath,
        "src",
        "neovide-cursor",
        "neovide-cursor.js",
      ),
    }),
    readSettings: (get) => {
      // 动态计算用于 CSS transition 的时间，避免硬编码
      const tailColor = get("tailColor", "#FFC0CB");
      const fadeSeconds = get("cursorFadeOutDuration", 0.075);

      return {
        // 拖尾颜色与透明度
        tailColor: tailColor,
        tailOpacity: get("tailOpacity", 1),
        // 阴影辉光
        useShadow: get("useShadow", true),
        shadowColor: get("shadowColor", tailColor),
        shadowBlurFactor: get("shadowBlurFactor", 0.5),
        // 全局管理
        cursorDisappearDelay: get("cursorDisappearDelay", 50),
        cursorFadeOutDuration: fadeSeconds,
        // 动画时间
        animationLength: get("animationLength", 0.125),
        shortAnimationLength: get("shortAnimationLength", 0.05),
        shortMoveThreshold: get("shortMoveThreshold", 8),
        // 拖尾动态控制
        rank0TrailFactor: get("rank0TrailFactor", 1.0),
        rank1TrailFactor: get("rank1TrailFactor", 0.9),
        rank2TrailFactor: get("rank2TrailFactor", 0.5),
        rank3TrailFactor: get("rank3TrailFactor", 0.3),
        // 领先角点行为控制
        useHardSnap: get("useHardSnap", true),
        leadingSnapFactor: get("leadingSnapFactor", 0.1),
        leadingSnapThreshold: get("leadingSnapThreshold", 0.5),
        animationResetThreshold: get("animationResetThreshold", 0.075),
        maxTrailDistanceFactor: get("maxTrailDistanceFactor", 100),
        snapAnimationLength: get("snapAnimationLength", 0.02),
        // 生成语句（使用动态时间）
        canvasFadeTransitionCss: `opacity ${fadeSeconds}s ease-out`,
        nativeCursorDisappearTransitionCss: "opacity 0s ease-out",
        nativeCursorRevealTransitionCss: `opacity ${fadeSeconds}s ease-in`,
      };
    },
    // 纯数据载荷：正文就是两空格缩进的 JSON。
    describe: ({ snapshot }) => ({
      kind: "marker-block",
      markers: MARKER_BLOCK,
      variableName: "cursorConfig",
      config: snapshot,
    }),
  },

  animations: {
    label: "窗口动效",
    scope: "visionSmashCode.animations",
    baseKey: "animations",
    paths: (extensionPath) => {
      const cssRoot = path.join(extensionPath, "src", ANIMATIONS_SOURCE_DIR);
      return {
        targetPath: path.join(cssRoot, ANIMATIONS_TARGET_FILE),
        cssRoot,
      };
    },
    // 配置快照：把 WorkspaceConfiguration 摊平成普通对象，
    // 纯函数不依赖 vscode，也就不会在深模块里读到模块级可变状态。
    readSettings: (get) => ({
      settings: Object.fromEntries(
        ANIMATION_SETTING_KEYS.map((key) => [key, get(key)]),
      ),
      durations: get("Durations"),
      defaultDuration: get("Default-Duration"),
    }),
    // 片段布局（顺序、选取规则、时长占位）在 animation-segments.js 里，
    // 这里只把布局与快照接起来。
    describe: ({ snapshot, paths }) => ({
      kind: "css-concat",
      settings: snapshot.settings,
      durations: snapshot.durations,
      defaultDuration: snapshot.defaultDuration,
      segments: buildAnimationSegments(paths.cssRoot),
    }),
  },

  gradient: {
    label: "渐变主题",
    scope: "visionSmashCode.gradient",
    baseKey: "gradient",
    paths: (extensionPath) => {
      const baseRoot = path.join(extensionPath, "src", "gradient-theme");
      return {
        targetPath: path.join(baseRoot, "gradient-theme.css"),
        cssRoot: path.join(baseRoot, "css", "adaptive"),
      };
    },
    readSettings: (get) =>
      Object.fromEntries(GRADIENT_CSS_FILES.map((key) => [key, get(key)])),
    // 每段一个开关，缺省规则 `enabled`（`!== false`）——未设置视为开启。
    describe: ({ snapshot, paths }) => ({
      kind: "css-concat",
      settings: snapshot,
      segments: GRADIENT_CSS_FILES.map((key) => ({
        setting: key,
        path: path.join(paths.cssRoot, `${key}.css`),
      })),
    }),
  },

  mouse: {
    label: "鼠标尾迹",
    scope: "visionSmashCode.mouse",
    baseKey: "mouse",
    paths: (extensionPath) => ({
      targetPath: path.join(
        extensionPath,
        "src",
        "mouse-tail",
        "mouse-tail.js",
      ),
    }),
    readSettings: (get) => ({
      // 模式
      mode: get("mode", "electric"),

      // 颜色 / 透明度
      tailColor: get("tailColor", "#FFC0CB"),
      tailOpacity: get("tailOpacity", 0.9),

      // 阴影 / 发光
      useShadow: get("useShadow", true),
      shadowColor: get("shadowColor", "#FFC0CB"),
      shadowBlurFactor: get("shadowBlurFactor", 1.8),

      // 尾迹长度 / 生命周期
      pointLife: get("pointLife", 0.03),
      maxPoints: get("maxPoints", 50),

      // 宽度控制
      startWidth: get("startWidth", 5),
      widthPower: get("widthPower", 1.4),
      widthDecay: get("widthDecay", 1.0),

      // 亮度 / 能量
      energyCompensation: get("energyCompensation", 0.75),
    }),
    // 正文（带分节注释的手工排版）由 marker-bodies.js 渲染：标记定位 / 整块替换 /
    // 头部插入这些共用逻辑在接缝里，版面留在效果这一侧。
    describe: ({ snapshot }) => ({
      kind: "marker-block",
      markers: MARKER_BLOCK,
      body: renderMouseConfigBody(snapshot),
    }),
  },

  word: {
    label: "文字爆炸",
    scope: "visionSmashCode.word",
    baseKey: "word",
    paths: (extensionPath) => ({
      targetPath: path.join(
        extensionPath,
        "src",
        "word-exploder",
        "word-exploder.js",
      ),
    }),
    readSettings: (get) => ({
      // 基础设置
      fontFamily: get("fontFamily", "Menlo, Monaco, 'Courier New', monospace"),
      fontSize: get("fontSize", 25),
      fontWeight: get("fontWeight", "bold"),
      mode: get("mode", "zoom"),

      // 特效位置偏移
      offsetX: get("offsetX", -10),
      offsetY: get("offsetY", -20),

      // 旋转设置
      fixedTilt: get("fixedTilt", 0),
      randomTilt: get("randomTilt", 30),

      // 重力模式配置
      gravityConfig: {
        gravity: get("gravity.gravity", 0.08),
        initialVelocityY: get("gravity.initialVelocityY", -3.5),
        initialVelocityX: get("gravity.initialVelocityX", 1.0),
        lifeDecay: get("gravity.lifeDecay", 0.015),
      },

      // 缩放模式配置
      zoomConfig: {
        initialScale: get("zoom.initialScale", 0.8),
        maxScale: get("zoom.maxScale", 1.5),
        minScale: get("zoom.minScale", 0.5),
        zoomSpeed: get("zoom.zoomSpeed", 0.15),
        shrinkSpeed: get("zoom.shrinkSpeed", 0.05),
        lifeDecay: get("zoom.lifeDecay", 0.015),
      },

      // 漂浮模式配置
      driftConfig: {
        upwardSpeed: get("drift.upwardSpeed", 1.2),
        swingRange: get("drift.swingRange", 15),
        swingSpeed: get("drift.swingSpeed", 0.06),
        lifeDecay: get("drift.lifeDecay", 0.02),
      },

      // 颜色列表
      colors: get("colors", [
        "#FFD700",
        "#FF6347",
        "#00BFFF",
        "#32CD32",
        "#FF69B4",
        "#8A2BE2",
        "#FFA500",
        "#00FA9A",
        "#FF00FF",
      ]),
    }),
    // 正文（嵌套配置 + 颜色数组 + 分节注释）由 marker-bodies.js 渲染。
    describe: ({ snapshot }) => ({
      kind: "marker-block",
      markers: MARKER_BLOCK,
      body: renderWordConfigBody(snapshot),
    }),
  },
};

/**
 * 解析某个效果的目标文件路径（本地绝对路径，同时就是要注入的文件）。
 *
 * 路径解析只有数据表这一处事实来源：`extension.js` 的模块声明表与内容生成都走它，
 * 因此不会出现"写进 A 文件、注入 B 文件"的分叉。
 *
 * @param {string} key 效果键
 * @param {string} extensionPath 扩展安装目录
 * @returns {string}
 */
export function resolveEffectTargetPath(key, extensionPath) {
  return EFFECTS[key].paths(extensionPath).targetPath;
}

/**
 * 把「效果 + 扩展安装路径 + 配置快照」映射成 `planRefresh` 认识的效果描述符。
 *
 * 纯函数：不读配置、不读文件、不写盘。描述符里包含 `targetPath`（来自该效果的路径
 * 解析）与 `kind` 决定的载荷（`markers` / `body` / `segments` 等），
 * 但**不含** `enabled`——内容生成与总开关无关，`enabled` 只供导入规划使用。
 *
 * @param {keyof typeof EFFECTS | string} key 效果键（同时也是 changeStates 的键）
 * @param {{ extensionPath: string, snapshot: object }} input
 * @returns {{ key: string, targetPath: string, kind: string } & Record<string, unknown>}
 */
export function buildEffectDescriptor(key, { extensionPath, snapshot }) {
  const effect = EFFECTS[key];
  const paths = effect.paths(extensionPath);

  return {
    key,
    targetPath: paths.targetPath,
    ...effect.describe({ snapshot, paths }),
  };
}
