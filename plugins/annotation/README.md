# 批注

选中助手回复或侧栏文件预览里的文字，就地写批注。高亮用浏览器原生的 CSS Custom Highlight API，数据存在本机 IndexedDB。

## 使用

1. 选中文字，点工具条上的「批注」，写下批注后保存（可以留空，只标记原文）。
2. 保存后，输入框光标处会插入一个「批注 N」引用。每条批注一个引用，编号和原文旁的编号一致。可以在引用前后写问题，也可以用退格删掉某个引用，这条批注就不随本条消息发送。
3. 输入框左下角的「批注 ×N」只统计当前草稿里的引用，悬停可以查看或移除。
4. 发送时，每个引用会展开成带原文和批注的 `<annotation>` 块，模型按「Annotation N：」逐条回应。你的消息气泡里，这些块仍显示为「批注 N」，悬停可以看原文和批注。
5. 发送后，已发送的批注和它的高亮会被清掉。新批注的编号接着会话里剩下的批注往后排，没有剩下的就从 1 开始。

点击原文高亮或编号可以重新编辑批注；如果它不在当前草稿里，编辑卡片上有「附加到输入框」按钮。

## 从旧包迁移

本包原名 `@shellraining/dsh-local-annotation`。备份 profile 配置，移除旧包后再安装新包，不要同时启用两者。保持相同的浏览器来源和用户数据，已有批注和显示偏好会继续从原来的本地存储读取。Cordis 配置 ID `local-annotation`、草稿与消息中的批注引用格式保持不变。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-annotation
```

## 实现说明

批注引用通过宿主的 `inputTriggers.registerSource` 注册来源和 `codec`，用会话 scope 上的 `slash/input-insert-reference` 事件插入输入框；消息气泡里的批注块由 `uiConversation.userText` 规则识别，再通过 `conversation.user.text.node` slot 渲染。插件不拦截键盘，也不改宿主 DOM。

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。客户端保持 DSH ModuleLoader 加载方式，宿主入口和发布路径不变。

```sh
pnpm --filter @shellraining/dsh-annotation build
```

## 许可

MIT
