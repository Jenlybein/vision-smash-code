import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";

// 渐变特效加载文件路径
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

// 更新配置到目标文件
export async function StyleConfigUpdate() {}
