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

// ---------------------------------------------------------------------------
// 激活时对账：升级后旧安装目录的残留条目
//
// 现象（用户实测）：从 1.2.0 升到 1.2.1 后，注入列表里仍留着指向
// `…/gentlybeing.vision-smash-code-1.2.0/src/…` 的条目，而 VS Code 升级时已把旧目录删掉，
// 加载器重载时读不到文件，就刷出 `Fail to get content of [...], ENOENT`。
//
// 旧实现在激活时完全不对账，只有"改配置"或"切后端"才结算导入，所以残留会一直留着。
// 下面两条覆盖"该修时修"与"不该动时一点不动"。
// ---------------------------------------------------------------------------

const STALE_DIR = "gentlybeing.vision-smash-code-1.2.0";
const STALE_URI = `file:///C:/Users/me/.vscode/extensions/${STALE_DIR}/src/neovide-cursor/neovide-cursor.js`;

// ---------------------------------------------------------------------------
// 切换后端：切回 be5invis 后，新后端必须拿到启用效果的条目
//
// 现象（用户实测）：从 custom-ui-style 切回 Custom CSS and JS Loader 后，所有效果都不生效，
// 必须把对应总开关取消勾选再勾回去才生效。
// ---------------------------------------------------------------------------

test("切换后端：切回 be5invis 时新后端立刻拿到已启用效果的条目", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    installed: true,
    availableIds: [
      "be5invis.vscode-custom-css",
      "subframe7536.custom-ui-style",
    ],
    config: {
      "visionSmashCode.loader": "custom-ui-style",
      "visionSmashCode.base.cursor": true,
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  // 用户在设置界面把后端切回 be5invis。
  stub.setConfig("visionSmashCode.loader", "be5invis");
  stub.fireConfigChange("visionSmashCode.loader");
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const writes = stub.log.updates.filter((entry) => entry.section === "vscode_custom_css");
  assert.ok(writes.length > 0, "切回后必须往 be5invis 写入注入列表");
  assert.match(
    JSON.stringify(writes[writes.length - 1].value),
    /neovide-cursor/,
    `新后端应拿到已启用效果的条目，实际写入：${JSON.stringify(writes[writes.length - 1].value)}`,
  );
});
//
// 现象（用户实测）：关掉主题渐变、重启后渐变仍在。两个加载器同时注入了——改设置只更新
// 当前选中的后端，另一个还在注入旧产物，于是"关不掉"也"改了没反应"。
//
// `switchLoader` 的清理只在切换后端那一刻跑；这里补上激活时的不变量：
// 本扩展的资产文件最多出现在一个加载器的列表里。
// ---------------------------------------------------------------------------

const OTHER_SECTION = "custom-ui-style";
const OUR_GRADIENT =
  "file:///C:/Users/me/.vscode/extensions/gentlybeing.vision-smash-code-1.2.0/src/gradient-theme/gradient-theme.css";
const USER_OWN = "file:///C:/Users/me/my-themes/own.css";

test("激活时清理其它后端：本扩展的条目不会同时留在两个后端的列表里", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    installed: true,
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      // 人为制造"两个后端都有我们的条目"：这是"关掉效果却还在"的成因。
      "custom-ui-style.external.imports": [OUR_GRADIENT, USER_OWN],
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  const writes = stub.log.updates.filter((entry) => entry.section === OTHER_SECTION);
  assert.equal(writes.length, 1, "应当清理一次非选中后端的列表");
  assert.deepEqual(
    writes[0].value,
    [USER_OWN],
    `只应留下用户自己的条目，实际：${JSON.stringify(writes[0].value)}`,
  );
  assert.ok(
    stub.log.informations.some((message) => message.includes("同时注入")),
    "清理后应提示用户重载",
  );
});

test("对照：其它后端没装时不碰它的配置键（不制造没人消费的配置）", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    // 只有当前后端可用：另一个后端没装。这种场面下仍去写它的配置键，
    // 等于凭空造出一个没人消费的假配置（评审 F9 的同一条原则）。
    installed: true,
    availableIds: ["be5invis.vscode-custom-css"],
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      "custom-ui-style.external.imports": [OUR_GRADIENT],
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    stub.log.updates.filter((entry) => entry.section === OTHER_SECTION).length,
    0,
    "另一个后端未安装时不得写它的配置键",
  );
  // 当前后端的对账照常进行——这条不能被"顺手一起跳过"。
  assert.equal(
    stub.log.updates.filter((entry) => entry.section === "vscode_custom_css").length,
    1,
    "当前后端的对账不应受到另一个后端缺失的影响",
  );
});

test("激活时对账：指向旧安装目录的条目被替换为当前安装目录的条目", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    installed: true,
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      "vscode_custom_css.imports": [STALE_URI],
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  const written = stub.log.updates.filter((entry) => entry.key === "imports");
  assert.equal(written.length, 1, "激活时对账应写入一次注入列表");

  const list = written[0].value;
  assert.ok(
    !list.some((entry) => entry.includes(STALE_DIR)),
    `旧安装目录的条目必须被移除，实际仍写着：${JSON.stringify(list)}`,
  );
  assert.equal(list.length, 1, `应只剩光标一条，实际：${JSON.stringify(list)}`);
  assert.match(list[0], /src\/neovide-cursor\/neovide-cursor\.js$/);
  assert.match(list[0], /^file:\/\//, "本地条目必须是 file:// 字符串");
  // 弹一条提示让用户重载，否则列表改了但不生效。
  assert.ok(
    stub.log.informations.some((message) => message.includes("重载")),
    "写入后必须提示用户重载窗口",
  );
});

test("激活时对账：列表已与当前安装目录一致时完全静默（不写配置、不弹提示）", async () => {
  const { dir } = makeExtensionDir();

  // 第一次：从陈旧条目校正到当前条目，拿到"正确列表"。
  stub.reset({
    installed: true,
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      "vscode_custom_css.imports": [STALE_URI],
    },
  });
  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));
  const correct = stub.log.updates.find((entry) => entry.key === "imports").value;

  // 第二次：用正确列表重新激活，不应产生任何写入或提示。
  stub.reset({
    installed: true,
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      "vscode_custom_css.imports": [...correct],
    },
  });
  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    stub.log.updates.length,
    0,
    `列表已正确时不得重写，实际写入：${JSON.stringify(stub.log.updates)}`,
  );
  assert.equal(stub.log.informations.length, 0, "无差异时不应打扰用户");
});

// ---------------------------------------------------------------------------
// 重载失败必须可见
//
// 现象（用户实测）：后端为 custom-ui-style 时关掉主题渐变，重启后渐变仍在。
// 配置确实被写入了，但内联进 workbench.html 的旧内容要靠后端的重载命令重新生成；
// 若该命令不存在或失败，以前是裸调用，异常落进 timer 里被吞掉，用户只看到"修改成功"。
// ---------------------------------------------------------------------------

test("重载命令失败时必须报错，而不是只显示「修改成功」", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    installed: true,
    availableIds: ["be5invis.vscode-custom-css"],
    failCommands: true, // 模拟后端没有 extension.updateCustomCSS 这个命令
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.cursor.tailColor": "#ABCDEF",
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  stub.fireConfigChange("visionSmashCode.cursor.tailColor");

  // flushChanges 在 400ms 后才重载；留足余量。
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.ok(
    stub.log.errors.some((message) => message.includes("重载注入后端失败")),
    `重载失败必须让用户看见，实际只记录了：${JSON.stringify(stub.log.errors)}`,
  );
  assert.ok(
    stub.log.errors.some((message) => message.includes("be5invis")),
    "错误信息里应点名是哪个后端失败",
  );
});
test("清理其它后端后必须请求它重新打补丁（否则残留内容关不掉）", async () => {
  const { dir } = makeExtensionDir();

  stub.reset({
    installed: true,
    config: {
      "visionSmashCode.loader": "be5invis",
      "visionSmashCode.base.cursor": true,
      "custom-ui-style.external.imports": [OUR_GRADIENT],
    },
  });

  activate({ subscriptions: [], extensionPath: dir });
  await new Promise((resolve) => setImmediate(resolve));

  // 只删配置条目不够：两个后端都把内容内联写进 workbench 文件，已经写进去的部分
  // 不会因为配置变了而消失，重启也不会。必须让它按新列表重新打一次补丁。
  assert.deepEqual(
    stub.log.commands.map((args) => args[0]),
    ["custom-ui-style.reload"],
    `清理其它后端之后必须请求它重新生成，实际执行了：${JSON.stringify(stub.log.commands)}`,
  );
});