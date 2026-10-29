# 行内代码复制

点击助手回复中的行内代码即可复制，并显示提示。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-inline-code-copy
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

```sh
pnpm --filter @shellraining/dsh-inline-code-copy build
```

## 许可

MIT
