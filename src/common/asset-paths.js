/**
 * 资产路径常量。
 *
 * 纯常量模块：不 import vscode，不 import fs，也不做任何路径拼接。
 * 这样测试可以在纯 Node 环境里直接断言这些名字与仓库中的真实文件名一致，
 * 不需要 VS Code 运行时。
 *
 * 唯一的约束：这里的每个名字都必须与仓库中真实存在的条目**严格同大小写**。
 * 大小写不敏感的平台上看不出差异，但在 Linux 上会凭空多出一个文件，
 * 仓库里那份资产则变成永远不会生效的死文件。
 */

// 窗口动效资产的来源目录名（位于扩展安装目录下的 src/ 中）
export const ANIMATIONS_SOURCE_DIR = "vscode-animations";

// 窗口动效写入的目标文件名（同时是注入到 Custom CSS & JS Loader 的资产文件）。
// 大小写必须与 src/vscode-animations/Vscode-Animations.css 完全一致：
// 资产文件本身不重命名（会破坏已有用户的引用），只修正写入侧的拼写。
export const ANIMATIONS_TARGET_FILE = "Vscode-Animations.css";
