# 码字记录器 v2 素材

这些素材只承载无法稳定用 CSS 绘制的纸张与笔触质感，文字、图标、印章、粒子和交互状态仍由前端实现。

- `ink-ring-mask.webp`：512×512，透明墨环遮罩。通过 `mask-image` / `-webkit-mask-image` 使用，以 `--ink-main`、`--ink-accent` 着色，不要作为普通黑色图片直接展示。
- `footer-brush-divider.webp`：1024×115，透明页脚笔锋遮罩。通过 CSS mask 使用，可随四套主题切换颜色。
- `rice-paper-texture.webp`：512×512，中性宣纸纹理。作为面板低透明度叠加层使用，暗夜主题建议配合 `mix-blend-mode: soft-light`。

四套主题继续复用项目已有变量：

- `--ink-main`
- `--ink-sec`
- `--ink-accent`
- `--bg-main`
- `--panel-bg`
- `--ui-border`

透明遮罩示例：

```scss
.brush-mask {
  background: var(--ink-accent);
  -webkit-mask: var(--brush-mask-image) center / contain no-repeat;
  mask: var(--brush-mask-image) center / contain no-repeat;
}
```
