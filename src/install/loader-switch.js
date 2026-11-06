import { removeByBasename } from "../common/import-paths.js";

/**
 * 切换注入后端时的执行层。
 *
 * 设置项 `visionSmashCode.loader` 变化时，顺序必须是「先把本扩展的条目从旧后端清掉，
 * 再把它们写到新后端」。本模块只负责这个顺序与失败隔离，其余判断都在别处：
 * 该注入哪些路径由 `planRefresh` 决定（这里只按 basename 移除本扩展的目标文件），
 * 具体读写哪个配置键由适配层决定（这里不认识任何后端）。
 *
 * ## Interface（调用者为正确使用必须知道的一切）
 *
 * - `switchLoader({ previous, ourPaths, flush, reportError }) => Promise<{ errors: string[] }>`
 *   - `previous`：旧后端的适配器；`null` / 省略表示"根本没有旧后端"（例如首次激活时
 *     所选后端未安装），此时跳过清理，直接写新后端。
 *   - `ourPaths`：本扩展的注入目标文件（本地绝对路径）。**只按 basename 匹配移除**，
 *     因此用户自己的其它注入项不会被删——这是本模块唯一的删除判据。空路径被忽略。
 *   - `flush`：把条目写进新后端并触达用户（生产实现是 `extension.js` 的 `flushChanges`）。
 *     本模块不关心它具体做什么，只保证**无论清理成败都会调用它**。
 *   - `reportError(message)`：展示一条错误；缺省时只收集不展示。
 * - 失败隔离：旧后端的读 / 写 / 重载与新后端的写入**各自** try/catch，互不阻断，
 *   每条失败独立上报。返回值里的 `errors` 与已上报的文案一致，便于测试与日志。
 * - 重载旧后端：只有真的改动了旧后端的列表才调用它的重载命令。理由是两个后端都把内容
 *   **内联写进 workbench.html**，光删配置条目不会撤掉已经注入的内容；不刷新的话，
 *   切换后旧后端的效果会继续生效（双份注入），让"切过去验证"失去意义。
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

  // 1. 旧后端：只按 basename 移除本扩展的条目。读、写、重载各自独立失败域。
  if (previous) {
    let current = null;
    try {
      current = previous.readImports();
    } catch (error) {
      report(`清理旧注入后端失败（读取注入列表）：${messageOf(error)}`);
    }

    if (Array.isArray(current)) {
      const cleaned = removeByBasename(current, ours);

      // 列表没有变化时什么都不做：避免无谓的配置写入与重载提示。
      if (cleaned.length !== current.length) {
        try {
          await previous.writeImports(cleaned);
        } catch (error) {
          report(`清理旧注入后端失败（写回注入列表）：${messageOf(error)}`);
        }

        // 已注入的内容不会因为删条目而消失，需要旧后端自己刷新一次。
        try {
          previous.reload();
        } catch (error) {
          report(`刷新旧注入后端失败：${messageOf(error)}`);
        }
      }
    }
  }

  // 2. 新后端：无论第 1 步成败都执行。
  try {
    await flush();
  } catch (error) {
    report(`写入新注入后端失败：${messageOf(error)}`);
  }

  return { errors };
}

/** 把任意抛出物变成一句可展示的文案（错误对象未必来自同一个 realm）。 */
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
