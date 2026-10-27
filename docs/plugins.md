# 插件开发规范

## TypeScript 与构建

所有插件业务源码使用 TypeScript，放在包内 `src/`。组件用 `.tsx`，类型声明用 `.d.ts`。每包必须提供 `typecheck` 和 `build` 脚本，能从根目录通过 pnpm 递归执行。

- 启用 `strict`，新建配置同时开启 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。
- esbuild 只做转译和打包，不能代替类型检查。使用 esbuild 的 `build` 必须先运行 `typecheck`；直接使用 tsc 的构建可由编译本身检查类型。
- 外部数据和错误先按 `unknown` 处理，再缩窄类型。宿主没有可用声明时，在适配边界定义最小接口，不用宽泛的 `any` 冒充兼容。
- 不通过 `allowJs`、`checkJs: false`、`@ts-nocheck` 或关闭 strict 留下 JavaScript 实现。新增功能不能写回编译后的 `.js`。

JavaScript 只用于生成产物、构建与维护脚本，以及现有无业务逻辑的空宿主入口。空入口一旦需要配置、服务或其他运行逻辑，先迁入 TypeScript 并纳入构建。既有测试文件的语言不在插件源码约束范围内，测试变更仍受 [质量规则](quality.md) 限制。

以当前 package exports 为准生成产物，不无故变更对外路径。根目录被跟踪的客户端产物随源码重新构建并提交；`lib/` 已被根 ignore 规则排除，不强行加入版本控制。不要手改生成文件。

## DSH 加载契约

浏览器脚本必须通过 `window.__ModuleLoader__.load` 注册，id 与包名一致。`main`、`exports`、`dsh.client`、`inject` 和 bundle patch 应相互匹配，改入口时一起核对。

优先使用正式宿主 API 和类型。没有公开类型时，把最小契约集中在包内适配模块，不把宿主内部细节散到业务层。插件需要的服务由依赖注入提供，不通过扫描全局对象碰运气。

宿主已提供的 `react`、`react/jsx-runtime`、`react-dom/client` 等模块必须保持 external，并声明实际需要的 DSH 服务。不要打包第二份 React，也不要因本地构建能通过就假定宿主一定导出了某模块。

## UI 与生命周期

优先使用 DSH 原生组件、设计 token 和语义化 DOM 锚点。不硬编码带构建 hash 的宿主类名；不得不依赖非公开结构时，将选择器与失效处理留在适配边界。

副作用放进 `ctx.effect` 等宿主生命周期，清理函数要撤销事件监听、MutationObserver、定时器、样式和自建节点。修改宿主节点时保留可恢复状态，不删除 React 管理的节点来替代正式扩展点。

异步渲染、请求和流式更新要检查当前状态是否仍有效，避免旧结果覆盖新内容。离开会话、卸载插件或元素被移除后，不再写入过期界面。

用户内容默认不可信。优先使用 textContent；确需插入 HTML / SVG 时保留现有校验和清理边界。迁移类型不能顺带移除安全限制或扩大文件、网络权限。

## 文档与依赖

新增依赖前确认是否可由宿主提供，保持与现有工具链版本一致；依赖变动同步根 lockfile。不因引入一个插件而更换整仓包管理器或新增另一套 lockfile。

修改安装命令、配置项、导出路径、构建方式或用户行为时同步对应插件 README。跨插件规则写在本目录，单包实现细节留在该包，不重复维护两份事实源。
