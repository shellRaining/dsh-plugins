# dsh-spinner-throttle

降低 DSH 运行中转圈图标的 CPU 占用，图标外观不变。

## 效果

有对话在运行时，侧栏会话和顶栏标题旁会显示转圈图标（宿主的 StateDot）。宿主用两个 CSS 动画驱动它：一个转动 SVG 里的 `<g>`，一个改变弧线的 `stroke-dasharray` 和 `stroke-dashoffset`。两个动画都按屏幕刷新率逐帧更新，每帧都要重算样式、重绘并提交。在 120 Hz 屏幕和约 8000 个节点的长对话里实测，两个 14 px 的图标占了渲染进程约三分之一个核：暂停它们以后，渲染进程 CPU 从 43% 降到 10%。

插件的处理方式：

- 两个动画仍用宿主自己的关键帧和缓动曲线。插件把它们暂停，再用一个共享定时器每秒推进 30 次，所有图标在同一帧更新。14 px 的图标每次更新转 8 度，弧线端点移动不到 1 px。
- 宿主让所有转圈图标保持同一相位（挂载时和 `animationstart` 时把 `startTime` 设为 0），插件沿用这个相位，接管和交还时图标不跳。

同一页面上交替启用、停用插件对比，三个图标同时转动时，渲染进程 CPU 从约 39% 降到约 27%，GPU 进程从约 18% 降到约 15%。曾尝试把旋转改成整个 `<svg>` 的 `rotate` 动画，期望交给合成线程执行，实测在 Chrome 里不比宿主省 CPU，所以旋转也按固定帧率推进。

停用插件时，动画交还宿主，从当前相位继续播放。系统开启「减少动态效果」时宿主不播放这两个动画，插件也不做任何事。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-spinner-throttle
```

`web` 是独立 Web profile 名称。安装后刷新当前 DSH 页面。Electron 的 `desktop` profile 由桌面应用管理，使用应用内插件管理器，或退出桌面应用后使用随应用分发的 Desktop CLI。

## 本地开发

```sh
pnpm --filter @shellraining/dsh-spinner-throttle typecheck
pnpm --filter @shellraining/dsh-spinner-throttle build
```

构建生成 `lib/index.js`（空宿主入口）和通过 ModuleLoader 注册的 `lib/client.js`。把本地构建加载到 profile 的方法见[质量与验证](../../docs/quality.md)的「本地链接与即时预览」一节。

## 兼容性与限制

实现依据 DSH 0.2.2-rc.1 的 `@deepseek-ai/dsh-web-frontend`。对宿主的依赖集中在 [src/host.ts](src/host.ts)：

| 依赖 | 用途与失效表现 |
| --- | --- |
| `svg[data-state="ongoing"]` | 定位转圈图标。属性变了以后插件找不到图标，宿主动画照常运行。 |
| 动画名里的 `dsh-state-dot-spin` 和 `dsh-state-dot-dash`（CSS Modules 会加前后缀） | 找出要接管的动画。改名后同上。 |
| 宿主在 `animationstart` 时重置相位 | 插件在 document 的冒泡阶段接管，排在宿主的监听之后。宿主之后再重置时，插件沿用新相位，最多约 33 ms 内重新暂停。 |

插件只处理这两个转圈图标。「深度求索中」等文字上的扫光动画用的是 `transform`，不在本插件范围内；它会让 GPU 进程和 WindowServer 一直按屏幕刷新率合成画面。

## 升级检查

升级 DSH 后，核对 StateDot 的 DOM 和样式：`data-state` 属性、两个动画名，以及挂载和 `animationstart` 时的相位重置。

人工验收在实际 DSH 页面中完成：

1. 有对话运行时，对比启用和停用插件时侧栏、顶栏的转圈图标，转速、弧线长短变化和颜色应当一致。
2. 启用、停用插件，以及切换会话、对话结束时，图标不跳、不残留。
3. 在明暗主题下各看一次。
4. 用活动监视器对比渲染进程（DeepSeek Harness Helper (Renderer)）的 CPU 占用。

## 许可

MIT
