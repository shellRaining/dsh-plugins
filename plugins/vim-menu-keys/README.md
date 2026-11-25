# dsh-vim-menu-keys

在 DSH 的弹出列表里用 Neovim 补全菜单的键位上下移动。

## 使用

| 按键 | 作用 |
| --- | --- |
| `Ctrl-n` / `Ctrl-j` | 下一项，等同 `↓` |
| `Ctrl-p` / `Ctrl-k` | 上一项，等同 `↑` |

生效位置：

- `/model`、`/effort`、`/permission` 等命令选择框。
- 输入框的 `/` 和 `@` 补全菜单。
- 输入框的模型菜单，包括模型列表和强度列表。
- 其他焦点在 `role="menu"` 菜单里的弹出菜单。

页面上没有展开的列表时不拦截，输入框里 `Ctrl-k` 删到行尾、`Ctrl-p` 上一行等 macOS 原生编辑键照常工作。输入法组合中的按键不处理。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-vim-menu-keys
```

`desktop` profile 使用应用内插件管理器，或退出桌面应用后使用随应用分发的 Desktop CLI。

## 实现与限制

插件在捕获阶段把上述按键换成发给焦点元素的 `↓`/`↑` 事件，由各菜单原有的键盘处理负责移动，不读写菜单状态。判断“有展开的列表”依据 ARIA 属性：焦点在 `role="menu"`、`role="listbox"`、`role="searchbox"` 或 `aria-expanded="true"` 的元素内，或者页面上有可见的 `role="listbox"`。上游改了这些语义属性时需要重新核对。

- Windows 和 Linux 上 `Ctrl` 是 DSH 的主修饰键，`Ctrl-n`、`Ctrl-k` 等已绑定的快捷键会先被桌面端原生拦截，本插件收不到。macOS 不受影响。
- 菜单若只认可信事件（`isTrusted`），合成的方向键不会生效；DSH `0.2.3-alpha.2` 的上述菜单都不检查这一点。

## 许可

MIT
