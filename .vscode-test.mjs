import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  // 测试标签，用于标识这组测试
  label: "unitTests",
  // 测试入口文件路径
  files: "./src/test/**.test.js",
  // 使用的 VS Code 版本，stable 表示稳定版
  version: "stable",
  // 测试时使用的临时工作区文件夹
  workspaceFolder: "./sampleWorkspace",
  // Mocha 测试框架的配置
  mocha: {
    // 测试接口风格，tdd 表示测试驱动开发风格
    ui: "tdd",
    // 测试超时时间，单位毫秒（20秒）
    timeout: 20000,
  },
});
