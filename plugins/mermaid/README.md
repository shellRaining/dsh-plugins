# dsh-mermaid

Mermaid 代码/图表双视图渲染，图标与配色对接 DSH 主题 token。fork 自 [MrmoLabs/dsh-mermaid](https://github.com/MrmoLabs/dsh-mermaid)（MIT）。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-mermaid
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

源码位于 `src/`，使用 strict TypeScript。修改后运行：

```sh
pnpm --filter @shellraining/dsh-mermaid typecheck
pnpm --filter @shellraining/dsh-mermaid build
```

构建生成 `lib/index.js` 和带 DSH ModuleLoader 注册的 `lib/client.js`，不要直接修改产物。Mermaid runtime 随客户端打包，在首次渲染时初始化，不依赖宿主静态资源路径或 CDN。

修改本地源码并构建后，需要让当前 profile 加载更新后的插件产物，再刷新界面；已安装的 npm 副本不会自动跟随仓库更新。

## 许可

MIT
