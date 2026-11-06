import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

import { planRefresh } from "../common/refresh-plan.js";

// 渐变片段：键名与顺序必须与重构前本文件的循环逐项一致。
// 注意 top-active-tab 在 horizontal 之前——这是既有字节顺序，不要按设置项声明顺序重排。
const CSS_FILES = [
  "editor-hover",
  "git-num-icon",
  "linenumber-rainbow-glow",
  "quick-input",
  "text-glowing",
  "text-gradient",
  "top-active-tab",
  "horizontal",
];

// 渐变特效加载文件路径
let cssRoot = "";
let targetFilePath = "";
export function init(context) {
  const baseRoot = path.join(context.extensionPath, "src", "gradient-theme");
  cssRoot = path.join(baseRoot, "css", "adaptive");
  targetFilePath = path.join(baseRoot, "gradient-theme.css");

  return targetFilePath;
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
  const config = vscode.workspace.getConfiguration("visionSmashCode.gradient");

  const segments = CSS_FILES.map((key) => ({
    setting: key,
    path: path.join(cssRoot, `${key}.css`),
  }));

  // 配置快照：把 WorkspaceConfiguration 摊平成普通对象，
  // 纯函数不依赖 vscode，也因此不会在深模块里读到模块级可变状态。
  const settings = Object.fromEntries(
    segments.map((segment) => [segment.setting, config.get(segment.setting)]),
  );

  const plan = planRefresh({
    effects: [
      {
        key: "gradient",
        kind: "css-concat",
        targetPath: targetFilePath,
        settings,
        segments,
      },
    ],
    // 变更状态本工单不参与内容生成，导入规划留给 #12。
    changeStates: {},
    // imports 本工单按直通处理，同样留给 #12。
    currentImports: [],
    readText,
  });

  for (const write of plan.writes) {
    fs.writeFileSync(write.path, write.content, "utf-8");
  }

  for (const error of plan.errors) {
    vscode.window.showErrorMessage(`渐变主题：${error.message}`);
  }
}
