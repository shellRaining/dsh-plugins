# dsh-effort-picker

用键盘切换思考强度。

## 使用

- 在输入框键入 `/effort`（或搜「思考强度」），弹出当前模型公布的强度列表，当前值打勾。`↑`/`↓` 移动，Enter 或 Tab 选定，Escape 关闭。
- 在本页面把会话切到另一个模型后，不管是用 `/model` 还是输入框的模型菜单，都会立即弹出同一个列表，接着选强度即可。新模型只有一档或没有强度时不弹。其他窗口或宿主改动造成的模型变化不会弹出。
- 只改强度、模型不变时不弹。按 Escape 关掉列表，强度保持切换模型时选择器带上的值（`/model` 用新模型的默认强度）。
- 子代理会话没有这个命令，和 `/model` 一致。

配合 [dsh-vim-menu-keys](../vim-menu-keys) 可以用 `Ctrl-n`/`Ctrl-p` 移动。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-effort-picker
```

`desktop` profile 使用应用内插件管理器，或退出桌面应用后使用随应用分发的 Desktop CLI。

## 本地开发

```sh
pnpm --filter @shellraining/dsh-effort-picker build
```

需要即时预览时，按仓库 [质量与验证](../../docs/quality.md) 中“本地链接与即时预览”一节把 profile 链接到本目录。

## 实现与兼容性

依据 DSH `0.2.3-alpha.2` 的源码实现，宿主接口集中在 [src/host.ts](src/host.ts)：

| 依赖 | 用途 |
| --- | --- |
| `ctx.commandUi.register` | 注册 `/effort` 选择框。 |
| `ctx.commandUi.popupFor(scope).open` | 换模型后主动打开选择框。`popupFor` 在公开契约里返回 `unknown`，这里按实现中的控制器结构调用，上游改动时最可能在这里失效。 |
| `ctx.modelDirectories.directoryFor` | 读取模型目录与当前选择，提交 `select`。`pending` 字段用来区分本页面发起的选择。 |
| `ctx.sessions.list` 的 `retainedBy.mainView` | 找到主视图中的会话，与上游各插件的做法相同。 |

只跟随主视图会话；右栏侧边会话里的模型切换不会弹出列表。

人工验收：分别用 `/model` 和输入框模型菜单切换到有多档强度的模型，确认弹出列表、当前值打勾、选定后输入框模型位显示新强度；切到只有一档的模型确认不弹；用 `/effort` 单独改强度确认不会再次弹出；停用插件后确认 `/effort` 消失。

## 许可

MIT
