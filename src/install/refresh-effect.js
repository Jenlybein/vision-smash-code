import * as vscode from "vscode";
import * as fs from "fs";

import { buildEffectDescriptor, EFFECTS } from "../common/effect-descriptors.js";
import { planRefresh } from "../common/refresh-plan.js";

/**
 * 泛化执行层：5 类效果共用这一份「读配置 → 构造描述符 → 调计划 → 执行 writes → 展示 errors」。
 *
 * 这里**没有任何按效果分叉的判断**：目标路径、配置作用域、配置快照与描述符载荷
 * 全部来自效果数据表（`src/common/effect-descriptors.js`）。新增第 6 个效果时，
 * 本文件与 `extension.js` 都不需要改动。
 *
 * 执行层的职责边界（与 ADR-0001 一致）：
 * - 读真实文件（`readText` 适配器）、写真实文件；
 * - 读写 VS Code 配置；展示错误提示；
 * - 不判断"该写什么"——那是 `planRefresh` 的事，这里只执行计划结果。
 */

// 基于 fs 的读取适配器：文件缺失返回 null（纯函数不得抛异常，缺失由它记入 errors）。
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * 刷新一个效果的内容：读配置 → 构造描述符 → 调计划 → 写盘 → 展示错误。
 *
 * 只做内容生成，不做导入规划：变更状态与导入列表由 `extension.js` 的 `flushChanges`
 * 统一结算（`planRefresh` 的 `imports` / `nextChangeStates` 由它使用）。因此这里的
 * `changeStates` 是空表、`currentImports` 是空数组，`plan.imports` 是**无意义的输出**，
 * 不要把它写回配置。
 *
 * 保持 `async`（内部没有 await）：执行中出现异常（例如写盘失败）时，与迁移前一样表现为
 * 被拒绝的 Promise，而不是同步异常。调用方不 await 它，行为保持不变。
 *
 * @param {string} key 效果键（`EFFECTS` 的键）
 * @param {string} extensionPath 扩展安装目录，用于解析目标路径与资产根目录
 */
export async function refreshEffect(key, extensionPath) {
  const effect = EFFECTS[key];

  const config = vscode.workspace.getConfiguration(effect.scope);
  // 配置快照：把 WorkspaceConfiguration 摊平成普通对象。默认值折叠发生在
  // 数据表的 readSettings 里，纯函数因此不依赖 vscode。
  const snapshot = effect.readSettings((name, fallback) =>
    config.get(name, fallback),
  );

  const plan = planRefresh({
    effects: [buildEffectDescriptor(key, { extensionPath, snapshot })],
    changeStates: {},
    currentImports: [],
    readText,
  });

  // 执行层只执行计划：写盘是调用方的责任，计划本身不产生副作用。
  for (const write of plan.writes) {
    fs.writeFileSync(write.path, write.content, "utf-8");
  }

  // 失败（目标文件缺失、资产片段缺失、描述符不完整）一律走 errors 通道，
  // 提示前缀是效果自己的展示名称，与迁移前逐条一致。
  for (const error of plan.errors) {
    vscode.window.showErrorMessage(`${effect.label}：${error.message}`);
  }
}
