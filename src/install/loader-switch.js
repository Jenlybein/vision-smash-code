import { removeOwnedEntries } from "../common/import-paths.js";

/**
 * 切换注入后端时的执行层。
 *
 * 设置项 `visionSmashCode.loader` 变化时，顺序必须是「先把本扩展的条目从旧后端清掉，
 * 再把它们写到新后端」。本模块只负责这个顺序与失败隔离，其余判断都在别处：
 * 该注入哪些路径由 `planRefresh` 决定（这里只移除指向本扩展 `src/<资产目录>/` 的条目），
 * 具体读写哪个配置键由适配层决定（这里不认识任何后端）。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * - `switchLoader({ previous, ourPaths, flush, reportError }) => Promise<{ errors: string[] }>`
 *   - `previous`：旧后端的适配器；`null` / 省略表示"根本没有旧后端"（例如首次激活时
 *     所选后端未安装），此时跳过清理，直接写新后端。
 *   - `ourPaths`：本扩展的注入目标文件（本地绝对路径）。**只移除指向本扩展
 *     `src/<资产目录>/<资产文件>` 的条目**（判据同 `src/common/import-paths.js`），
 *     因此用户自己的其它注入项不会被删——包括用户自建的、与我们资产同名的文件。
 *     空路径被忽略。
 *   - `flush`：把条目写进新后端并触达用户（生产实现是 `extension.js` 的 `flushChanges`）。
 *     本模块不关心它具体做什么，只保证**无论清理成败都会调用它**。
 *   - `reportError(message)`：展示一条错误；缺省时只收集不展示。
 * - 失败隔离：旧后端的读 / 写 / 重载与新后端的写入**各自** try/catch，互不阻断，
 *   每条失败独立上报。返回值里的 `errors` 与已上报的文案一致，便于测试与日志。
 * - 重载旧后端：只有真的改动了旧后端的列表才调用它的重载命令。理由是两个后端都把内容
 *   **内联写进 workbench.html**，光删配置条目不会撤掉已经注入的内容；不刷新的话，
 *   切换后旧后端的效果会继续生效（双份注入），让"切过去验证"失去意义。
 *   **顺序是契约的一部分**：旧后端的重载会立刻重建 workbench.html 并重启窗口，因此它必须
 *   排在新后端写入（`flush`）**之后**。放在之前会把新后端的配置写入与它自己的重载一起吞掉，
 *   用户看到的现象就是"切过去之后效果全都不生效，直到手动重新勾选一次"。
 *   重载失败不阻断新后端（例如旧后端已卸载时命令会不存在）。
 * - 本模块不 import `vscode`：`previous` / `flush` 都由调用方注入，因此可被 `node --test`
 *   直接覆盖。
 */

/**
 * @param {{
 *   previous?: { readImports: Function, writeImports: Function, reload: Function } | null,
 *   ourPaths?: string[],
 *   flush: () => Promise<unknown> | unknown,
 *   reportError?: (message: string) => void,
 * }} input
 * @returns {Promise<{ errors: string[] }>}
 */
export async function switchLoader({
  previous,
  ourPaths = [],
  flush,
  reportError = () => {},
}) {
  const errors = [];
  const report = (message) => {
    errors.push(message);
    reportError(message);
  };

  const ours = ourPaths.filter((p) => typeof p === "string" && p.length > 0);

  // 1. 旧后端：只移除指向本扩展资产路径的条目（basename 相同但目录不符的一律保留）。
  //    读、写各自独立失败域。
  //
  //    **注意重载不在这里做**：见下面第 3 步。旧后端的重载会立刻重建 workbench.html，
  //    在它之后再写新后端，那次写入（以及新后端自己的重载）会被窗口重启吞掉。
  let cleanedOldList = false;

  if (previous) {
    let current = null;
    try {
      current = previous.readImports();
    } catch (error) {
      report(`清理旧注入后端失败（读取注入列表）：${messageOf(error)}`);
    }

    if (Array.isArray(current)) {
      const cleaned = removeOwnedEntries(current, ours);

      // 列表没有变化时什么都不做：避免无谓的配置写入与重载提示。
      if (cleaned.length !== current.length) {
        try {
          await previous.writeImports(cleaned);
          cleanedOldList = true;
        } catch (error) {
          report(`清理旧注入后端失败（写回注入列表）：${messageOf(error)}`);
        }
      }
    }
  }

  // 2. 新后端：无论第 1 步成败都执行。必须在任何重载之前完成——
  //    它是"切过去之后效果要能用"的唯一保障。
  try {
    await flush();
  } catch (error) {
    report(`写入新注入后端失败：${messageOf(error)}`);
  }

  // 3. 最后才刷新旧后端。两个后端都把内容**内联写进 workbench.html**，光删配置条目
  //    不会撤掉已经注入的内容；但这一步会触发窗口重启，所以必须排在"新后端写入"之后，
  //    否则新后端的条目与它自己的重载都会被这次重启吞掉——表现为"切换后效果全都不生效，
  //    直到用户重新勾选一次"。
  if (cleanedOldList) {
    try {
      previous.reload();
    } catch (error) {
      report(`刷新旧注入后端失败：${messageOf(error)}`);
    }
  }

  return { errors };
}

/** 把任意抛出物变成一句可展示的文案（错误对象未必来自同一个 realm）。 */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
