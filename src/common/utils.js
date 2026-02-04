import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";

const configKey = "vscode_custom_css";
const configProperty = "imports";

// 判断文件是否存在
async function fileExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

// 导入 Custom CSS & JS Loader 配置的注入列表
export function GetImports() {
  return vscode.workspace.getConfiguration(configKey).get(configProperty) || [];
}

// 加载配置到 Custom CSS & JS Loader 中
export async function UpdateImports(updatedImports) {
  // 更新配置
  vscode.workspace
    .getConfiguration(configKey)
    .update(configProperty, updatedImports, vscode.ConfigurationTarget.Global);
}

// 生成路径
export async function AddPaths(imports, addPaths) {
  const newImports = imports.slice();
  // 逐条处理需要导入的文件
  for (const filePath of addPaths) {
    // 检查文件是否存在
    if (!filePath || !(await fileExists(filePath))) {
      vscode.window.showErrorMessage(`找不到配置文件，路径: ${filePath}`);
      return;
    }

    // 将路径转换为适合 Custom CSS & JS Loader 的格式
    newImports.push(vscode.Uri.file(filePath).toString());
  }

  return newImports;
}

// 移除路径
export function RemovePaths(imports, removePaths) {
  const removeSet = new Set(
    removePaths.map((p) => path.basename(p).toLowerCase()),
  );

  return imports.filter((p) => !removeSet.has(path.basename(p).toLowerCase()));
}
