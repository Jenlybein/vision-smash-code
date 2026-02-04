// @ts-check
import * as vscode from "vscode";
import * as cursor from "./src/install/cursor-inject.js";
import * as animation from "./src/install/animation-inject.js";
import * as gradient from "./src/install/gradient-inject.js";

// 配置修改事件配置
let pendingTasks = new Set();
const eventMap = {
  "visionSmashCode.cursor": async () => {
    await cursor.InjectConfigToFile();
    await cursor.Reload();
  },
  "visionSmashCode.animations": async () => {
    await animation.GetUpdatedCSS();
    await animation.Reload();
  },
  "visionSmashCode.gradient": async () => {
    await gradient.InjectConfigToFile();
    await gradient.Reload();
  },
  "visionSmashCode.cursorEnabled": async () => {
    await cursor.Switch();
  },
  "visionSmashCode.animationsEnabled": async () => {
    await animation.Switch();
  },
  "visionSmashCode.gradientEnabled": async () => {
    await gradient.Switch();
  },
};

// 防抖定时器，用于延迟处理配置变更
let debounceTimer = null;
const DEBOUNCE_DELAY = 1000;

function activate(context) {
  // 获取扩展当前所处路径
  cursor.init(context);
  animation.init(context);
  gradient.init(context);

  // 监听配置变更
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    // 添加影响到的事件
    for (const key of Object.keys(eventMap)) {
      if (e.affectsConfiguration(key)) {
        pendingTasks.add(eventMap[key]);
      }
    }

    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 设置新的防抖定时器
    debounceTimer = setTimeout(async () => {
      // 执行配置更改事件处理函数
      for (const task of pendingTasks) {
        await task();
      }

      pendingTasks.clear();

      if (e.affectsConfiguration("visionSmashCode")) {
        vscode.window.showInformationMessage(
          `效果修改成功！点击出现的弹窗确认进行重载`,
        );
        vscode.commands.executeCommand("extension.updateCustomCSS");
      }

      debounceTimer = null;
    }, DEBOUNCE_DELAY);
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

function deactivate() {
  cursor.Deactivate();
  animation.Deactivate();
  gradient.Deactivate();
  vscode.window.showInformationMessage(
    `插件关闭成功！点击出现的弹窗确认进行重载`,
  );
  vscode.commands.executeCommand("extension.updateCustomCSS");
}

export { activate, deactivate };
