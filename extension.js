// @ts-check
import * as vscode from "vscode";
import * as fs from "fs";
import {
  EFFECTS,
  resolveEffectTargetPath,
} from "./src/common/effect-descriptors.js";
import { refreshEffect } from "./src/install/refresh-effect.js";
import { planRefresh } from "./src/common/refresh-plan.js";
import { normalizePathKey, removeOwnedEntries } from "./src/common/import-paths.js";
import { LOADERS, createLoaderAdapter, selectLoader } from "./src/common/loader-adapter.js";
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
//
// 存在性判断必须是同步的（纯函数是同步的），异常一律按"不存在"处理。
// （原先是 `planCapabilities.fileExists` 这样的单字段包装对象，只此一处使用、没有第二个
// 成员，属于多余的间接层，收尾评审 F10 内联掉。）
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

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
// 跑一遍计划：只做纯计算，不写配置、不弹提示。调用方负责结算状态表与写入。
function planOnce(activeLoader) {
  const base = vscode.workspace.getConfiguration("visionSmashCode.base");

  // 描述符只带导入规划需要的字段（key / targetPath / enabled）；省略 kind 表示
  // "本轮不参与内容生成"，因此不会产生 writes，也不会产生渲染相关的错误。
  const effects = Object.entries(modules).map(([key, mod]) => ({
    key,
    targetPath: mod.filePath,
    enabled: base.get(key) === true,
  }));

  return planRefresh({
    effects,
    changeStates: { ...changeMap },
    currentImports: activeLoader.readImports(),
    fileExists,
    // 本地路径 → 注入条目。计划的契约要求这里返回**字符串**（稳定 id），条目形态的差异
    // 由适配层在写回时吸收。绑定本轮捕获的适配器，避免结算途中切换后端导致前后不一致。
    toImportUri: (filePath) => activeLoader.toEntry(filePath),
  });
}

async function flushChanges() {
  // 所选后端不可用：什么都不写。写进一个没人消费的配置键只会制造假象。
  // 整轮固定用同一个适配器，避免结算途中切换后端把结果写到两个地方。
  const activeLoader = loader;
  if (!activeLoader) return;

  const result = planOnce(activeLoader);

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

    // 重载失败必须让用户看见。
    //
    // 不同后端的重载命令名不同（各自声明在适配层里，本文件不认识它们），
    // 版本不匹配时命令可能根本不存在。以前这里是裸调用：命令缺失抛出的异常落进 timer
    // 里被吞掉，用户只看到"修改成功"，然后发现界面毫无变化——配置其实写进去了，但内联进
    // workbench.html 的旧内容没有被重新生成，于是"关掉的效果还在、重启也不消失"。
    const reportReloadFailure = (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `重载注入后端失败（${activeLoader.id}）：${detail}。` +
          "配置已经写入，但界面内容需要后端重新生成才会变化；" +
          "可以手动执行该后端的重载命令，或切换一次后端来强制重建。",
      );
    };

    try {
      const pending = activeLoader.reload();
      if (pending && typeof pending.then === "function") {
        pending.then(undefined, reportReloadFailure);
      }
    } catch (error) {
      reportReloadFailure(error);
    }
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

// 激活时把本扩展的条目从**其它**注入后端的列表里清掉。
//
// 为什么需要：`switchLoader` 的清理只在「`visionSmashCode.loader` 被改动」那一刻执行。
// 一旦某一步让本扩展的条目同时留在了两个后端的列表里（切换时清理失败、用户手动改过、
// 或升级残留），两个加载器就会**同时注入**。此后改设置只更新当前选中的那个后端，
// 另一个仍在注入旧的产物——表现为「关掉了效果却还在」「改了设置重启也不变」。
//
// 不变量：本扩展的资产文件最多出现在**一个**加载器的注入列表里。
//
// 边界：只清理**已安装**的后端。后端没装时写它的配置键等于制造一个没人消费的假配置
// （评审 F9 的同一条原则）。单个后端失败不影响其它后端，也不影响当前后端。
async function dropEntriesFromOtherBackends() {
  const activeLoader = loader;
  if (!activeLoader) return;

  const ours = Object.values(modules)
    .map((mod) => mod.filePath)
    .filter(Boolean);
  if (ours.length === 0) return;

  let cleaned = false;

  for (const declaration of Object.values(LOADERS)) {
    if (declaration.id === activeLoader.id) continue;

    // 没装就不碰：不写没人消费的配置键。
    if (!vscode.extensions.getExtension(declaration.extensionId)) continue;

    try {
      const other = createLoaderAdapter({ vscode, loader: declaration });
      const current = other.readImports();
      const remaining = removeOwnedEntries(current, ours);
      if (remaining.length === current.length) continue;
      await other.writeImports(remaining);
      cleaned = true;

      // 只删配置条目是不够的：两个后端都会把内容**内联写进 workbench 文件**，
      // 已经写进去的部分不会因为配置变了而消失，重启也不会——重启加载的仍是被改过的文件。
      // 必须让它按新的（已不含本扩展条目的）列表重新打一次补丁，残留才会被清掉。
      // 这正是"切走之后旧后端注入的效果还在、关都关不掉"的成因。
      try {
        await other.reload();
      } catch {
        // 重载失败不阻断其它后端，也不阻断当前后端；用户仍可通过后端自己的命令强制重建。
      }
    } catch {
      // 单个后端清理失败不能阻断其它后端；当前后端的写入照旧进行。
    }
  }

  if (cleaned) {
    vscode.window.showInformationMessage(
      "检测到本扩展的条目同时存在于另一个注入后端，已移除并请求它重新生成界面内容，避免两个后端同时注入。请重载窗口使其生效。",
    );
  }
}

// 激活时对账注入列表。
//
// 为什么需要：扩展的安装目录带版本号（…-1.2.0 → …-1.2.1）。升级后 VS Code 会删除旧目录，
// 但注入列表里指向旧目录的条目还在——加载器在重载时读不到文件，就会刷出
// "Fail to get content of [...], ENOENT"。此前只在"配置变更"与"切换后端"时结算导入，
// 激活时从不对账，这种残留会一直留着，直到用户碰巧改动到对应的那个效果。
//
// 做法：以"全部按 switch 结算"跑一遍计划——等价于按当前配置与当前**安装目录**重建
// 本扩展的条目。只有当结果与现状真的不同才写入并提示重载；无差异时完全静默，
// 不产生多余写入、也不弹提示。
//
// 边界：所选后端不可用时直接返回；只认属于本扩展的条目（判据在 import-paths 里），
// 用户自己添加的条目不会被触碰。
async function reconcileImportsOnActivate() {
  const activeLoader = loader;
  if (!activeLoader) return;

  const before = activeLoader.readImports();

  for (const key of Object.keys(changeMap)) changeMap[key] = "switch";
  const result = planOnce(activeLoader);
  Object.assign(changeMap, result.nextChangeStates);

  // 顺序可能与现状不同但内容等价：按归一化路径比对，避免每次启动都重写一遍配置。
  const canonical = (ids) =>
    ids.map((id) => normalizePathKey(id)).filter(Boolean).sort().join("\n");
  if (canonical(before) === canonical(result.imports)) return;

  await activeLoader.writeImports(result.imports);
  vscode.window.showInformationMessage(
    "检测到注入列表与本扩展的当前安装目录不一致，已自动修正。请重载窗口使其生效。",
  );
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

  // 升级后旧安装目录被删除，注入列表里指向它的条目会让加载器报 ENOENT；
  // 同时也要防止条目留在另一个后端里导致两个后端同时注入。
  // 顺序：先摘掉其它后端的条目，再对账当前后端——两者写的是不同的配置键，互不覆盖。
  void (async () => {
    await dropEntriesFromOtherBackends();
    await reconcileImportsOnActivate();
  })();

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
