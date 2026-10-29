# shellRaining 品牌

将侧栏和欢迎页的品牌标识替换为 shellRaining 品牌。fork 本包并替换资源即可换成你自己的品牌。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-brand
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

源码位于 `src/*.ts`，使用 TypeScript 7 原生编译器的严格检查；React 类型由 `@types/react` 提供，运行时仍由 DSH ModuleLoader 提供 React，不将 React 打入包中。`src/host.ts` 只声明实际使用的 DSH 槽位接口。

在工作区统一安装开发依赖后，从仓库根目录运行：

```sh
pnpm --filter @shellraining/dsh-brand typecheck
pnpm --filter @shellraining/dsh-brand build
```

构建先进行类型检查，再用 共享 Vite 构建适配 生成根目录的 `index.js` 与 `client.js`。请修改源码而非生成文件，并在发布前重新构建。包入口、客户端 ModuleLoader ID 和 `cordis.patch.yml` 保持不变，不需要 DSH 私有包的构建依赖。

## 许可

MIT
