import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";

import { planRefresh } from "../common/refresh-plan.js";
import {
  ANIMATION_SETTING_KEYS,
  buildAnimationSegments,
} from "../common/animation-segments.js";
// 目录名与文件名来自纯常量模块，其大小写由 test/asset-paths.test.mjs 对齐仓库真实文件
import {
  ANIMATIONS_SOURCE_DIR,
  ANIMATIONS_TARGET_FILE,
} from "../common/asset-paths.js";

// 窗口动效加载文件路径
let targetFilePath = "";
let cssRoot = "";
export function init(context) {
  cssRoot = path.join(context.extensionPath, "src", ANIMATIONS_SOURCE_DIR);
  targetFilePath = path.join(cssRoot, ANIMATIONS_TARGET_FILE);

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
//
// 职责只有：读配置 → 构造描述符 → 调计划 → 执行计划结果。
// "选哪些片段、按什么顺序、路径怎么由枚举值拼出、哪些片段要做时长占位替换"
// 全在纯函数接缝里（片段布局见 src/common/animation-segments.js）。
export async function StyleConfigUpdate() {
  const config = vscode.workspace.getConfiguration("visionSmashCode.animations");

  // 配置快照：把 WorkspaceConfiguration 摊平成普通对象，
  // 纯函数不依赖 vscode，也就不会在深模块里读到模块级可变状态。
  const settings = Object.fromEntries(
    ANIMATION_SETTING_KEYS.map((key) => [key, config.get(key)]),
  );

  const plan = planRefresh({
    effects: [
      {
        key: "animations",
        kind: "css-concat",
        targetPath: targetFilePath,
        settings,
        durations: config.get("Durations"),
        defaultDuration: config.get("Default-Duration"),
        segments: buildAnimationSegments(cssRoot),
      },
    ],
    // 这里只要"写什么"：变更状态与导入列表由 extension.js 的 flushChanges 统一结算，
    // 本调用不参与导入规划，因此 changeStates 为空表、currentImports 为空——
    // `plan.imports` 在本次调用里是无意义的输出，不要把它写回配置。
    changeStates: {},
    currentImports: [],
    readText,
  });

  for (const write of plan.writes) {
    fs.writeFileSync(write.path, write.content, "utf-8");
  }

  for (const error of plan.errors) {
    vscode.window.showErrorMessage(`窗口动效：${error.message}`);
  }
}
