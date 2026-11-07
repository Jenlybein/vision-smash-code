/**
 * 测试用的假 `vscode`，同时充当 ESM 解析钩子。
 *
 * 为什么需要它：`extension.js` 第一行就是 `import * as vscode from "vscode"`，而扩展宿主才提供
 * 这个模块。想在 `node --test` 里验证入口的行为（评审 F9：后端不可用时连写盘也跳过），
 * 就必须把裸标识符 `"vscode"` 指到一个可控的实现上。
 *
 * 用法（在被测文件同一进程里）：
 *
 * ```js
 * import { register } from "node:module";
 * register("../test-support/vscode-stub.mjs", import.meta.url);
 * const stub = await import("../test-support/vscode-stub.mjs");
 * const { activate } = await import("../extension.js");
 * ```
 *
 * 放在 `test/` **之外**：`node --test` 的默认发现规则会把 `test/` 下的所有模块都当作
 * 测试文件执行，桩被当成"空测试文件"计数既不诚实，也会掩盖它自己的意外副作用。
 *
 * 本文件把 `resolve` 与「假 API」放在一起：钩子把 `"vscode"` 解析到本文件自身，
 * 于是测试 import 到的实例与 extension.js 拿到的是同一份。
 */

// ---------------------------------------------------------------------------
// ESM 解析钩子
// ---------------------------------------------------------------------------

export async function resolve(specifier, context, next) {
  if (specifier === "vscode") {
    return { url: import.meta.url, shortCircuit: true };
  }
  return next(specifier, context);
}

// ---------------------------------------------------------------------------
// 假 API 的状态与控制面
// ---------------------------------------------------------------------------

// 扁平配置表：键是完整设置名（`visionSmashCode.cursor.tailColor`）。
let config = {};
// 所选后端是否"已安装"（决定 `selectLoader` 的可用性判定）。
let installed = false;
// 指定哪些扩展 id 可用；为 null 时退回到「installed 决定一切」。
// 用于区分「当前后端装了、另一个后端没装」这种只有多后端才需要表达的场面。
let availableIds = null;
// `onDidChangeConfiguration` 注册的回调。
let changeHandler = null;

export const log = {
  errors: [],
  informations: [],
  commands: [],
  updates: [],
  disposables: 0,
};

/** 重置全部状态（每个测试开头调用）。 */
export function reset({
  config: nextConfig = {},
  installed: nextInstalled = false,
  availableIds: nextAvailableIds = null,
} = {}) {
  config = { ...nextConfig };
  installed = nextInstalled;
  availableIds = nextAvailableIds;
  changeHandler = null;
  log.errors.length = 0;
  log.informations.length = 0;
  log.commands.length = 0;
  log.updates.length = 0;
  log.disposables = 0;
}

/** 模拟一次配置变化：`key` 是完整的设置名，例如 `visionSmashCode.cursor.tailColor`。 */
export function fireConfigChange(key) {
  if (typeof changeHandler !== "function") {
    throw new Error("activate 还没有注册 onDidChangeConfiguration 回调");
  }
  changeHandler({
    affectsConfiguration: (needle) =>
      key === needle || key.startsWith(`${needle}.`),
  });
}

/** 直接改配置表（模拟用户在设置界面里把某个键改成新值）。 */
export function setConfig(key, value) {
  config = { ...config, [key]: value };
}

// ---------------------------------------------------------------------------
// 假 API
// ---------------------------------------------------------------------------

export const ConfigurationTarget = { Global: 1, Workspace: 2 };

export const workspace = {
  getConfiguration(section) {
    return {
      get(key, fallback) {
        const full = `${section}.${key}`;
        return Object.hasOwn(config, full) ? config[full] : fallback;
      },
      update(key, value, target) {
        log.updates.push({ section, key, value, target });
        return Promise.resolve();
      },
    };
  },
  onDidChangeConfiguration(handler) {
    changeHandler = handler;
    return { dispose() {} };
  },
};

export const window = {
  showErrorMessage(message) {
    log.errors.push(message);
    // 与真实 API 一样返回 thenable：入口对返回值调了 `.then(...)`。
    return Promise.resolve(undefined);
  },
  showInformationMessage(message) {
    log.informations.push(message);
    return Promise.resolve(undefined);
  },
};

export const commands = {
  executeCommand(...args) {
    log.commands.push(args);
    return Promise.resolve(undefined);
  },
  registerCommand() {
    return { dispose() {} };
  },
};

export const extensions = {
  getExtension(id) {
    // 给了白名单就按 id 判定，否则按 installed 一刀切。
    if (availableIds) return availableIds.includes(id) ? { id } : undefined;
    return installed ? { id } : undefined;
  },
};

export const Uri = {
  file(filePath) {
    const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    return { toString: () => `file:///${normalized}` };
  },
};
