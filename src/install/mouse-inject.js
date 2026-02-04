import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

// 代码块标记
const blockStart = "/* __AUTO_CONFIG_START__ */";
const blockEnd = "/* __AUTO_CONFIG_END__ */";

// 鼠标尾迹特效加载文件路径
let targetFilePath = "";

export function init(context) {
  targetFilePath = path.join(
    context.extensionPath,
    "src",
    "mouse-tail",
    "mouse-tail.js",
  );
  return targetFilePath;
}

// 获取鼠标尾迹特效配置
function getMouseConfig() {
  const vsConfig = vscode.workspace.getConfiguration("visionSmashCode.mouse");

  return {
    // 模式
    mode: vsConfig.get("mode", "electric"),

    // 颜色 / 透明度
    tailColor: vsConfig.get("tailColor", "#FFC0CB"),
    tailOpacity: vsConfig.get("tailOpacity", 0.9),

    // 阴影 / 发光
    useShadow: vsConfig.get("useShadow", true),
    shadowColor: vsConfig.get("shadowColor", "#FFC0CB"),
    shadowBlurFactor: vsConfig.get("shadowBlurFactor", 1.8),

    // 尾迹长度 / 生命周期
    pointLife: vsConfig.get("pointLife", 0.03),
    maxPoints: vsConfig.get("maxPoints", 50),

    // 宽度控制
    startWidth: vsConfig.get("startWidth", 5),
    widthPower: vsConfig.get("widthPower", 1.4),
    widthDecay: vsConfig.get("widthDecay", 1.0),

    // 亮度 / 能量
    energyCompensation: vsConfig.get("energyCompensation", 0.75),
  };
}

// 更新配置到目标文件
export async function StyleConfigUpdate() {
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`没找到目标文件: ${targetFilePath}`);
  }
  const originalCode = fs.readFileSync(targetFilePath, "utf8");

  // 生成配置代码块（格式化 JSON，保持可读性）
  const config = getMouseConfig();

  // 生成配置代码字符串，保持与 mouse-tail.js 相同的格式
  const configLines = [
    `${blockStart}`,
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
