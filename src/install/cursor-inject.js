import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

import { planRefresh } from "../common/refresh-plan.js";

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

// 基于 fs 的读取适配器：文件缺失返回 null（纯函数不得抛异常，缺失由它记入 errors）。
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// 更新配置到目标文件
// 职责只有：读配置 → 构造描述符 → 调计划 → 执行计划结果。判断逻辑都在 planRefresh 里。
export async function StyleConfigUpdate() {
  const plan = planRefresh({
    effects: [
      {
        key: "cursor",
        kind: "marker-block",
        targetPath: targetFilePath,
        // 内容生成与 base 开关无关（与迁移前一致：只有配置变化时才写配置块）；
        // `enabled` 只供导入规划使用，渲染不看它。
        enabled:
          vscode.workspace
            .getConfiguration("visionSmashCode.base")
            .get("cursor") === true,
        markers: { start: blockStart, end: blockEnd },
        variableName: "cursorConfig",
        config: getCursorConfig(),
      },
    ],
    // 这里只要"写什么"：变更状态与导入列表由 extension.js 的 flushChanges 统一结算
    // （#12 起都在 planRefresh 里），本调用不参与导入规划，因此 changeStates 为空表、
    // currentImports 为空——`plan.imports` 在本次调用里是无意义的输出，不要把它写回配置。
    changeStates: {},
    currentImports: [],
    readText,
  });

  // 执行层只执行计划：写盘是调用方的责任，计划本身不产生副作用。
  for (const write of plan.writes) {
    fs.writeFileSync(write.path, write.content, "utf-8");
  }

  // 与迁移前的差异：目标文件缺失原本 throw `没找到目标文件: <path>`（async 调用方未 await，
  // 实际表现为未处理的 Promise 拒绝，使用者看不到任何提示）；现在走 errors 通道显式提示。
  for (const error of plan.errors) {
    vscode.window.showErrorMessage(`光标拖尾：${error.message}`);
  }
}
