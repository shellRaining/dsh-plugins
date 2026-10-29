# Streamdown

让助手回复平滑出字、逐字淡入，生成结束时保持排版稳定。流式引擎 fork 自 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT），改成能在 DSH 的 React 18 上运行。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-streamdown
```

## 效果与边界

生成中的回复由 Streamdown 的平滑缓冲控制出字节奏，尾块中的普通文字逐字淡入（180 ms），已冻结的块复用解析结果。代码块继续使用宿主 `CodeBlock` 增量高亮，不逐字淡入；公式能解析时使用 KaTeX，没写完时保留上一次可渲染的结果。

正文和思考各自按当前文本块的状态收尾，不等整轮对话结束。生成完成后为显示缓冲设置 220 ms 的排空期限，连同最后淡入采用 400 ms 的收尾预算，再按原始文本解析最终尾块，不切换整个渲染器；这些是调度预算，浏览器主线程阻塞时可能延后。中断时直接显示已经收到的内容，停止人为延迟。系统开启「减少动态效果」时，关闭平滑延迟和文字动画处理；页面隐藏时直接同步内容，返回后不补播隐藏期间的输出。

运行中展开思考，已有内容直接显示，新增文字使用同一套平滑出字，保留思考的小字号和紧凑排版。保持展开直到结束时不会换渲染器；收起则卸载正文。运行中的摘要变化使用轻微淡入。已结束后再展开思考，或重新挂载已完成的回复，仍使用官方内容组件，不重播历史内容。两条 Markdown 路径仍有下列语法和交互差异，不保证所有内容的高度完全相同。

工具卡片继续由宿主管理。插件只给可见工具行从准备或运行状态切换到执行、完成、失败或中断时加 160 ms 淡入，不改内容、不延迟结果、不干预滚动，也不为历史卡片播放入场动画。此效果依赖宿主的语义 `data-*` 标记，标记不存在时不生效；减少动态效果或页面隐藏时停止观察和动画。工具执行期间的真实日志增量仍取决于宿主是否提供数据。

目前的限制：

- 脚注和引用式链接的定义与引用不在同一个块时，插件渲染的回复里会显示原文（如 `[^1]`），重新挂载后由官方渲染解析。
- 外部链接按浏览器默认方式在新窗口打开，不跟随「在侧栏浏览器打开链接」设置；本地图片文件链接没有悬浮预览。
- 思考没有经过官方 `conversation.chat.reasoning.body` 子插槽，因此不兼容注册在该位置的思考翻译等扩展；平滑正文和直接调用官方 content Factory 都不能恢复该扩展链。
- 与其他接管 `assistant-step` 的插件（如 dsh-plugin-smooth-stream）不能同时启用。

## 实现说明

插件以优先级 -1 注册 `conversation.chat.node` 的 `assistant-step` 条目，覆盖 ui-chat 的默认渲染器。基础 slot API 缺失时不注册覆盖。普通 slot 组件渲染异常由宿主处理退让，但模块加载失败、Factory 内部错误、样式或行为差异不保证触发官方回退。

- `src/streamdown/`：Streamdown 1.4.4 的 React 18 fork，改动见 [其 README](src/streamdown/README.md)。
- `src/markdown/`：DSH 适配层。语法扩展、组件、链接规则和样式移植自 ui-primitives 的 `MarkdownText`，公式使用与宿主 KaTeX 样式同版本的 KaTeX 0.18.7。宿主虽然打包了 micromark 和 KaTeX，但没有通过 ModuleLoader 导出，所以插件自带一份。
- `src/chat/`：ui-chat 的 `AssistantNodeView`、`AssistantMarkdown` 和 `ReasoningRow` 的移植，负责正文与思考的状态接入。已结束思考和图片分别调用根作用域的 `conversation.chat.reasoning.content`、`conversation.images.content` Factory。摘要预览设置仍通过注册表读取默认 `assistant-step` 条目的私有注入，缺失或读取失败时不显示完成后的摘要，不改变用户的展开状态。工具动效单独观察 `data-chat-call-id` 下工具行的 `data-state` 变化，不接管工具节点。
- `src/host.ts`：插件依赖的宿主契约。

## 升级 DSH 时

插件复刻了 DSH 0.2.1-rc.3 的组件和样式，不依赖某次构建的资源哈希。宿主仅重新构建通常不需要改插件；修改 slot、节点数据、模块导出、设计变量或 Markdown 行为后需要重新核对。当前没有稳定的正文引擎替换接口，仍需维护消息组件适配；类型检查通过不代表新宿主运行时兼容。

升级后按下表对照官方源码：

| 官方源码 | 插件位置 |
| --- | --- |
| ui-chat 的 `AssistantNodeView`、`AssistantMarkdown`、`ReasoningRow` 及其 CSS module | `src/chat/` |
| ui-primitives 的 `MarkdownText.module.css`、`render`、`parse`、`cjkFriendlyStrong`、`mathCompatibility`、`katex`、`file-link` | `src/markdown/` |
| 宿主全局 KaTeX 样式的版本 | 根 `pnpm-workspace.yaml` 里 `katex` 的版本 |
| ui-tool 的 `data-chat-call-id`、`data-variant`、`data-state` 标记 | `src/chat/toolMotion.ts` |

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。

```sh
pnpm --filter @shellraining/dsh-streamdown typecheck
pnpm --filter @shellraining/dsh-streamdown build
```

构建生成 `lib/index.js` 和带 DSH ModuleLoader 注册的 `lib/client.js`。React 和 `@deepseek-ai/dsh-client-ui-primitives` 来自宿主，其余依赖打包进客户端。

## 许可

MIT。`src/streamdown/` 基于 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT，LobeHub）；`src/markdown/` 和 `src/chat/` 中标注来源的文件移植自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，DeepSeek）。
