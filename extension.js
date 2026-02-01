// @ts-check
import * as vscode from "vscode";
import * as path from "path";
import * as cursor from "./src/injection/cursor-inject.js";
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

  // 监听配置变更
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    // 如果是 neovide-cursor 相关配置变更
    if (e.affectsConfiguration("visionSmashCode.cursor")) {
      console.log("Vision Smash Code 指针配置改变，需要重新加载窗口");
      cursor.InjectConfigToFile(cursor.GetCursorConfig(), cursorScriptPath);
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

  // 生成路径命令
  const generatePathCommand = vscode.commands.registerCommand(
    "visionSmashCode.generatePath",
    async () => {
      await util.GeneratePathUtils(cursorScriptPath, "光标特效");
    },
  );

  // 删除生成的路径命令
  const removePathCommand = vscode.commands.registerCommand(
    "visionSmashCode.removePath",
    async () => {
      await util.RemovePathUtils(cursorScriptPath);
    },
  );

  // 注册命令
  context.subscriptions.push(generatePathCommand);
  context.subscriptions.push(removePathCommand);
  context.subscriptions.push(openConfigCommand);
}

function deactivate() {}

export { activate, deactivate };
