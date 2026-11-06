import * as vscode from "vscode";

const configKey = "vscode_custom_css";
const configProperty = "imports";

// 读取 Custom CSS & JS Loader 的注入列表。
//
// 本模块只做两件事：读配置、写配置。
// "哪些路径要被注入"（新增/移除、去重、文件存在性、路径 → URI 形式、变更状态结算）
// 全部在纯函数接缝 src/common/refresh-plan.js 里完成，因此这里不再 import fs，
// 也不再自己判断文件是否存在——那正是重构前 AddPaths 把 `undefined` 写进全局配置的入口。
export function GetImports() {
  return vscode.workspace.getConfiguration(configKey).get(configProperty) || [];
}

// 把下一份完整导入列表写回全局配置（user 级）。
// 入参必须是 refresh-plan 给出的字符串数组；该接缝保证不会出现 undefined 或非字符串元素。
export async function UpdateImports(updatedImports) {
  // 更新配置
  vscode.workspace
    .getConfiguration(configKey)
    .update(configProperty, updatedImports, vscode.ConfigurationTarget.Global);
}
