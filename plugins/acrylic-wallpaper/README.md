# dsh-acrylic-wallpaper

本地静态壁纸与克制的 Acrylic 模糊、色调遮罩和噪点，全部取材 DSH 设计变量（--dsw-*），跟随主题与外观设置。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-acrylic-wallpaper
```

## Reveal 光效

开启「Win10 风格」和「悬停与按压光效」后，鼠标或笔靠近控件时会照亮边缘，悬停时显示局部表面光。主聊天已发送的用户消息（含 steering 消息）、侧边聊天消息、输入卡片和待办卡片只显示边缘光，不改变文本选择、复制或焦点行为。

按钮、菜单项等可交互控件还会显示独立的按压光：短按后扩散淡出，持续按住时缓慢扩散，松手后加快消退。光效参考 [WinUI 2 的 Reveal 实现](https://github.com/microsoft/microsoft-ui-xaml/blob/17bf1fc470bae72749998f2350cf19c9534da3f7/dev/Lights/RevealHoverLight.cpp)，采用 66ms 点亮、200/266ms 快速淡出及 1000/1500ms 慢速淡出；网页渐变的半径和亮度是近似值。离开控件、取消操作、失焦或关闭插件会清理按压光，不添加卡片缩放或倾斜。

光效跟随明暗主题。减少动态效果、高对比度或减少透明度模式下会关闭；触摸和键盘操作不触发装饰光，保留宿主原有反馈。现有 `reveal` 设置同时控制悬停与按压，无需迁移配置。

## 控件按下状态

「Win10 风格」还会补齐宿主 outline、toolbar 和 primary 按钮缺少的 Pressed 底色。底色由原生 `:active` 状态控制，按住时保持、松开时恢复，与短暂的按压光独立；关闭光效或开启减少动态效果后，按钮仍保留底色反馈。ghost 按钮沿用宿主已有的 active 配色，不重复叠色。toolbar 保留原有底色并叠加状态色；primary 没有专用 pressed token，暂用原底色与前景色的小比例混合作为网页近似，仍需在实际主题下检查对比度。消息正文和输入框不增加按压底色。

微软的[普通按钮模板](https://github.com/microsoft/microsoft-ui-xaml/blob/17bf1fc470bae72749998f2350cf19c9534da3f7/dev/CommonStyles/Button_themeresources_v1.xaml)使用独立的背景、边框和前景状态资源；[ButtonRevealStyle](https://github.com/microsoft/microsoft-ui-xaml/blob/17bf1fc470bae72749998f2350cf19c9534da3f7/dev/Materials/Reveal/RevealBrush_rs2_themeresources_v1.xaml)还包含 PointerDown/PointerUp 形变动画。本插件目前只补缺失的底色，不覆盖宿主边框、文字色和焦点环，也不宣称完整复刻该模板。宿主按钮没有统一的内容容器，直接缩放按钮会改变命中区域和固定定位后代，因此暂不添加通用缩放或倾斜。

## 开发

```sh
pnpm --filter @shellraining/dsh-acrylic-wallpaper typecheck
pnpm --filter @shellraining/dsh-acrylic-wallpaper build
```

主聊天气泡通过宿主 CSS 模块动态解析，不依赖构建哈希；模块未加载时跳过，加载后自动更新。侧边聊天使用其作用域内的普通气泡类，排除待发送消息。升级宿主或侧边聊天后，应在实际 DSH 页面检查消息边缘、内部按钮、文本选择、滚动遮挡及插件启停。构建完成不代表界面已更新，需确认宿主加载的是该构建目录，再刷新页面。

## 许可

MIT
