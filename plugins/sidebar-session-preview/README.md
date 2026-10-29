# 会话悬浮预览

悬停侧栏会话时预览最近消息。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-sidebar-session-preview
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

源码位于 `src/*.ts`，使用 TypeScript 7 原生编译器的严格检查。`src/host.ts` 声明本插件使用的 sessions/workspaces 快照、订阅与 effect 接口；DOM 和事件类型使用标准 TypeScript DOM 库，不依赖 DSH 私有类型包。

在工作区统一安装开发依赖后，从仓库根目录运行：

```sh
pnpm --filter @shellraining/dsh-sidebar-session-preview typecheck
pnpm --filter @shellraining/dsh-sidebar-session-preview build
```

构建先进行类型检查，再用 共享 Vite 构建适配 生成根目录的 `index.js` 与 `client.js`。请修改源码而非生成文件，并在发布前重新构建。包入口、客户端 ModuleLoader ID 与 `cordis.patch.yml` 保持不变。悬浮事件拦截仍依赖当前 DSH 侧栏的 `data-row-key` 和原生 HoverCard 包装结构，升级 DSH 后需复核这些 DOM 约定。

## 许可

MIT
