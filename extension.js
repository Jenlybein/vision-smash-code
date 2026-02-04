// @ts-check
import * as vscode from "vscode";
import * as cursor from "./src/install/cursor-inject.js";
import * as animation from "./src/install/animation-inject.js";
import * as gradient from "./src/install/gradient-inject.js";
import * as mouse from "./src/install/mouse-inject.js";
import * as util from "./src/common/utils.js";

// 模块声明表
const modules = {
  cursor: {
    filePath: "",
    scope: "visionSmashCode.cursor",
    baseKey: "cursor",
    api: cursor,
  },
  animations: {
    filePath: "",
    scope: "visionSmashCode.animations",
    baseKey: "animations",
    api: animation,
  },
  gradient: {
    filePath: "",
    scope: "visionSmashCode.gradient",
    baseKey: "gradient",
    api: gradient,
  },
  mouse: {
    filePath: "",
    scope: "visionSmashCode.mouse",
    baseKey: "mouse",
    api: mouse,
  },
};

// 创建状态表
/** @typedef {"none" | "reload" | "switch"} ChangeState */
/** @type {Record<string, ChangeState>} */
const changeMap = Object.fromEntries(
  Object.keys(modules).map((k) => [k, "none"]),
);

// 生成配置监听事件表
const eventMap = {};
for (const [key, mod] of Object.entries(modules)) {
  // 模块自身配置变化 → reload
  eventMap[mod.scope] = () => {
    mod.api.StyleConfigUpdate();
    if (changeMap[key] !== "switch") {
      changeMap[key] = "reload";
    }
  };

  // base 开关变化 → switch
  eventMap[`visionSmashCode.base.${mod.baseKey}`] = () => {
    changeMap[key] = "switch";
  };
}

// 统一结算配置变更（防抖后执行）
async function flushChanges() {
  const base = vscode.workspace.getConfiguration("visionSmashCode.base");
  const addPaths = [];
  const removePaths = [];

  for (const [key, state] of Object.entries(changeMap)) {
    if (!modules[key].filePath) continue;

    const enabled = base.get(key);

    if (state === "reload" && enabled) {
      removePaths.push(modules[key].filePath);
      addPaths.push(modules[key].filePath);
    }

    if (state === "switch") {
      (enabled ? addPaths : removePaths).push(modules[key].filePath);
    }

    changeMap[key] = "none";
  }

  const imports = util.GetImports();
  const nextImports = await util.AddPaths(
    util.RemovePaths(imports, removePaths.concat(addPaths)),
    addPaths,
  );

  await util.UpdateImports(nextImports);

  setTimeout(() => {
    vscode.window.showInformationMessage("效果修改成功！点击确认进行重载");
    vscode.commands.executeCommand("extension.updateCustomCSS");
  }, 400);
}

// 扩展激活
function activate(context) {
  // 初始化模块路径表
  for (const mod of Object.values(modules)) {
    mod.filePath = mod.api.init(context);
  }

  // 防抖参数
  let debounceTimer = null;
  const DEBOUNCE_DELAY = 1200;

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("visionSmashCode")) return;

      for (const key of Object.keys(eventMap)) {
        if (e.affectsConfiguration(key)) {
          eventMap[key]();
        }
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => flushChanges(), DEBOUNCE_DELAY);
    }),
  );

  // 打开设置命令
  context.subscriptions.push(
    vscode.commands.registerCommand("visionSmashCode.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:gentlybeing.vision-smash-code",
      ),
    ),
  );
}

function deactivate() {}

export { activate, deactivate };
