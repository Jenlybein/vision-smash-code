// @ts-check
import * as vscode from "vscode";
import * as path from "path";
import * as cursor from "./src/injection/cursor-inject.js";
import * as animation from "./src/injection/animation-inject.js";
import * as util from "./src/utils/enter.js";

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("Neovide Cursor extension is now active!");

  // 获取扩展当前所处路径
  const extensionPath = context.extensionPath;

  // 构建 neovide-cursor.js 的完整路径
  const cursorScriptPath = path.join(
    extensionPath,
    "src",
    "neovide-cursor",
    "neovide-cursor.js",
  );

  // 构建 animation css 的完整路径
  const animationCssPath = path.join(extensionPath, "src", "vscode-animations");

  // 监听配置变更
  const configWatcher = vscode.workspace.onDidChangeConfiguration(async (e) => {
    // 如果是 neovide-cursor 相关配置变更
    if (e.affectsConfiguration("visionSmashCode.cursor")) {
      console.log("Vision Smash Code 指针配置改变，需要重新加载窗口");
      cursor.InjectConfigToFile(cursor.GetCursorConfig(), cursorScriptPath);
    }
    if (e.affectsConfiguration("visionSmashCode.animations")) {
      console.log("Vision Smash Code 动画配置改变，需要重新加载窗口");
    }
    // 开关光标特效
    if (e.affectsConfiguration("visionSmashCode.cursor.enabled")) {
      const enable = vscode.workspace
        .getConfiguration("visionSmashCode.cursor")
        .get("enabled");
      if (enable) {
        await util.GeneratePathUtils(cursorScriptPath, "光标特效");
      } else {
        await util.RemovePathUtils(cursorScriptPath);
      }
    }
    // 开关窗口动效
    if (e.affectsConfiguration("visionSmashCode.animations.enabled")) {
      const enable = vscode.workspace
        .getConfiguration("visionSmashCode.animations")
        .get("enabled");
      animation.GetUpdatedCSS(animationCssPath); // 预生成css文件
      const CssPath = path.join(animationCssPath, "Vscode-Animations.css");
      if (enable) {
        await util.GeneratePathUtils(CssPath, "窗口动效");
      } else {
        await util.RemovePathUtils(CssPath);
      }
    }
    if (e.affectsConfiguration("visionSmashCode")) {
      const selection = await vscode.window.showInformationMessage(
        `效果修改成功！是否现在就重新加载？`,
        "重新加载窗口",
        "稍后自行重载",
      );
      if (selection === "重新加载窗口") {
        // 重新加载窗口以应用更改
        await vscode.commands.executeCommand("extension.updateCustomCSS");
      }
    }
  });

  context.subscriptions.push(configWatcher);

  // 打开用户配置命令
  const openConfigCommand = vscode.commands.registerCommand(
    "visionSmashCode.openSettings",
    async () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:gentlybeing.vision-smash-code",
      );
    },
  );

  context.subscriptions.push(openConfigCommand);
}

function deactivate() {}

export { activate, deactivate };
