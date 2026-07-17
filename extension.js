// @ts-check
import * as vscode from "vscode";
import * as cursor from "./src/install/cursor-inject.js";
import * as animation from "./src/install/animation-inject.js";
import * as gradient from "./src/install/gradient-inject.js";
import * as mouse from "./src/install/mouse-inject.js";
import * as word from "./src/install/word-inject.js";
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
  word: {
    filePath: "",
    scope: "visionSmashCode.word",
    baseKey: "word",
    api: word,
  },
};

// 创建状态表
/** @typedef {"none" | "reload" | "switch" | "init" } ChangeState */
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
  let hasInit = false;
  let hasSwitch = false;
  let hasReload = false;

  for (const [key, state] of Object.entries(changeMap)) {
    if (!modules[key].filePath) continue;

    const enabled = base.get(key);

    if (state === "init") {
      hasInit = true;
      if (enabled) addPaths.push(modules[key].filePath);
    }

    if (state === "reload" && enabled) {
      hasReload = true;
      removePaths.push(modules[key].filePath);
      addPaths.push(modules[key].filePath);
    }

    if (state === "switch") {
      hasSwitch = true;
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

  if (hasReload) {
    setTimeout(() => {
      vscode.window.showInformationMessage("效果修改成功！点击 Restart APP 进行重载");
      vscode.commands.executeCommand("custom-ui-style.reload");
    }, 400);
  }

  if (hasSwitch) {
    vscode.window.showInformationMessage("效果修改成功！点击 Yes 确认重载");
  }

  if (hasInit) {
    vscode.window.showInformationMessage("初始化成功！点击 Yes 确认重载");
  }
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

// 辅助函数：比较两个数组是否相等（顺序无关）
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

async function checkAndInitConfig() {
  const config = vscode.workspace.getConfiguration('custom-ui-style');
  const existingImports = config.get('imports', []);

  // 计算预期的路径列表：遍历所有模块，如果启用则添加路径
  const base = vscode.workspace.getConfiguration('visionSmashCode.base');
  const expectedPaths = [];
  for (const mod of Object.values(modules)) {
    if (mod.filePath && base.get(mod.baseKey)) {
      expectedPaths.push(mod.filePath);
    }
  }

  // 判断是否需要初始化：键不存在 或 值为空 或 值与预期不符
  const needInit = !config.has('imports') || 
                   existingImports.length === 0 || 
                   !arraysEqual(existingImports, expectedPaths);

  if (needInit) {
    for (const key of Object.keys(changeMap)) {
      changeMap[key] = 'init';
    }
    await flushChanges();
  }
  // 完全正确则静默跳过，不弹窗
}

  // 延迟执行，确保所有模块路径已完成初始化
  setTimeout(() => checkAndInitConfig(), 500);
}

function deactivate() {}

export { activate, deactivate };