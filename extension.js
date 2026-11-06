// @ts-check
import * as vscode from "vscode";
import * as fs from "fs";
import {
  EFFECTS,
  resolveEffectTargetPath,
} from "./src/common/effect-descriptors.js";
import { refreshEffect } from "./src/install/refresh-effect.js";
import { planRefresh } from "./src/common/refresh-plan.js";
import { selectLoader } from "./src/common/loader-adapter.js";
import { switchLoader } from "./src/install/loader-switch.js";

// 注入后端的选择权在用户手里：读哪个配置节、调哪个重载命令、条目长什么样，
// 全部由适配层按这个设置值决定。本文件不出现任何后端名字面量。
const LOADER_SETTING = "visionSmashCode.loader";
const INSTALL_ACTION = "安装扩展";

// 当前生效的后端适配器。所选后端未安装 / 未启用时为 null——此时**不向任何**配置键
// 写入（写进去也没有人消费），错误在 activate 与切换时分别提示。
let loader = null;

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
};

// 按设置值选后端并检测可用性。返回 null = 所选后端不可用（已提示安装）。
function applyLoaderSetting() {
  const settingValue = vscode.workspace
    .getConfiguration("visionSmashCode")
    .get("loader");
  const selection = selectLoader({ vscode, settingValue });

  if (!selection.ok) {
    // 不往无人消费的配置键写任何东西，只给一条可操作的安装指引。
    vscode.window
      .showErrorMessage(selection.message, INSTALL_ACTION)
      .then((choice) => {
        if (choice !== INSTALL_ACTION) return;
        vscode.commands.executeCommand(
          "workbench.extensions.search",
          selection.extensionId,
        );
      });
    return null;
  }

  return selection.adapter;
}

// 生成配置监听事件表
const eventMap = {};
for (const [key, mod] of Object.entries(modules)) {
  // 模块自身配置变化 → reload
  eventMap[mod.scope] = () => {
    // 所选后端不可用（loader 为 null）：**连内容写入也一并跳过**。生成出来的文件没有任何
    // 加载器会去注入，写它只会在安装目录里留下"看起来生效了"的假象——规格要求不向无人消费的
    // 路径写任何东西。状态位照旧记账，等后端可用时由切换流程整表重建。
    if (loader) refreshEffect(key, extensionPath);
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
  // 所选后端不可用：什么都不写。写进一个没人消费的配置键只会制造假象。
  // 整轮固定用同一个适配器，避免结算途中切换后端把结果写到两个地方。
  const activeLoader = loader;
  if (!activeLoader) return;

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
    currentImports: activeLoader.readImports(),
    fileExists: planCapabilities.fileExists,
    // 本地路径 → 注入条目。计划的契约要求这里返回**字符串**（稳定 id），条目形态的差异
    // 由适配层在写回时吸收。绑定本轮捕获的适配器，避免结算途中切换后端导致前后不一致。
    toImportUri: (filePath) => activeLoader.toEntry(filePath),
  });

  // 结算状态表：计划给出的新状态表整表替换（结算后全部回到 none）。
  Object.assign(changeMap, result.nextChangeStates);

  // 写入的永远是计划给出的合法字符串数组：文件缺失等失败只出现在 errors 里，
  // 不会以 undefined 的形式流进全局配置。
  await activeLoader.writeImports(result.imports);

  for (const notice of result.notices) {
    vscode.window.showInformationMessage(notice);
  }
  for (const error of result.errors) {
    vscode.window.showErrorMessage(error.message);
  }

  setTimeout(() => {
    vscode.window.showInformationMessage("效果修改成功！点击确认进行重载");
    activeLoader.reload();
  }, 400);
}

// 切换注入后端。
//
// 顺序由 `switchLoader` 保证：先把本扩展的条目从**旧**后端清掉，再把它们写进**新**后端。
// 清理与写入各自独立报错，清理失败不会阻断新后端的写入。
//
// 两条边界：
// - 新后端不可用 → 什么都不改动（继续用旧后端），只提示安装。已经在工作的效果不会因为
//   一次无效切换突然消失，也不会往新后端的配置键写任何东西。
// - 新旧后端相同（例如从"显式选中的默认后端"改成"未设置、仍落到同一个默认后端"）→ 无需清理。
async function handleLoaderChange() {
  const previous = loader;
  const next = applyLoaderSetting();
  if (!next) return;

  if (previous && previous.id === next.id) {
    loader = next;
    return;
  }

  loader = next;

  // 新后端要从零重建本扩展的条目：全部按 `switch` 结算——启用的加入，未启用的不加入。
  // 旧后端的条目已在下面的 switchLoader 里按 basename 移除，不会出现双重注入的配置。
  for (const key of Object.keys(changeMap)) changeMap[key] = "switch";

  await switchLoader({
    previous,
    ourPaths: Object.values(modules).map((mod) => mod.filePath),
    flush: flushChanges,
    reportError: (message) => vscode.window.showErrorMessage(message),
  });
}

// 扩展激活
function activate(context) {
  // 初始化模块路径表
  extensionPath = context.extensionPath;
  for (const [key, mod] of Object.entries(modules)) {
    mod.filePath = resolveEffectTargetPath(key, extensionPath);
  }

  // 按设置选定注入后端并检测可用性。不可用时 loader 为 null：
  // 后续所有写入都被跳过，用户只会看到一条带安装动作的错误提示。
  loader = applyLoaderSetting();

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

      // 切换后端自带"先清理旧的、再写新的"流程，不能走常规的 flush 路径：
      // 那条路径只会往新后端写，旧后端的条目会留成双重注入。
      if (e.affectsConfiguration(LOADER_SETTING)) {
        void handleLoaderChange();
        return;
      }

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
