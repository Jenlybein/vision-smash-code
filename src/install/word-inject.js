import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

// 代码块标记
const blockStart = "/* __AUTO_CONFIG_START__ */";
const blockEnd = "/* __AUTO_CONFIG_END__ */";

// 文字爆炸特效加载文件路径
let targetFilePath = "";
export function init(context) {
  targetFilePath = path.join(
    context.extensionPath,
    "src",
    "word-exploder",
    "word-exploder.js",
  );
  return targetFilePath;
}

// 获取文字爆炸特效配置
function getWordConfig() {
  const vsConfig = vscode.workspace.getConfiguration("visionSmashCode.word");

  return {
    // 基础设置
    fontFamily: vsConfig.get("fontFamily", "Menlo, Monaco, 'Courier New', monospace"),
    fontSize: vsConfig.get("fontSize", 25),
    fontWeight: vsConfig.get("fontWeight", "bold"),
    mode: vsConfig.get("mode", "zoom"),

    // 特效位置偏移
    offsetX: vsConfig.get("offsetX", -10),
    offsetY: vsConfig.get("offsetY", -20),

    // 旋转设置
    fixedTilt: vsConfig.get("fixedTilt", 0),
    randomTilt: vsConfig.get("randomTilt", 30),

    // 重力模式配置
    gravityConfig: {
      gravity: vsConfig.get("gravity.gravity", 0.08),
      initialVelocityY: vsConfig.get("gravity.initialVelocityY", -3.5),
      initialVelocityX: vsConfig.get("gravity.initialVelocityX", 1.0),
      lifeDecay: vsConfig.get("gravity.lifeDecay", 0.015),
    },

    // 缩放模式配置
    zoomConfig: {
      initialScale: vsConfig.get("zoom.initialScale", 0.8),
      maxScale: vsConfig.get("zoom.maxScale", 1.5),
      minScale: vsConfig.get("zoom.minScale", 0.5),
      zoomSpeed: vsConfig.get("zoom.zoomSpeed", 0.15),
      shrinkSpeed: vsConfig.get("zoom.shrinkSpeed", 0.05),
      lifeDecay: vsConfig.get("zoom.lifeDecay", 0.015),
    },

    // 漂浮模式配置
    driftConfig: {
      upwardSpeed: vsConfig.get("drift.upwardSpeed", 1.2),
      swingRange: vsConfig.get("drift.swingRange", 15),
      swingSpeed: vsConfig.get("drift.swingSpeed", 0.06),
      lifeDecay: vsConfig.get("drift.lifeDecay", 0.02),
    },

    // 颜色列表
    colors: vsConfig.get("colors", [
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
  };
}

// 更新配置到目标文件
export async function StyleConfigUpdate() {
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`没找到目标文件: ${targetFilePath}`);
  }
  const originalCode = fs.readFileSync(targetFilePath, "utf8");

  // 生成配置代码块（格式化 JSON，保持可读性）
  const config = getWordConfig();

  // 生成配置代码字符串
  const configLines = [
    `${blockStart}`,
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
    `${blockEnd}`,
  ];

  const configBlock = configLines.join("\n");

  // 构造用于匹配配置代码块的正则表达式
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markerRegex = new RegExp(
    `${escapeRegExp(blockStart)}[\\s\\S]*?${escapeRegExp(blockEnd)}`,
    "m",
  );

  let updatedCode;
  if (markerRegex.test(originalCode)) {
    // 找到已有配置块，直接替换整段内容
    updatedCode = originalCode.replace(markerRegex, configBlock);
  } else {
    // 未找到标记，尝试在文件头插入
    updatedCode = `${configBlock}\n\n${originalCode}`;
  }

  // 写入文件
  fs.writeFileSync(targetFilePath, updatedCode, "utf-8");
}

// 获取加载文件路径
export function GetPath() {
  return targetFilePath;
}
