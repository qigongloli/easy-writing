# 辅助脚本

- `check-contrast.mjs`：主题对比度自检。解析 `src/styles/themes.scss` 里每套主题的成对「背景 / 前景」变量，计算 WCAG 对比度，低于阈值直接报错退出。新增主题或调颜色前跑一遍：`pnpm check:contrast`。
