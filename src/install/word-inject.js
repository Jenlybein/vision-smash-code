import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

import { planRefresh } from "../common/refresh-plan.js";
import { renderWordConfigBody } from "../common/marker-bodies.js";

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
        key: "word",
        kind: "marker-block",
        targetPath: targetFilePath,
        // 内容生成与 base 开关无关（与迁移前一致：只有配置变化时才写配置块）；
        // `enabled` 只供导入规划使用，渲染不看它。
        enabled:
          vscode.workspace
            .getConfiguration("visionSmashCode.base")
            .get("word") === true,
        markers: { start: blockStart, end: blockEnd },
        // 正文（嵌套配置 + 颜色数组 + 分节注释）由效果自己渲染：标记定位 / 整块替换 /
        // 头部插入这些共用逻辑在接缝里，版面留在这里，两者互不越界。
        body: renderWordConfigBody(getWordConfig()),
      },
    ],
    // 这里只要"写什么"：变更状态与导入列表由 extension.js 的 flushChanges 统一结算，
    // 本调用不参与导入规划，因此 changeStates 为空表、currentImports 为空——
    // `plan.imports` 在本次调用里是无意义的输出，不要把它写回配置。
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
    vscode.window.showErrorMessage(`文字爆炸：${error.message}`);
  }
}
