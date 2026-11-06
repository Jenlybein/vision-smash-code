import js from "@eslint/js";
import globals from "globals";

// 仓库里的 JS 分两类，边界按“谁来执行”划分：
// 1. 扩展宿主侧（extension.js、src/install、src/common）：Node ESM 模块，可被 eslint 按模块语义检查；
// 2. 运行时注入资产（src/neovide-cursor、src/mouse-tail、src/word-exploder）：这些不是 Node 模块。
//    它们由第三方扩展 be5invis.vscode-custom-css 作为经典脚本（classic script）注入 VS Code 渲染进程执行，
//    不经过 Node 的模块系统，且文件内含扩展在运行时自动写入的配置块标记。
//    因此这里整体忽略：既不该用 ESM 规则要求它们，也不该为了迁就 linter 去改运行时资产。
const injectedRendererAssets = [
  "src/neovide-cursor/**",
  "src/mouse-tail/**",
  "src/word-exploder/**",
];

export default [
  {
    ignores: [
      "node_modules/**",
      // 构建产物：由 esbuild 生成，不是手写源码，lint 它只会报 bundler 的写法。
      "dist/**",
      "images/**",
      "docs/**",
      ...injectedRendererAssets,
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];
