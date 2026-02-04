// @ts-check
import * as vscode from "vscode";
import * as cursor from "./src/install/cursor-inject.js";
import * as animation from "./src/install/animation-inject.js";
import * as gradient from "./src/install/gradient-inject.js";
import * as util from "./src/common/utils.js";

// 配置修改事件配置
function markReload(key) {
  if (changeMap[key] !== "switch") {
    changeMap[key] = "reload";
  }
}
let pathMap = {};
const eventMap = {
  "visionSmashCode.cursor": () => {
    cursor.InjectConfigToFile();
    markReload("cursor");
  },
  "visionSmashCode.animations": () => {
    animation.GetUpdatedCSS();
    markReload("animations");
  },
  "visionSmashCode.gradient": () => {
    gradient.InjectConfigToFile();
    markReload("gradient");
  },
  "visionSmashCode.base.cursor": () => {
    changeMap.cursor = "switch";
  },
  "visionSmashCode.base.animations": () => {
    changeMap.animations = "switch";
  },
  "visionSmashCode.base.gradient": () => {
    changeMap.gradient = "switch";
  },
};
const changeMap = {
  cursor: "none",
  animations: "none",
  gradient: "none",
};

// 防抖定时器，用于延迟处理配置变更
let debounceTimer = null;
const DEBOUNCE_DELAY = 2000;

function activate(context) {
  // 获取扩展当前所处路径
  cursor.init(context);
  animation.init(context);
  gradient.init(context);

  pathMap = {
    cursor: cursor.GetPath(),
    animations: animation.GetPath(),
    gradient: gradient.GetPath(),
  };

  // 监听配置变更
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration("visionSmashCode")) return;
    // 添加影响到的事件
    for (const key of Object.keys(eventMap)) {
      if (e.affectsConfiguration(key)) {
        eventMap[key]();
      }
    }

    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 设置新的防抖定时器
    debounceTimer = setTimeout(async () => {
      // Custom CSS & JS Loader 更新时存在并发问题，需统一更新
      const base = vscode.workspace.getConfiguration("visionSmashCode.base");
      const addPaths = [];
      const removePaths = [];
      for (const key of Object.keys(changeMap)) {
        if (changeMap[key] === "reload") {
          if (base.get(key) === true) {
            removePaths.push(pathMap[key]);
            addPaths.push(pathMap[key]);
          }
        } else if (changeMap[key] === "switch") {
          if (base.get(key) === true) {
            addPaths.push(pathMap[key]);
          } else {
            removePaths.push(pathMap[key]);
          }
        }
        changeMap[key] = "none";
      }

      const imports = util.GetImports();
      console.log("\nImports", imports, "\n");
      const NewImports1 = util.RemovePaths(imports, removePaths);
      console.log("\nRemovePaths", NewImports1, "\n");
      const NewImports2 = await util.AddPaths(NewImports1, addPaths);
      console.log("\nAddPaths", NewImports2, "\n");
      await util.UpdateImports(NewImports2);

      // 统一处理开关设置
      vscode.window.showInformationMessage(
        `效果修改成功！点击出现的弹窗确认进行重载`,
      );
      vscode.commands.executeCommand("extension.updateCustomCSS");

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

function deactivate() {}

export { activate, deactivate };
