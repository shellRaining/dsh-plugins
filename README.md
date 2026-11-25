# dsh-plugins · shellRaining 的 DSH 插件集

[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI 插件合集：批注、侧边对话、Streamdown 流式渲染、会话自动命名等。全部走官方 profile 机制挂载，不改 DSH 源码；按需单独安装。

## 插件索引

| 图标 | 插件 | 功能 | 安装 |
| --- | --- | --- | --- |
| <img src="plugins/annotation/icon.png" width="36" height="36" alt="" /> | [批注](plugins/annotation) | 选中文字添加批注，随消息发送原文和批注 | `dsh plugin --profile web add @shellraining/dsh-annotation` |
| <img src="plugins/side-chat/icon.png" width="36" height="36" alt="" /> | [侧边对话](plugins/side-chat) | 派生临时对话，不追加到主会话，但可修改工作区文件 | `dsh plugin --profile web add @shellraining/dsh-side-chat` |
|  | [Streamdown](plugins/streamdown) | 助手回复流式渲染，引擎 fork 自 lobehub/streamdown | `dsh plugin --profile web add @shellraining/dsh-streamdown` |
| <img src="plugins/session-auto-rename/icon.png" width="36" height="36" alt="" /> | [会话自动命名](plugins/session-auto-rename) | 根据对话自动命名，支持自定义标题格式和摘要语言 | `dsh plugin --profile web add @shellraining/dsh-session-auto-rename` |
| <img src="plugins/shellraining-brand/icon.png" width="36" height="36" alt="" /> | [shellRaining 品牌](plugins/shellraining-brand) | 替换侧栏和首页的品牌标识；fork 后可替换为自己的资源 | `dsh plugin --profile web add @shellraining/dsh-brand` |
|  | [转圈图标降耗](plugins/spinner-throttle) | 运行中的转圈图标外观不变，渲染进程 CPU 占用降低 | `dsh plugin --profile web add @shellraining/dsh-spinner-throttle` |

新增插件：[布局预设](plugins/layout-presets/README.md)，支持对话区与右栏比例保持、宽度比例预设和双击等分。安装：`dsh plugin --profile web add @shellraining/dsh-layout-presets`，兼容性限制见子包文档。

以下三个插件已迁出本仓库，在 `omdsh-dev` 组织下各有独立仓库，npm 包名不变，后续开发和发版都在那边进行：

| 插件 | 仓库 | 安装 |
| --- | --- | --- |
| Win10 Fluent 主题 | [omdsh-dev/dsh-fluent-theme](https://github.com/omdsh-dev/dsh-fluent-theme) | `dsh plugin --profile web add @shellraining/dsh-fluent-theme` |
| Mermaid 图表 | [omdsh-dev/dsh-mermaid](https://github.com/omdsh-dev/dsh-mermaid) | `dsh plugin --profile web add @shellraining/dsh-mermaid` |
| 行内代码复制 | [omdsh-dev/dsh-inline-code-copy](https://github.com/omdsh-dev/dsh-inline-code-copy) | `dsh plugin --profile web add @shellraining/dsh-inline-code-copy` |

另有 [工作区文件夹](https://github.com/shellRaining/dsh-workspace-folders/tree/main/packages/client/ui-workspace/fork)，在侧栏工作区里新建文件夹给会话分组。它是官方工作区列表的 fork，安装后替换官方列表，每个版本只对应一个 DSH 版本，因此放在单独的仓库里跟随上游同步。安装：`dsh plugin --profile web add @shellraining/dsh-workspace-folders`。

## 已下线的插件

DSH 0.2.2 起宿主内置了同类功能，以下插件停止维护，npm 上已发布的版本保留：

| 插件 | 替代 |
| --- | --- |
| `@shellraining/dsh-plugin-updates` | 插件管理页内置的第三方插件更新 |
| `@shellraining/dsh-sidebar-session-preview` | 侧栏会话与工作区的内置悬浮卡 |

升级到 DSH 0.2.2 后，如已安装，请在插件管理页移除。

## 包名迁移

以下三个插件以新 npm 包名发布，旧包不会自动升级为新包：

| 旧包 | 新包 |
| --- | --- |
| `@shellraining/dsh-acrylic-wallpaper` | `@shellraining/dsh-fluent-theme` |
| `@shellraining/dsh-local-annotation` | `@shellraining/dsh-annotation` |
| `@shellraining/dsh-session-title-layout` | `@shellraining/dsh-session-auto-rename` |

迁移前备份 profile 配置，移除旧包后再安装新包，不要同时启用新旧实现。不要清除浏览器站点数据；在相同来源下，壁纸、批注和显示偏好继续使用原来的本地存储。

Cordis 配置 ID `acrylic-wallpaper`、`local-annotation`、`session-title-layout` 保持不变，按 ID 编写的配置覆盖可以保留。显式引用旧 npm 包名或源码目录的配置需要改为新名称；自动命名的源码目录改为 `plugins/session-auto-rename`，主题改用 `omdsh-dev/dsh-fluent-theme` 仓库。迁移失败时移除新包并恢复旧包与备份配置，不清理本地存储。

列表显示名称由包内 `locale/zh.json` 和 `locale/en.json` 的 `meta` 提供，与安装用的 npm 包名分开维护。Streamdown 保留项目名，上游来源和许可见各插件说明。

## 兼容性

插件按 DSH `0.2.3-alpha.2`（`@deepseek-ai/dsh-* 0.2.3-alpha.2`、`@deepseek-ai/cordis 4.2.0-alpha.1`）开发。Streamdown 和侧边对话依赖 0.2.2 新增的宿主接口，要求 DSH `>=0.2.2-rc.1 <0.3.0`，各包 `engines.dsh` 已声明。DSH 的 client 注入 API 仍在 rc 阶段，升级 DSH 后如插件报 token 缺失，等待本仓库适配即可。

## 开发

开发环境使用 Node 24.9+、pnpm 12.6.0（由根 `packageManager` 固定）。插件运行时要求仍以各包的 `engines` 为准：

```sh
pnpm install
pnpm typecheck # 全部插件类型检查
pnpm build     # 全部插件构建（typecheck + Vite；有 types 导出的包另生成声明）
```

构建使用 Vite 8 / Rolldown，类型检查使用 TypeScript 7 原生编译器 `tsc`（原 tsgo 项目的正式版本）。共享构建适配在 `tools/build-plugin.ts`，各包用 `build.ts` 声明入口、产物与 external；客户端继续按 DSH ModuleLoader 契约输出，不启动独立 Vite 页面。

所有直接依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog` / `catalogs` 中，各包 `package.json` 保留依赖名并引用 `catalog:`；peer 兼容范围使用独立的 `peers` catalog。仓库只保留根锁文件。新增或升级依赖先修改 catalog，再运行 `pnpm install`。`pnpm pack` / `pnpm publish` 会把 catalog 引用转换成普通版本，不影响插件独立安装。

发布由 GitHub Actions 完成：修改插件的版本号并推送到 main，流水线会把 npm 上还没有的版本发布出去，细节见 [docs/quality.md](docs/quality.md)。

所有插件业务源码使用 strict TypeScript，生成的 JavaScript 不手工维护。开发入口与约束见 [AGENTS.md](AGENTS.md)，架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，插件规范见 [docs/plugins.md](docs/plugins.md)，验证与测试权限见 [docs/quality.md](docs/quality.md)。agent 不得自行新增或改写测试。

## 许可

MIT。`plugins/streamdown` 的流式引擎基于 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT，LobeHub），部分组件移植自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，DeepSeek），署名见该包的 LICENSE。
