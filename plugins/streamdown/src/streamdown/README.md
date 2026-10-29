# Streamdown fork

来源是 [lobehub/streamdown](https://github.com/lobehub/streamdown) v1.4.4（commit `5aaa290`），MIT 许可，原许可证见同目录的 [LICENSE](LICENSE)。

上游要求 React 19，DSH 前端用的是 React 18.3。这里保留上游的平滑出字算法、块切分、块队列、逐字出生时间和 `StreamTail` 渲染，只做下面这些改动：

- 删除 profiler。它在渲染路径上调用 React 19 才有的 `use()`，还会给每个块包一层 `Profiler`。
- 样式不再以 React 19 的 `<style href precedence>` 渲染在根节点里，改为导出 `STREAMDOWN_CSS`，由使用方装进 `<head>`。根节点的第一个子元素因此始终是正文块，宿主排版里的 `:first-child` 规则照常生效。开启「减少动态效果」时，逐字淡入和整块淡入都关闭。
- 删除 `latexGuard` 和 `latex.ts` 的 LaTeX 预处理。插件按宿主语法解析 TeX，未写完的公式在组件里保留上一次能渲染的结果。
- 新增根节点的 `className` 属性和 `useStreamdownBlockState()`，块内组件可以读取所在块的队列状态，比如只让正在生成的代码块保持增量高亮。
- 不再依赖 react-markdown。上游只从它取 `defaultUrlTransform` 和 `Options` 类型，而它的 React peer 会给工作区再装一份 React；这两项改由 `options.ts` 提供，行为与 react-markdown 10.1 相同。
- 按仓库的 strict TypeScript 配置（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）和 React 18 类型补齐类型。

同步上游时逐个文件对照 diff，保留以上改动。
