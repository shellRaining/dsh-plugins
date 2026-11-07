# Streamdown

让助手回复平滑出字、逐字淡入，生成结束时保持排版稳定。流式引擎 fork 自 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT），改成能在 DSH 的 React 18 上运行。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-streamdown
```

需要 DSH 0.2.2-rc.1 及以上的 0.2.x 版本（`package.json` 的 `engines.dsh` 为 `>=0.2.2-rc.1 <0.3.0`）。插件依赖 0.2.2 新增的 assistant-step 私有注入、统一右键菜单和文本选择接口，不再支持 0.2.1。

## 效果与边界

生成中的回复由 Streamdown 的平滑缓冲控制出字节奏，尾块中的普通文字逐字淡入（180 ms），已冻结的块复用解析结果。代码块继续使用宿主 `CodeBlock` 增量高亮，已高亮的代码按 token 淡入（300 ms），出字节奏与正文相同；token 整体淡入，没有正文那样的逐字错开，所以时长比正文长。没有语言标注、语言不支持或语法还在加载的代码块直接显示。html 代码块和其他语言一样经过平滑缓冲。公式能解析时使用 KaTeX，没写完时保留上一次可渲染的结果。

正文和思考各自按当前文本块的状态收尾，不等整轮对话结束。生成完成后为显示缓冲设置 220 ms 的排空期限，连同最后淡入采用 400 ms 的收尾预算，再按原始文本解析最终尾块，不切换整个渲染器；这些是调度预算，浏览器主线程阻塞时可能延后。中断时直接显示已经收到的内容，停止人为延迟。系统开启「减少动态效果」时，关闭平滑延迟和文字动画处理；页面隐藏时直接同步内容，返回后不补播隐藏期间的输出。

运行中展开思考，已有内容直接显示，新增文字使用同一套平滑出字，保留思考的小字号和紧凑排版。保持展开直到结束时不会换渲染器；收起则卸载正文。运行中的摘要变化使用轻微淡入。已结束后再展开思考，或重新挂载已完成的回复，仍使用官方内容组件，不重播历史内容。两条 Markdown 路径仍有下列语法和交互差异，不保证所有内容的高度完全相同。

链接、文件链接、行内代码文件引用和图片接入宿主的统一右键菜单；外部链接跟随「在侧栏浏览器打开链接」设置，按住修饰键点击仍走浏览器默认行为。这些能力来自 ui-chat 在对话流外层提供的 Markdown 委托，缺少右键菜单插件时保持原生行为。

工具卡片、步骤分组和其他对话块仍由宿主渲染。插件只用 Web Animations 给它们加动效，不改内容、宿主节点的属性和内联样式，不延迟结果，也不改滚动位置。生成中新出现的工具调用（含子代理的嵌套调用）、步骤分组、「深度求索中」、出错、重试、压缩、命令、本轮结束的操作栏等块一次占满高度，同时在 200 ms 内淡入并上移 6 px；回复里新出现的思考、图片、未知块和「已停止」标记也一样，正文仍逐字淡入。跟随底部时宿主照常立即滚动到新的底部，插件不移动对话列；没有滚动时，被推下去的「深度求索中」等行从原位置平滑下移，新块等它们移开后再显出。入场动画只改 opacity 和 translate，可以交给合成线程执行，不需要主线程逐帧参与。工具行从准备或运行切换到执行、完成、失败或中断时加 160 ms 淡入，折叠分组的实时标题换字时淡入。只有对话列显示运行指示，或指示消失不到 2 秒时，新增内容才播放动画；用户自己的消息由宿主的输入滚动处理，打开会话、加载更早消息、切换显示模式和重新挂载都直接显示。工具执行期间的真实日志增量仍取决于宿主是否提供数据。

点击或按 Enter、空格展开、收起工具卡片、思考、上下文、压缩摘要、步骤分组和「已处理」时，内容同样在 200 ms 内展开或收起，其余原因引起的展开收起（自动折叠、页内查找）不加动画。宿主收起时会直接卸载内容，插件把移走的节点放回原处播放退出动画，期间不可交互、对读屏隐藏，结束后删除。步骤分组和「已处理」通过隐藏属性收起：停在底部时插件不接管，由宿主保持滚动位置；「下次输入时折叠」生效期间宿主自己播放收起动画，插件不叠加，宿主开始折叠时也会停止插件正在播放的动画。这些效果依赖宿主的语义 `data-*` 标记，标记不存在时不生效；减少动态效果或页面隐藏时停止观察和动画。

解析规则与宿主相同：本地文件链接支持 `#L24`、`#L24-L30` 片段和 `:24`、`:24-30`、`:24:5` 后缀，以 `/`、`./`、`../` 或盘符开头的路径优先按文件处理；Windows 路径中的反斜杠按原样保留；单个 `~` 不构成删除线。

目前的限制：

- 脚注和引用式链接的定义与引用不在同一个块时，插件渲染的回复里会显示原文（如 `[^1]`），重新挂载后由官方渲染解析。
- 本地图片文件链接没有悬浮预览。
- 图片不能像官方渲染那样拖出导出。
- 生成过程中本地文件链接也会渲染成按钮；官方在生成中不解析文件链接，定稿后才显示。
- 思考没有经过官方 `conversation.chat.reasoning.body` 子插槽，因此不兼容注册在该位置的思考翻译等扩展；平滑正文和直接调用官方 content Factory 都不能恢复该扩展链。
- 与其他接管 `assistant-step` 的插件（如 dsh-plugin-smooth-stream）不能同时启用。

## 实现说明

插件以优先级 -1 注册 `conversation.chat.node` 的 `assistant-step` 条目，覆盖 ui-chat 的默认渲染器。基础 slot API 缺失时不注册覆盖。普通 slot 组件渲染异常由宿主处理退让，但模块加载失败、Factory 内部错误、样式或行为差异不保证触发官方回退。

- `src/streamdown/`：Streamdown 1.4.4 的 React 18 fork，改动见 [其 README](src/streamdown/README.md)。
- `src/markdown/`：DSH 适配层。语法扩展、组件、链接规则和样式移植自 ui-primitives 的 `MarkdownText`，公式使用与宿主 KaTeX 样式同版本的 KaTeX 0.18.7。宿主虽然打包了 micromark 和 KaTeX，但没有通过 ModuleLoader 导出，所以插件自带一份。代码块淡入（`codeFade.ts`）参考 lobe-ui 的 token 淡入，通过 `CodeBlock` 的 `contentRef` 观察宿主渲染的 `span.line` 内的 token，用 Web Animations 播放淡入，不改宿主节点的属性；结构对不上时不加动画。
- `src/chat/`：ui-chat 的 `AssistantNodeView`、`AssistantMarkdown` 和 `ReasoningRow` 的移植，负责正文与思考的状态接入。已结束思考和图片分别调用根作用域的 `conversation.chat.reasoning.content`、`conversation.images.content` Factory。摘要预览设置仍通过注册表读取默认 `assistant-step` 条目的私有注入，缺失或读取失败时不显示完成后的摘要，不改变用户的展开状态。对话块动效（`blockMotion.ts`、`disclosureMotion.ts`）共用一个 MutationObserver，只读 `flowDom.ts` 列出的宿主语义标记，不接管宿主节点。
- `src/host.ts`：插件依赖的宿主契约。

## 升级 DSH 时

插件复刻了 DSH 0.2.2-rc.1 的组件、语法和链接规则，不依赖某次构建的资源哈希；`src/markdown/styles.ts` 仍基于 0.2.1-rc.3 的 `MarkdownText.module.css`，尚未同步 0.2.2 把悬停样式收进 `@media (hover: hover)` 的改动。宿主仅重新构建通常不需要改插件；修改 slot、节点数据、模块导出、设计变量或 Markdown 行为后需要重新核对。当前没有稳定的正文引擎替换接口，仍需维护消息组件适配；类型检查通过不代表新宿主运行时兼容。

升级后按下表对照官方源码：

| 官方源码 | 插件位置 |
| --- | --- |
| ui-chat 的 `AssistantNodeView`、`AssistantMarkdown`、`ReasoningRow` 及其 CSS module | `src/chat/` |
| ui-primitives 的 `MarkdownText.module.css`、`render`、`parse`、`cjkFriendlyStrong`、`mathCompatibility`、`katex`、`file-link` | `src/markdown/` |
| ui-primitives `CodeBlock` 的 `contentRef` 和流式高亮 DOM（`span.line` 内的 token span） | `src/markdown/codeFade.ts` |
| 宿主全局 KaTeX 样式的版本 | 根 `pnpm-workspace.yaml` 里 `katex` 的版本 |
| ui-chat 和 ui-tool 的对话流标记（`data-chat-flow`、`data-chat-flow-key`、`data-chat-node-key`、`data-chat-flow-kind`、`data-chat-running`、`data-chat-following-tail`、`data-conversation-scroll`、`data-chat-turn-spacer`、`data-chat-motion`、`data-input-fold`、`data-step-process-body`、`data-turn-process`、`data-chat-call-id`、`data-subcalls`、`data-state` 等）；ui-chat 跟随底部时在新块出现的同一帧内瞬间滚到底，底部预留空白是对话列之后的同级元素，新内容先填满它再推动滚动范围；ui-primitives `DisclosureRow` 卸载展开内容的方式 | `src/chat/flowDom.ts`、`src/chat/blockMotion.ts`、`src/chat/disclosureMotion.ts` |

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。

```sh
pnpm --filter @shellraining/dsh-streamdown typecheck
pnpm --filter @shellraining/dsh-streamdown build
```

构建生成 `lib/index.js` 和带 DSH ModuleLoader 注册的 `lib/client.js`。React 和 `@deepseek-ai/dsh-client-ui-primitives` 来自宿主，其余依赖打包进客户端。

## 许可

MIT。`src/streamdown/` 基于 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT，LobeHub）；`src/markdown/` 和 `src/chat/` 中标注来源的文件移植自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，DeepSeek）。
