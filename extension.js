// @ts-check
import * as vscode from "vscode";
import * as fs from "fs";
import {
  EFFECTS,
  resolveEffectTargetPath,
} from "./src/common/effect-descriptors.js";
import { refreshEffect } from "./src/install/refresh-effect.js";
import { planRefresh } from "./src/common/refresh-plan.js";
import { createLoaderAdapter } from "./src/common/loader-adapter.js";

// 底层加载器适配层：配置键、重载命令、路径转条目三件事都收在它里面。
// 本文件因此不出现任何加载器字面量——换加载器只改 loader-adapter.js。
const loader = createLoaderAdapter({ vscode });

// 模块声明表：由效果数据表生成，不再持有各效果的 api 对象。
// - scope / baseKey：配置监听与状态机的键；
// - filePath：激活时由该效果的路径解析填入，供 flushChanges 做导入规划。
const modules = Object.fromEntries(
  Object.entries(EFFECTS).map(([key, effect]) => [
    key,
    { filePath: "", scope: effect.scope, baseKey: effect.baseKey },
  ]),
);

// 扩展安装目录：activate 时确定。配置变化的即时调用用它解析目标路径。
let extensionPath = "";

// 创建状态表
/** @typedef {"none" | "reload" | "switch"} ChangeState */
/** @type {Record<string, ChangeState>} */
const changeMap = Object.fromEntries(
  Object.keys(modules).map((k) => [k, "none"]),
);

// 注入给纯函数接缝的 I/O 能力：planRefresh 自己不 import fs / vscode。
const planCapabilities = {
  // 存在性判断必须是同步的（纯函数是同步的），异常一律按"不存在"处理。
  fileExists: (filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  },
  // 本地路径 → 注入条目：条目形态由适配层决定（默认后端是 URI 字符串）。
  toImportUri: loader.toEntry,
};

// 生成配置监听事件表
const eventMap = {};
for (const [key, mod] of Object.entries(modules)) {
  // 模块自身配置变化 → reload
  eventMap[mod.scope] = () => {
    refreshEffect(key, extensionPath);
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
//
// 分工（#12 起）：
// - 判断"哪些路径要被注入"、"下一轮状态是什么"全部在 planRefresh 里（纯函数，可脱离
//   vscode 测试）。这里只做"读配置 → 调计划 → 写配置 → 展示消息"。
// - `result.writes` **目前故意不执行**：内容写入的时机与实现保持原样——eventMap 里各效果
//   的刷新由 refresh-effect.js 即时调用。所以下面只使用 `result.imports` /
//   `result.nextChangeStates` / `result.notices` / `result.errors`。
async function flushChanges() {
  const base = vscode.workspace.getConfiguration("visionSmashCode.base");

  // 描述符只带导入规划需要的字段（key / targetPath / enabled）；省略 kind 表示
  // "本轮不参与内容生成"，因此不会产生 writes，也不会产生渲染相关的错误。
  const effects = Object.entries(modules).map(([key, mod]) => ({
    key,
    targetPath: mod.filePath,
    enabled: base.get(key) === true,
  }));

  const result = planRefresh({
    effects,
    changeStates: { ...changeMap },
    currentImports: loader.readImports(),
    fileExists: planCapabilities.fileExists,
    toImportUri: planCapabilities.toImportUri,
  });

  // 结算状态表：计划给出的新状态表整表替换（结算后全部回到 none）。
  Object.assign(changeMap, result.nextChangeStates);

  // 写入的永远是计划给出的合法字符串数组：文件缺失等失败只出现在 errors 里，
  // 不会以 undefined 的形式流进全局配置。
  await loader.writeImports(result.imports);

  for (const notice of result.notices) {
    vscode.window.showInformationMessage(notice);
  }
  for (const error of result.errors) {
    vscode.window.showErrorMessage(error.message);
  }

  setTimeout(() => {
    vscode.window.showInformationMessage("效果修改成功！点击确认进行重载");
    loader.reload();
  }, 400);
}

// 扩展激活
function activate(context) {
  // 初始化模块路径表
  extensionPath = context.extensionPath;
  for (const [key, mod] of Object.entries(modules)) {
    mod.filePath = resolveEffectTargetPath(key, extensionPath);
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
