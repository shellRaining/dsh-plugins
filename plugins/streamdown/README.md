# dsh-streamdown

替换助手回复的渲染方式：生成时按平滑的节奏出字，正在生成的段落逐字淡入；回复写完后继续用同一棵渲染树，排版不会跳。流式引擎 fork 自 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT），改成能在 DSH 的 React 18 上运行。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-streamdown
```

## 效果与边界

生成中的回复由 Streamdown 的平滑缓冲控制出字节奏，最后一个块逐字淡入（180 ms），已经结束的块不再重新解析。代码块、表格和公式在生成过程中就按最终样式出现：代码块用宿主的 `CodeBlock` 增量高亮，公式一旦能解析就用 KaTeX 渲染，没写完时保留上一次能渲染的结果。生成结束时只是不再追加文字，不会换渲染器。系统开启「减少动态效果」时不播放淡入。

打开历史会话、切换会话等场景会重新挂载消息，这时已经完成的回复交给官方 `MarkdownText` 渲染。插件沿用官方的 Markdown 语法扩展和排版样式，同一条回复在两种渲染下的块位置和高度一致。

目前的限制：

- 脚注和引用式链接的定义与引用不在同一个块时，插件渲染的回复里会显示原文（如 `[^1]`），重新挂载后由官方渲染解析。
- 外部链接按浏览器默认方式在新窗口打开，不跟随「在侧栏浏览器打开链接」设置；本地图片文件链接没有悬浮预览。
- 思考正文仍由官方内容组件渲染，没有逐字淡入。
- 与其他接管 `assistant-step` 的插件（如 dsh-plugin-smooth-stream）不能同时启用。

## 实现说明

插件以优先级 -1 注册 `conversation.chat.node` 的 `assistant-step` 条目，覆盖 ui-chat 的默认渲染器。组件崩溃时，slot 会退回官方渲染器。

- `src/streamdown/`：Streamdown 1.4.4 的 React 18 fork，改动见 [其 README](src/streamdown/README.md)。
- `src/markdown/`：DSH 适配层。语法扩展、组件、链接规则和样式移植自 ui-primitives 的 `MarkdownText`，公式使用与宿主 KaTeX 样式同版本的 KaTeX 0.18.7。宿主虽然打包了 micromark 和 KaTeX，但没有通过 ModuleLoader 导出，所以插件自带一份。
- `src/chat/`：ui-chat 的 `AssistantNodeView`、`AssistantMarkdown` 和 `ReasoningRow` 的移植。插件条目不能声明官方条目已经声明的子 slot，所以思考正文和图片改走根作用域的 `conversation.chat.reasoning.content` 和 `conversation.images.content` Factory；思考摘要预览的设置通过 slot 注册表的 `entries()` 从官方条目读取，读不到时按默认的收起状态处理。
- `src/host.ts`：插件依赖的宿主契约。

## 升级 DSH 时

插件复刻了 DSH 0.2.1-rc.3 的组件和样式，升级后按下表对照官方源码：

| 官方源码 | 插件位置 |
| --- | --- |
| ui-chat 的 `AssistantNodeView`、`AssistantMarkdown`、`ReasoningRow` 及其 CSS module | `src/chat/` |
| ui-primitives 的 `MarkdownText.module.css`、`render`、`parse`、`cjkFriendlyStrong`、`mathCompatibility`、`katex`、`file-link` | `src/markdown/` |
| 宿主全局 KaTeX 样式的版本 | 根 `pnpm-workspace.yaml` 里 `katex` 的版本 |

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。

```sh
pnpm --filter @shellraining/dsh-streamdown typecheck
pnpm --filter @shellraining/dsh-streamdown build
```

构建生成 `lib/index.js` 和带 DSH ModuleLoader 注册的 `lib/client.js`。React 和 `@deepseek-ai/dsh-client-ui-primitives` 来自宿主，其余依赖打包进客户端。

## 许可

MIT。`src/streamdown/` 基于 [lobehub/streamdown](https://github.com/lobehub/streamdown)（MIT，LobeHub）；`src/markdown/` 和 `src/chat/` 中标注来源的文件移植自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（MIT，DeepSeek）。
