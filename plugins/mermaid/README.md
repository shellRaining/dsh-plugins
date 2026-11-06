# Mermaid 图表

渲染 Mermaid 图表，支持切换代码和图表视图、复制源码。图标与配色对接 DSH 主题 token。fork 自 [MrmoLabs/dsh-mermaid](https://github.com/MrmoLabs/dsh-mermaid)（MIT）。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-mermaid
```

## 渲染与交互

图表只在进入视口附近（上下各 300 px）时绘制，打开长会话不会一次渲染所有图表，画好的图移出视口后保留。切换明暗主题时只重绘视口附近的图，其余图表滚动到附近时再重绘。每份源码在当前主题下的绘制结果会缓存（最多 32 份），切换会话后回来直接复用，不再调用 Mermaid。

鼠标悬停在图表上时，右上角显示代码视图、图形视图和复制源代码按钮。复制成功后图标变为对勾，1 秒后恢复。

DSH 0.2.2 的文件侧栏样式里有一条以 `:has(` 开头的规则，页面每插入一个节点再读一次尺寸，都要重算整页样式。Mermaid 绘图时要这样测量几十次文字尺寸，一张时序图最长会让页面卡住约 1.4 秒。插件在每次绘图期间临时换掉这条规则（及其窄屏变体）的选择器，绘完在同一任务内恢复，页面不会在缺少这些规则时绘制。宿主修复规则或样式文件改名后，这一处理自动不生效，不影响绘图。原因和排查方法见仓库的[插件开发规范](../../docs/plugins.md#宿主样式与性能)。

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
