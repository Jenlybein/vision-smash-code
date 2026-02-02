import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import * as util from "../utils/enter.js";

// 窗口动效加载文件路径
let targetFilePath = "";
let cssRoot = "";
export function init(context) {
  cssRoot = path.join(context.extensionPath, "src", "vscode-animations");
  targetFilePath = path.join(cssRoot, "vscode-animations.css");
}

// 读取指定 CSS 文件内容
async function getCSSFile(cssFilePath, cssRoot) {
  const filePath = path.join(cssRoot, cssFilePath);
  return fs.readFileSync(filePath, "utf8");
}

export async function GetUpdatedCSS() {
  let css = "";
  // 加入默认过渡效果
  css += await getCSSFile("Default-Transitions.css", cssRoot);
  // 加入自定义动画文件
  css += await getCSSFile("Custom-Animations.css", cssRoot);

  // 读取配置文件
  const config = vscode.workspace.getConfiguration(
    "visionSmashCode.animations",
  );

  // 开启动画的组件
  for (const key of ["Command-Palette", "Tabs", "Active", "Scrolling"]) {
    const setting = config.get(key);
    if (setting !== "None") {
      css += await getCSSFile(`${key}/_Duration.css`, cssRoot);
      // 对于 Scrolling，添加动画应用
      if (key === "Scrolling") {
        css += await getCSSFile(`${key}/_Animate.css`, cssRoot);
      }
      css += updateDuration(
        await getCSSFile(`${key}/${setting}.css`, cssRoot),
        key,
      );
    }
  }

  // 开启平滑模式
  for (const key of ["Smooth-Mode"]) {
    if (config.get(key)) {
      css += updateDuration(await getCSSFile(`Misc/${key}.css`, cssRoot), key);
    }
  }

  // 写入文件
  fs.writeFileSync(targetFilePath, css, "utf-8");
}

/**
 * 更新动画持续时间
 * @param css 需要更新的css字符串
 * @param key 设置中持续时间的键
 * @returns 更新后的css字符串
 */
export function updateDuration(css, key) {
  const config = vscode.workspace.getConfiguration(
    "visionSmashCode.animations",
  );
  let duration = config.get("Durations")[key];

  if (!duration || parseInt(`${duration}`) > 10000) {
    duration = config.get("Default-Duration");
    if (!duration || parseInt(`${duration}`) > 10000) {
      return css;
    }
  }

  css = css.replace(
    /\/\*<Duration>\*\/.*\/\*<\/Duration>\*\//g,
    `${duration}ms`,
  );

  return css;
}

export async function Activate() {
  const enable = vscode.workspace
    .getConfiguration("visionSmashCode.animations")
    .get("enabled");
  if (enable) {
    await util.GeneratePathUtils(targetFilePath, "窗口动效");
  } else {
    await util.RemovePathUtils(targetFilePath);
  }
}
