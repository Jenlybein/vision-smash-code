import * as path from "node:path";

/**
 * 从 import 路径列表中移除指定路径对应的条目。
 *
 * 匹配依据是每条路径的 basename 而非完整路径：Custom CSS & JS Loader 的
 * imports 是 URI 形式（file:///...），而调用方给出的是本地文件路径，
 * 两者无法直接比较，但同名文件一定是同一个资产文件。
 *
 * 匹配忽略大小写，因为同一份资产在 Windows/macOS 上大小写不敏感，
 * 而注入列表里可能残留历史拼写。
 *
 * 纯函数：不读文件、不访问 vscode API，返回新数组且不修改入参。
 *
 * @param {string[]} imports 现有的 import 列表
 * @param {string[]} removePaths 需要移除的路径
 * @returns {string[]} 移除后的新 import 列表
 */
export function removeByBasename(imports, removePaths) {
  const removeSet = new Set(
    removePaths.map((p) => path.basename(p).toLowerCase()),
  );

  return imports.filter((p) => !removeSet.has(path.basename(p).toLowerCase()));
}
