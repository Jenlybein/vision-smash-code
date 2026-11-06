/**
 * 标记块类效果的「配置块正文」排版。
 *
 * ## 为什么这些排版留在这里，而不是进 refresh-plan.js
 *
 * 光标拖尾的配置块是 `JSON.stringify(config, null, 2)` 能还原的**纯数据**形状；
 * 鼠标尾迹与文字爆炸不是：它们的正文是手工排版的带注释文本——分成若干小节，每节前有一行
 * 块注释形式的小节标题（如「颜色 / 透明度」「阴影 / 发光」），每个字段后面跟着 `//` 说明，
 * 小节之间用空行分组。用 JSON 渲染器重排会把这些注释与空行全部抹掉，
 * 生成内容就不再与迁移前一致。
 *
 * 所以接缝（marker-block）只负责"定位标记 / 整块替换 / 头部插入"这些真正共用的逻辑，
 * 并额外接受一个**预渲染好的正文**（`body` 载荷）；每个效果自己的版面留在效果这一侧。
 * 每个效果变化的是数据（版面），而不是行为，因此不构成新的接缝。
 *
 * ## 为什么是独立模块
 *
 * 这两个函数是纯的：不 import `vscode`、不 import `fs`、不读配置。
 * 这样 `node --test` 可以直接加载它们，与迁移前的旧实现**逐字节比对**。
 * 若把它们放进 `src/install/*-inject.js`（那些模块顶部就 `import * as vscode`），
 * 测试就只能把同一份排版逻辑抄一遍再自己断言自己——那样的测试没有价值。
 */

/**
 * 鼠标尾迹配置块正文（标记之间的内容）。
 *
 * 值按模板字符串原样插值（与迁移前一致），因此数字的写法由调用方给的快照决定，
 * 例如 `1.0` 渲染成 `1`。任何一处空格、注释、字段顺序的改动都会破坏逐字节等价。
 *
 * @param {{
 *   mode: string,
 *   tailColor: string,
 *   tailOpacity: number,
 *   useShadow: boolean,
 *   shadowColor: string,
 *   shadowBlurFactor: number,
 *   pointLife: number,
 *   maxPoints: number,
 *   startWidth: number,
 *   widthPower: number,
 *   widthDecay: number,
 *   energyCompensation: number,
 * }} config
 * @returns {string}
 */
export function renderMouseConfigBody(config) {
  return [
    "const mouseConfig = {",
    `  mode: "${config.mode}", // dots | ribbon | beam | electric | smoke`,
    "",
    "  /* ========= 颜色 / 透明度 ========= */",
    `  tailColor: "${config.tailColor}", // 尾迹主颜色（HEX）`,
    `  tailOpacity: ${config.tailOpacity}, // 全局透明度倍率（0 ~ 1）`,
    "",
    "  /* ========= 阴影 / 发光 ========= */",
    `  useShadow: ${config.useShadow}, // 是否启用发光阴影`,
    `  shadowColor: "${config.shadowColor}", // 阴影颜色（HEX）`,
    `  shadowBlurFactor: ${config.shadowBlurFactor}, // 阴影模糊强度（乘以 startWidth）`,
    "",
    "  /* ========= 尾迹长度 / 生命周期 ========= */",
    `  pointLife: ${config.pointLife}, // 点的生命衰减速度`,
    `  maxPoints: ${config.maxPoints}, // 最大点数量`,
    "",
    "  /* ========= 宽度控制 ========= */",
    `  startWidth: ${config.startWidth}, // 鼠标头部最大宽度`,
    `  widthPower: ${config.widthPower}, // 宽度衰减指数`,
    `  widthDecay: ${config.widthDecay}, // 宽度整体缩放系数`,
    "",
    "  /* ========= 亮度 / 能量 ========= */",
    `  energyCompensation: ${config.energyCompensation}, // 细线时的亮度补偿`,
    "};",
  ].join("\n");
}

/**
 * 文字爆炸配置块正文（标记之间的内容）。
 *
 * 三层嵌套配置对象（gravity / zoom / drift）与颜色数组是逐项手工排版的：
 * 嵌套对象多两级缩进，颜色数组每项一行。同样按模板字符串原样插值。
 *
 * @param {{
 *   fontFamily: string,
 *   fontSize: number,
 *   fontWeight: string,
 *   mode: string,
 *   offsetX: number,
 *   offsetY: number,
 *   fixedTilt: number,
 *   randomTilt: number,
 *   gravityConfig: { gravity: number, initialVelocityY: number, initialVelocityX: number, lifeDecay: number },
 *   zoomConfig: { initialScale: number, maxScale: number, minScale: number, zoomSpeed: number, shrinkSpeed: number, lifeDecay: number },
 *   driftConfig: { upwardSpeed: number, swingRange: number, swingSpeed: number, lifeDecay: number },
 *   colors: string[],
 * }} config
 * @returns {string}
 */
export function renderWordConfigBody(config) {
  return [
    "const explosionConfig = {",
    "  /* ========= 基础设置 ========= */",
    `  fontFamily: "${config.fontFamily}",`,
    `  fontSize: ${config.fontSize},`,
    `  fontWeight: "${config.fontWeight}",`,
    `  mode: "${config.mode}", // 'random', 'gravity', 'zoom', 'drift'`,
    "",
    "  /* ========= 特效位置偏移 ========= */",
    `  offsetX: ${config.offsetX},`,
    `  offsetY: ${config.offsetY},`,
    "",
    "  /* ========= 旋转设置 ========= */",
    `  fixedTilt: ${config.fixedTilt}, // 固定起始角度 (单位：度)`,
    `  randomTilt: ${config.randomTilt}, // 随机范围角度 (单位：度, 0代表不随机)`,
    "",
    "  /* ========= 1. 重力效果参数 (gravity) ========= */",
    "  gravityConfig: {",
    `    gravity: ${config.gravityConfig.gravity}, // 重力加速度`,
    `    initialVelocityY: ${config.gravityConfig.initialVelocityY}, // 向上弹射力度`,
    `    initialVelocityX: ${config.gravityConfig.initialVelocityX}, // 横向扩散范围`,
    `    lifeDecay: ${config.gravityConfig.lifeDecay}, // 消失速度`,
    "  },",
    "",
    "  /* ========= 2. 缩放效果参数 (zoom) ========= */",
    "  zoomConfig: {",
    `    initialScale: ${config.zoomConfig.initialScale}, // 初始大小倍数`,
    `    maxScale: ${config.zoomConfig.maxScale}, // 最大扩张倍数`,
    `    minScale: ${config.zoomConfig.minScale}, // 缩小后的最终大小`,
    `    zoomSpeed: ${config.zoomConfig.zoomSpeed}, // 变大速率`,
    `    shrinkSpeed: ${config.zoomConfig.shrinkSpeed}, // 最大后的缩小速率`,
    `    lifeDecay: ${config.zoomConfig.lifeDecay}, // 透明度消失速度`,
    "  },",
    "",
    "  /* ========= 3. 漂浮效果参数 (drift) ========= */",
    "  driftConfig: {",
    `    upwardSpeed: ${config.driftConfig.upwardSpeed}, // 向上漂浮速度`,
    `    swingRange: ${config.driftConfig.swingRange}, // 左右摆动幅度`,
    `    swingSpeed: ${config.driftConfig.swingSpeed}, // 摆动频率`,
    `    lifeDecay: ${config.driftConfig.lifeDecay}, // 消失速度`,
    "  },",
    "",
    "  /* ========= 颜色列表 ========= */",
    "  colors: [",
    ...config.colors.map((c) => `    "${c}",`),
    "  ],",
    "};",
  ].join("\n");
}
