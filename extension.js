// @ts-check
import * as vscode from "vscode";
import * as path from "path";
import * as cursor from "./src/injection/cursor-inject.js";
import * as animation from "./src/injection/animation-inject.js";

function activate(context) {
  console.log("[Vision Smash Code] Extension is now active!");

  // 获取扩展当前所处路径
  cursor.init(context);
  animation.init(context);

  // 监听配置变更
  const configWatcher = vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration("visionSmashCode.cursor")) {
      // 指针配置改变，重新注入配置
      await cursor.InjectConfigToFile();
    }
    if (e.affectsConfiguration("visionSmashCode.animations")) {
      // 窗口动效配置改变，重新注入配置
      await animation.GetUpdatedCSS();
    }
    // 开关光标特效
    if (e.affectsConfiguration("visionSmashCode.cursor.enabled")) {
      await cursor.Activate();
    }
    // 开关窗口动效
    if (e.affectsConfiguration("visionSmashCode.animations.enabled")) {
      await animation.Activate();
    }
    if (e.affectsConfiguration("visionSmashCode")) {
      vscode.window.showInformationMessage(
        `效果修改成功！点击出现的弹窗确认进行重载`,
      );
      vscode.commands.executeCommand("extension.updateCustomCSS");
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
