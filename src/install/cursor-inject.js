import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

// 代码块标记
const blockStart = "/* __AUTO_CONFIG_START__ */";
const blockEnd = "/* __AUTO_CONFIG_END__ */";

// 光标特效加载文件路径
let targetFilePath = "";
export function init(context) {
  targetFilePath = path.join(
    context.extensionPath,
    "src",
    "neovide-cursor",
    "neovide-cursor.js",
  );

  return targetFilePath;
}

// 获取光标特效配置
function getCursorConfig() {
  const vsConfig = vscode.workspace.getConfiguration("visionSmashCode.cursor");

  // 动态计算用于 CSS transition 的时间，避免硬编码
  const tailColor = vsConfig.get("tailColor", "#FFC0CB");
  const fadeSeconds = vsConfig.get("cursorFadeOutDuration", 0.075);

  return {
    // 拖尾颜色与透明度
    tailColor: tailColor,
    tailOpacity: vsConfig.get("tailOpacity", 1),
    // 阴影辉光
    useShadow: vsConfig.get("useShadow", true),
    shadowColor: vsConfig.get("shadowColor", tailColor),
    shadowBlurFactor: vsConfig.get("shadowBlurFactor", 0.5),
    // 全局管理
    cursorDisappearDelay: vsConfig.get("cursorDisappearDelay", 50),
    cursorFadeOutDuration: fadeSeconds,
    // 动画时间
    animationLength: vsConfig.get("animationLength", 0.125),
    shortAnimationLength: vsConfig.get("shortAnimationLength", 0.05),
    shortMoveThreshold: vsConfig.get("shortMoveThreshold", 8),
    // 拖尾动态控制
    rank0TrailFactor: vsConfig.get("rank0TrailFactor", 1.0),
    rank1TrailFactor: vsConfig.get("rank1TrailFactor", 0.9),
    rank2TrailFactor: vsConfig.get("rank2TrailFactor", 0.5),
    rank3TrailFactor: vsConfig.get("rank3TrailFactor", 0.3),
    // 领先角点行为控制
    useHardSnap: vsConfig.get("useHardSnap", true),
    leadingSnapFactor: vsConfig.get("leadingSnapFactor", 0.1),
    leadingSnapThreshold: vsConfig.get("leadingSnapThreshold", 0.5),
    animationResetThreshold: vsConfig.get("animationResetThreshold", 0.075),
    maxTrailDistanceFactor: vsConfig.get("maxTrailDistanceFactor", 100),
    snapAnimationLength: vsConfig.get("snapAnimationLength", 0.02),
    // 生成语句（使用动态时间）
    canvasFadeTransitionCss: `opacity ${fadeSeconds}s ease-out`,
    nativeCursorDisappearTransitionCss: `opacity 0s ease-out`,
    nativeCursorRevealTransitionCss: `opacity ${fadeSeconds}s ease-in`,
  };
}

// 更新配置到目标文件
export async function StyleConfigUpdate() {
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`没找到目标文件: ${targetFilePath}`);
  }
  const originalCode = fs.readFileSync(targetFilePath, "utf8");

  // 生成配置代码块（格式化 JSON，保持可读性）
  const config = getCursorConfig();
  const configText = JSON.stringify(config, null, 2);
  const configBlock = `${blockStart}\nconst cursorConfig = ${configText};\n${blockEnd}`;

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
