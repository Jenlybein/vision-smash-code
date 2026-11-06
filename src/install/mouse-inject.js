import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

import { planRefresh } from "../common/refresh-plan.js";
import { renderMouseConfigBody } from "../common/marker-bodies.js";

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
        key: "mouse",
        kind: "marker-block",
        targetPath: targetFilePath,
        // 内容生成与 base 开关无关（与迁移前一致：只有配置变化时才写配置块）；
        // `enabled` 只供导入规划使用，渲染不看它。
        enabled:
          vscode.workspace
            .getConfiguration("visionSmashCode.base")
            .get("mouse") === true,
        markers: { start: blockStart, end: blockEnd },
        // 正文（带分节注释的手工排版）由效果自己渲染：标记定位 / 整块替换 / 头部插入
        // 这些共用逻辑在接缝里，版面留在这里，两者互不越界。
        body: renderMouseConfigBody(getMouseConfig()),
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
    vscode.window.showErrorMessage(`鼠标尾迹：${error.message}`);
  }
}
