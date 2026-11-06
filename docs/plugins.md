# 插件开发规范

## TypeScript 与构建

所有插件业务源码使用 TypeScript，放在包内 `src/`。组件用 `.tsx`，类型声明用 `.d.ts`。每包必须提供 `typecheck` 和 `build` 脚本，能从根目录通过 pnpm 递归执行。

- 启用 `strict`，新建配置同时开启 `noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。
- Vite 只做转译和打包，不能代替类型检查。每包 `build` 必须先运行 TypeScript 7 原生 `tsc` 的 `typecheck`，再执行 `build.ts`；声明文件由 `tsc --emitDeclarationOnly` 生成。共享适配在 `tools/build-plugin.ts`，构建脚本也纳入 strict 检查。
- 外部数据和错误先按 `unknown` 处理，再缩窄类型。宿主没有可用声明时，在适配边界定义最小接口，不用宽泛的 `any` 冒充兼容。
- 不通过 `allowJs`、`checkJs: false`、`@ts-nocheck` 或关闭 strict 留下 JavaScript 实现。新增功能不能写回编译后的 `.js`。

JavaScript 只用于生成产物和既有维护脚本。空宿主入口也放在 `src/index.ts` 并纳入构建；构建入口使用 `build.ts`，由 Node 原生执行，不引入另一套运行时。测试变更受 [质量规则](quality.md) 限制。

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

## 宿主样式与性能

插件 CSS 里的 `:has()` 最好放在选择器最右边的复合选择器上，也就是被选中的元素本身，并在它前面写上具体的元素、类或属性，比如 `.card:has(> img)`。`:has()` 后面还接子代或后代组合符时，最右边的复合选择器必须带类或属性，比如 `div:has(> [data-a]) > [data-b]`。如果最右边只有 `div`、`span` 这类常见标签，或者只有 `*`、`:not(...)`、`:has(...)`，比如 `div:has(> [data-a]) > div:first-child`、`div:has(> [data-a]) :has(> .x)`、`:has(> .x) > :not(.x)`，Chrome 在页面任何位置插入节点后都要做大范围的样式重算。实测后面只接兄弟组合符的 `span:has(> [data-a]) + span` 没有这个问题。要定位一个没有语义属性的容器，优先用宿主的稳定属性（比如 `data-slot`），或者像 fluent-theme 的 `src/host/modules.ts` 那样在运行时从 `style[data-plugin-css]` 读出 CSS module 的类名，不在源码里写带构建 hash 的类名。

在一段长对话里，这样一条规则就能让一次“插入节点再读尺寸”从不到 1 ms 变成 2.5 到 15 ms，具体取决于规则形状和页面元素数量。偶尔一次影响不大，循环里反复插入再测量的代码会把页面卡住，Mermaid 测量文字尺寸就是这种情况，一张时序图大约要测 85 次。

DSH 0.2.2-rc.1 的 `@deepseek-ai/dsh-client-ui-sidebar-files` 带有两条这样的规则，上游源码在 `packages/client/ui-sidebar-files/src/client/FilesBody.module.css`：`:has(> .navigator.fill) > :not(.navigator)`，以及它在 `@media (width < 768px)` 里的变体，合计约 20 ms。

确实需要绕开时，参照 Mermaid 插件的 `src/host-css.ts`：

- 用宿主注入样式时写入的 `data-plugin-css`（格式为 `<包名>/<文件名>.module.css`）找到样式表，再按选择器形状匹配规则，不写带构建 hash 的类名。
- 只在一次同步渲染期间替换选择器，任务结束前恢复，另用 `requestAnimationFrame` 兜底，保证页面不会在缺少宿主规则时绘制。
- 找不到目标就什么都不做。上游修复后删除这段处理。

排查这类卡顿时，用 `PerformanceObserver` 观察 `long-animation-frame`，看 `scripts[].forcedStyleAndLayoutDuration` 是否占了大部分时长。再测量“插入节点后读 `offsetHeight` 或 `getBBox()`”的耗时，逐个停用样式表找出触发重算的规则。几条规则各自都能触发重算时，单独停用一个样式表看不出差别，这时先停用所有插件样式表，再把规则逐条放进一个临时 `<style>` 里测。

## 文档与依赖

新增依赖前确认是否可由宿主提供。所有直接依赖版本在根 `pnpm-workspace.yaml` 的 catalog 中维护，各包引用 `catalog:`；peer 兼容范围使用命名 catalog，不与开发时的精确版本混淆。依赖变动同步根 lockfile，不创建子包锁文件。构建工具在根声明，各包保留自身类型和运行时依赖。

修改安装命令、配置项、导出路径、构建方式或用户行为时同步对应插件 README。跨插件规则写在本目录，单包实现细节留在该包，不重复维护两份事实源。
