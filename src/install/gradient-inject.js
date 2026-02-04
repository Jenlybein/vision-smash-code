import * as vscode from "vscode";
import * as path from "path";
import fs from "fs";
import * as util from "../common/utils.js";

// 渐变特效加载文件路径
let cssRoot = "";
let targetFilePath = "";
export function init(context) {
  const baseRoot = path.join(context.extensionPath, "src", "gradient-theme");
  cssRoot = path.join(baseRoot, "css", "adaptive");
  targetFilePath = path.join(baseRoot, "gradient-theme.css");
}

// 读取指定 CSS 文件内容
async function getCSSFile(cssFilePath, cssRoot) {
  const filePath = path.join(cssRoot, cssFilePath);
  return fs.readFileSync(filePath, "utf8");
}

// 更新配置到目标文件
export async function InjectConfigToFile() {
  let css = "";

  // 读取配置文件
  const config = vscode.workspace.getConfiguration("visionSmashCode.gradient");

  // 开启动画的组件
  for (const key of [
    "editor-hover",
    "git-num-icon",
    "linenumber-rainbow-glow",
    "quick-input",
    "text-glowing",
    "text-gradient",
    "top-active-tab",
    "horizontal",
  ]) {
    const setting = config.get(key);
    if (setting !== false) {
      css += await getCSSFile(`${key}.css`, cssRoot);
    }
  }

  // 写入文件
  fs.writeFileSync(targetFilePath, css, "utf-8");
}

// 开关扩展
export async function Switch() {
  util.Switch("visionSmashCode.gradient", targetFilePath);
}

// 重载配置
export async function Reload() {
  util.Reload("visionSmashCode.gradient", targetFilePath);
}

// 关闭扩展
export async function Deactivate() {
  await util.RemovePathUtils(targetFilePath);
}
