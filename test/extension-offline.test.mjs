import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { register } from "node:module";

/**
 * 入口在「所选注入后端不可用」时的行为（评审 F9）。
 *
 * 规格要求：不得向无人消费的配置键写任何东西。`flushChanges` 早已因此提前返回，但
 * 内容写入还在 `eventMap` 里即时触发——后端没装时照样把生成结果写进安装目录，
 * 只会在磁盘上留下「看起来生效了」的假象。这里验证写盘也被跳过。
 *
 * 做法：把裸标识符 `"vscode"` 指到 `test-support/vscode-stub.mjs`，于是 `extension.js`
 * 能在这个纯 Node 进程里被加载与激活，改动配置也能用假事件触发。
 *
 * 桩放在 `test/` **之外**：`node --test` 的默认发现规则会把 `test/` 下的所有模块都当成
 * 测试文件执行，桩被当成"空测试文件"计一条，既不诚实也会掩盖它自己的意外副作用。
 */

register("../test-support/vscode-stub.mjs", import.meta.url);

const stub = await import("../test-support/vscode-stub.mjs");
const { activate } = await import("../extension.js");

// 目标文件里标记块之外的原文：只要写盘发生，它前面就会被插入配置块。
const SENTINEL = "// 光标拖尾脚本本体\nconst canvas = document.createElement(\"canvas\");\n";

/** 造一个只含光标目标文件的假安装目录。 */
function makeExtensionDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vsm-f9-"));
  const targetDir = path.join(dir, "src", "neovide-cursor");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, "neovide-cursor.js");
  fs.writeFileSync(target, SENTINEL, "utf8");
  return { dir, target };
}

/**
 * 激活一次扩展，并触发一条光标配置变化。
 *
 * `refreshEffect` 是 async 但没有 await 点，写盘是同步的；这里仍然让出一轮事件循环，
 * 避免把"恰好同步"当成契约。
 */
async function activateAndChange({ installed }) {
  const { dir, target } = makeExtensionDir();

  stub.reset({
    installed,
    config: {
      "visionSmashCode.loader": "be5invis",
      // 与哨兵内容不同的取值：若真写了，文件里会出现 #ABCDEF。
      "visionSmashCode.cursor.tailColor": "#ABCDEF",
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  stub.fireConfigChange("visionSmashCode.cursor.tailColor");
  await new Promise((resolve) => setImmediate(resolve));

  return {
    dir,
    target,
    content: fs.readFileSync(target, "utf8"),
    errors: [...stub.log.errors],
  };
}

test("后端不可用时：配置变化不写盘（内容一个字节都不动）", async () => {
  const { target, content, errors } = await activateAndChange({ installed: false });

  assert.equal(
    content,
    SENTINEL,
    `后端不可用时不得写盘，实际 ${target} 被改动了`,
  );
  // 只提示安装指引，不做别的事。
  assert.equal(stub.log.updates.length, 0);
  assert.ok(errors.some((message) => message.includes("安装")));
});

test("对照：后端可用时同一条配置变化确实会写盘（说明上面那条不是恒真）", async () => {
  const { content } = await activateAndChange({ installed: true });

  assert.notEqual(content, SENTINEL);
  assert.match(content, /cursorConfig/);
  assert.match(content, /#ABCDEF/);
  assert.equal(stub.log.errors.length, 0);
});
