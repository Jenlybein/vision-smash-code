/**
 * 注入条目的"这条路径是不是本扩展的资产"判定。
 *
 * 这是全仓库唯一的判定来源：导入规划里的**去重**、**移除**与切换后端时的**清理**
 * 都复用它，避免三处各写一套归一化规则（那样三处会慢慢漂移）。
 *
 * ## 为什么不能只比 basename（评审 F8）
 *
 * 重构前的判据是 `path.basename()` 忽略大小写。它会把用户自己的同名条目一起删掉：
 * 用户自建的 `gradient-theme.css`（放在任意目录）与我们的资产同名 → 关闭效果时被清除，
 * 违反「绝不能删除用户其它注入项」。因此判据收紧为**规范化后的路径段**：
 *
 * ```
 * <任意前缀>/src/<资产目录>/<资产文件>
 * ```
 *
 * 即：条目路径归一化后必须以本扩展的 `src/<资产目录>/<资产文件>` 结尾（忽略大小写）。
 * 安装目录的绝对前缀<b>故意</b>不参与匹配——它带版本号
 * （`…/gentlybeing.vision-smash-code-1.1.3/` → `…-1.1.4/`），每次升级都会变；
 * 用绝对前缀会让升级前写进去的条目永远清不掉，配置里越积越多死路径。
 *
 * 残留风险（如实记录）：用户若恰好在自己的某个 `src/<同名资产目录>/` 下放了同名文件，
 * 仍会被误删。这要求目录名与文件名同时撞上本扩展的内部布局，实际不会发生。
 */

// 判据里固定的一段：`src` / `<资产目录>` / `<资产文件>`。
const OWNED_SEGMENT_COUNT = 3;
const SOURCE_DIR = "src";

/**
 * 一条 import 路径（或本地路径）的归一化匹配键。
 *
 * 归一化内容：
 * - `file://` URI → 本地路径的形态（去掉协议、百分号解码、去掉 Windows 盘符前的斜杠）；
 * - 反斜杠统一成 `/`；
 * - 去掉末尾多余的斜杠；
 * - 整体转小写（同一份资产在 Windows / macOS 上大小写不敏感，注入列表里也可能残留历史拼写）。
 *
 * 不做路径解析（`..` / 符号链接不折叠）：注入列表里的条目是绝对路径，不需要，
 * 折叠反而会引入平台差异。
 *
 * @param {string} p 本地路径或 URI 字符串
 * @returns {string}
 */
export function normalizePathKey(p) {
  let text = String(p);

  if (/^file:\/\//i.test(text)) {
    text = text.replace(/^file:\/\//i, "");
    try {
      text = decodeURIComponent(text);
    } catch {
      // 非法的百分号转义：保持原样，按字面量比较（不因为一条坏条目抛异常）。
    }
    // `file:///C:/x` → `/C:/x`：Windows 上盘符前的斜杠必须去掉才能与本地路径比较。
    text = text.replace(/^\/([A-Za-z]:)/, "$1");
  }

  return text.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * 本扩展资产的指纹：`<资产目录>/<资产文件>`（只在路径确实形如 `…/src/<目录>/<文件>` 时给出）。
 *
 * @param {unknown} p
 * @returns {string | null} 指纹；不是本扩展资产形态时返回 null
 */
function ownedFingerprint(p) {
  if (typeof p !== "string" || p.length === 0) return null;

  const segments = normalizePathKey(p).split("/");
  if (segments.length < OWNED_SEGMENT_COUNT) return null;

  const file = segments.at(-1);
  const assetDir = segments.at(-2);
  const sourceDir = segments.at(-3);
  if (!file || !assetDir || sourceDir !== SOURCE_DIR) return null;

  return `${assetDir}/${file}`;
}

/**
 * 从 import 路径列表中移除本扩展自己的条目。
 *
 * 判据见文件头：**只有**指向本扩展 `src/<资产目录>/<资产文件>` 的条目会被移除，
 * 用户自己的其它注入项一个都不动（哪怕与我们同名、哪怕形态是对象或认不出）。
 *
 * 纯函数：不读文件、不访问 vscode API，返回新数组且不修改入参。
 *
 * @param {string[]} imports 现有的 import 列表
 * @param {string[]} ourPaths 本扩展的目标文件（本地绝对路径）
 * @returns {string[]} 移除后的新 import 列表
 */
export function removeOwnedEntries(imports, ourPaths) {
  const owned = new Set();
  for (const p of ourPaths) {
    const fingerprint = ownedFingerprint(p);
    if (fingerprint !== null) owned.add(fingerprint);
  }

  // 没有可用的自有路径（尚未初始化 / 全部为空）：一条都不删。
  if (owned.size === 0) return [...imports];

  return imports.filter((entry) => {
    const fingerprint = ownedFingerprint(entry);
    return fingerprint === null || !owned.has(fingerprint);
  });
}
