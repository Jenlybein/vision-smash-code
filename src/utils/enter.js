/**
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

async function generatePathUtils(cursorScriptPath, ) {
	try {
        // 获取当前扩展路径

        console.log(`脚本路径: ${cursorScriptPath}`);

        // 检查文件是否存在
        if (!(await fileExists(cursorScriptPath))) {
          vscode.window.showErrorMessage(
            `找不到配置文件，路径: ${cursorScriptPath}`,
          );
          return;
        }

        // 将路径转换为适合 Custom CSS & JS Loader 的格式
        const fileUri = vscode.Uri.file(cursorScriptPath).toString();

        // 使用正确的配置键名和结构
        const configKey = "vscode_custom_css";
        const configProperty = "imports";
        const customCssJsConfig = vscode.workspace.getConfiguration(configKey);

        console.log(`使用配置键名: ${configKey}`);

        // 获取现有的导入文件列表（确保为 string[]）
        const existingImports =
          /** @type {string[]} */ (customCssJsConfig.get(configProperty)) || [];

        // 检查是否已经添加了此文件
        const fileAlreadyAdded = existingImports.some((importPath) => {
          return importPath === fileUri || importPath === cursorScriptPath;
        });

        if (fileAlreadyAdded) {
          // 如果已经存在，显示提示
          vscode.window.showInformationMessage(
            `路径已存在！请输入 >Reload Custom CSS and JS 重新加载以生效`,
          );
        } else {
          // 如果不存在，询问是否要添加
          const selection = await vscode.window.showInformationMessage(
            "确定要将 cursor光效 添加到 Custom CSS and JS Loader 吗？",
            "添加",
            "取消",
          );

          if (selection !== "添加") {
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

          vscode.window.showInformationMessage(
            `路径已生成！请输入 >Reload Custom CSS and JS 重新加载以生效`,
          );
        }
      } catch (error) {
        console.error("生成路径时出错:", error);
        vscode.window.showErrorMessage(
          `生成路径时出错: ${/** @type {Error} */ (error).message}`,
        );
      }

}