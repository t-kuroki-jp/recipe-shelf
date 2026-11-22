# Recipe Shelf

AI Team Studio の共通封筒フォーマット（`studio.item/v1`, `kind: "recipe"`）で管理する私設レシピブックです。

- **公開 URL**: https://t-kuroki-jp.github.io/recipe-shelf/
- **自動公開**: `items/<YYYYMMDD-slug>.json`（および `images/<YYYYMMDD-slug>.jpg`）を追加して `main` へ push すると、GitHub Actions が自動で `data.json` を生成して GitHub Pages へデプロイします。
