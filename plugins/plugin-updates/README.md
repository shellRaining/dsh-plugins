# dsh-plugin-updates

检查从 npm 安装的插件有没有新版本。插件页的「已安装插件」列表里可以逐个更新或全部更新，插件详情页里还能挑一个版本安装。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-plugin-updates
```

## 使用

- **已安装插件列表**：有新版本时，「已安装插件」标题旁出现「全部更新（N）」，对应插件卡片的开关左边出现「更新到 x.y.z」。点卡片其他位置照常进入详情页。
- **插件详情页**：有新版本时，标题旁显示「可更新」标签，右上角多一个「更新到 x.y.z」按钮。页面底部有版本列表，每个版本都能单独安装，不兼容当前 DSH 的版本不能点。

只检查依赖记录为 `包名@版本范围` 的插件。Git、本地目录、tarball 来源的插件和 DSH 官方插件都会跳过。

打开插件页或详情页时检查一次，结果缓存 10 分钟，过期后再打开会重新查询。查询直接从浏览器读 npm registry，用的是 profile 中 pnpm 配置的源，查不到时再试插件管理器配置的备选源（默认是 npmmirror）。需要认证的私有源无法检查。

## 更新是怎么做的

插件不改 profile 文件，所有改动都调用宿主插件管理器的接口：先卸载旧版本，再安装 `包名@版本`，用精确版本号保存，并保留原来的启用状态。版本兼容检查、构建脚本审批和锁文件回滚都由宿主处理。

卸载后安装失败时，插件会保持未安装状态，提示里会显示 pnpm 的输出，并提供「恢复」按钮，按原来的版本重新安装。发布不足 24 小时的版本会标为「新发布」，pnpm 开启 `minimumReleaseAge` 时，这类版本可能装不上。

本插件不能在页面里更新自己，因为卸载自己时界面也会一起卸载。有新版本时，它的详情页会给出对应的 `dsh plugin` 命令，退出 DSH 后在终端运行即可。

官方列表没有给卡片开放扩展点，列表上的按钮靠 `data-plugin-group="bundles"`、`data-plugin-package` 和开关的 `role="switch"` 这几个语义属性定位，见 `src/client/anchors.ts`。DSH 改了这部分结构时，列表上的按钮会消失，详情页不受影响。

## 开发

```sh
pnpm --filter @shellraining/dsh-plugin-updates build
```

只有浏览器半侧，源码在 `src/client/`。semver 打包进 `lib/client.js`，React、React DOM 和 `@deepseek-ai/dsh-client-ui-primitives` 由宿主提供。

## 许可

MIT
