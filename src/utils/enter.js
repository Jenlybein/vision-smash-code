import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";

/**
 * 判断文件是否存在
 * @param {string} p
 * @returns {Promise<boolean>}
 */
async function fileExists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成路径，加载对应文件到 Custom CSS & JS Loader 配置中
 * @param {string} scriptPath
 * @param {string} effectName
 */
export async function GeneratePathUtils(scriptPath, effectName) {
  try {
    // 检查文件是否存在
    if (!(await fileExists(scriptPath))) {
      vscode.window.showErrorMessage(`找不到配置文件，路径: ${scriptPath}`);
      return;
    }

    // 将路径转换为适合 Custom CSS & JS Loader 的格式
    const fileUri = vscode.Uri.file(scriptPath).toString();

    // 使用正确的配置键名和结构
    const configKey = "vscode_custom_css";
    const configProperty = "imports";
    const customCssJsConfig = vscode.workspace.getConfiguration(configKey);

    // 获取现有的导入文件列表（确保为 string[]）
    const existingImports =
      /** @type {string[]} */ (customCssJsConfig.get(configProperty)) || [];

    // 检查是否已经添加了此文件
    const fileAlreadyAdded = existingImports.some((importPath) => {
      return importPath === fileUri || importPath === scriptPath;
    });

    if (fileAlreadyAdded) {
      // 如果已经存在，则不重复添加
      return;
    }

    // 添加到导入列表
    const updatedImports = [...existingImports, fileUri];

    // 更新配置
    await customCssJsConfig.update(
      configProperty,
      updatedImports,
      vscode.ConfigurationTarget.Global,
    );
  } catch (error) {
    console.error("生成路径时出错:", error);
    vscode.window.showErrorMessage(
      `生成路径时出错: ${/** @type {Error} */ (error).message}`,
    );
  }
}

export async function RemovePathUtils(scriptPath) {
  try {
    // 获取Custom CSS & JS Loader配置
    const configKey = "vscode_custom_css";
    const configProperty = "imports";
    const customCssJsConfig = vscode.workspace.getConfiguration(configKey);

    // 获取现有导入列表（确保为 string[]）
    const existingImports =
      /** @type {string[]} */ (customCssJsConfig.get(configProperty)) || [];

    // 只移除相关的导入，保留其他插件的导入
    const updatedImports = existingImports.filter((importPath) => {
      const lowerPath = importPath.toLowerCase();
      return !lowerPath.includes(path.basename(scriptPath));
    });

    await customCssJsConfig.update(
      configProperty,
      updatedImports,
      vscode.ConfigurationTarget.Global,
    );
  } catch (error) {
    console.error("删除路径时出错:", error);
    vscode.window.showErrorMessage(
      `删除路径时出错: ${/** @type {Error} */ (error).message}`,
    );
  }
}
