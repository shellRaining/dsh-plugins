# dsh-brand

个人品牌层：占用侧栏与 Hero 的品牌槽位，替换官方 mark。fork 本包并替换资源即可换成你自己的品牌。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-brand
```

## 开发

源码位于 `src/*.ts`，使用 TypeScript 5.9.3 的严格检查；React 类型由 `@types/react` 提供，运行时仍由 DSH ModuleLoader 提供 React，不将 React 打入包中。`src/host.ts` 只声明实际使用的 DSH 槽位接口。

在工作区统一安装开发依赖后，从仓库根目录运行：

```sh
pnpm --filter @shellraining/dsh-brand typecheck
pnpm --filter @shellraining/dsh-brand build
```

构建先进行类型检查，再用 esbuild 0.28.2 生成根目录的 `index.js` 与 `client.js`。请修改源码而非生成文件，并在发布前重新构建。包入口、客户端 ModuleLoader ID 和 `cordis.patch.yml` 保持不变，不需要 DSH 私有包的构建依赖。

## 许可

MIT
