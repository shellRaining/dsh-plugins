# dsh-side-chat

侧边会话：在右侧边栏派生当前会话的临时对话，可真实修改工作区文件，不污染主会话；界面使用 DSH 设计变量与原生组件。

输入框下方预留一行统计栏空间，尚无用量数据时留空，数据到达后显示 token 用量、缓存命中率和上下文占用。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-side-chat
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

```sh
pnpm --filter @shellraining/dsh-side-chat build
```

## 许可

MIT
