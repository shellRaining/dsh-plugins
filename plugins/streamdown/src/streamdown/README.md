# Streamdown fork

来源是 [lobehub/streamdown](https://github.com/lobehub/streamdown) v1.4.4（commit `5aaa290`），MIT 许可，原许可证见同目录的 [LICENSE](LICENSE)。v1.4.5 只在 `package.json` 声明了 `sideEffects: false`，源码与 v1.4.4 相同。

上游要求 React 19，DSH 前端用的是 React 18.3。这里保留上游的平滑出字算法、块切分、逐字出生时间和 `StreamTail` 渲染，只做下面这些改动：

- 删除 profiler。它在渲染路径上调用 React 19 才有的 `use()`，还会给每个块包一层 `Profiler`。
- 样式不再以 React 19 的 `<style href precedence>` 渲染在根节点里，改为导出 `STREAMDOWN_CSS`，由使用方装进 `<head>`。根节点的第一个子元素因此始终是正文块，宿主排版里的 `:first-child` 规则照常生效。开启「减少动态效果」时，逐字淡入和整块淡入都关闭。
- 删除 `latexGuard` 和 `latex.ts` 的 LaTeX 预处理。插件按宿主语法解析 TeX，未写完的公式在组件里保留上一次能渲染的结果。
- 新增根节点的 `className`、`textInteractionSource`（输出 DSH 的 `data-text-interaction-source` 标记）属性和 `useStreamdownBlockState()`，块内组件按实际显示进度判断是否保持增量渲染。上游停止但显示缓冲还未排空时，尾块继续保持流式状态。
- 新增 `streaming` 和 `interrupted` 输入，完成后有限排空并结束尾块动画，再使用原始文本收尾，不替换根组件。中断直接同步已有内容。末尾不再永久保持补全文法和动画状态。
- 上游以 `useStreamQueue(blocks, true)` 调用块队列，这个模式下只有尾块是 `streaming`，其余块都是 `revealed`。fork 直接按这两种状态判断，`useStreamQueue` 只保留导出；字间隔上限固定为 18 ms，不再按尾块初次出现时的字数缩短。
- html 代码块默认也经过平滑缓冲。上游让它绕过缓冲，是为了 LobeHub 的 HTML 预览 iframe 及时拿到内容；DSH 的 html 代码块没有预览。
- 新增 `useStreamdownBlockFade()`，告诉自绘 DOM 的块内组件（宿主代码块）是否淡入新文字，以及块里已有的文字是否算已经显示；同时导出正文尾块的节奏常量，供代码块淡入复用。
- 「减少动态效果」同时跳过平滑延迟和动画 AST 处理，页面隐藏时同步内容并停止缓冲调度；偏好监听和调度任务随组件卸载清理。首次挂载已有文本不播放入场动画。
- 非追加式文本替换重置动画记录；块 memo 比较完整渲染选项，避免设置改变后继续使用旧解析结果。
- 不再依赖 react-markdown。上游只从它取 `defaultUrlTransform` 和 `Options` 类型，而它的 React peer 会给工作区再装一份 React；这两项改由 `options.ts` 提供，行为与 react-markdown 10.1 相同。
- 按仓库的 strict TypeScript 配置（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）和 React 18 类型补齐类型。

同步上游时逐个文件对照 diff，保留以上改动。
