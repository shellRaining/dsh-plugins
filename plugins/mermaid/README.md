# dsh-mermaid

Mermaid 代码/图表双视图渲染，图标与配色对接 DSH 主题 token。fork 自 [MrmoLabs/dsh-mermaid](https://github.com/MrmoLabs/dsh-mermaid)（MIT）。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-mermaid
```

## 开发

源码位于 `src/`，使用 strict TypeScript。修改后运行：

```sh
pnpm --filter @shellraining/dsh-mermaid typecheck
pnpm --filter @shellraining/dsh-mermaid build
```

构建生成 `lib/index.js` 和带 DSH ModuleLoader 注册的 `lib/client.js`，不要直接修改产物。Mermaid runtime 仍由宿主提供。

## 许可

MIT
