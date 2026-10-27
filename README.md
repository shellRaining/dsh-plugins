# dsh-plugins · shellRaining 的 DSH 插件集

[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI 插件合集：壁纸、批注、侧边会话、Mermaid 渲染、会话标题版式等。全部走官方 profile 机制挂载，不改 DSH 源码；按需单独安装。

## 插件索引

| 插件 | 功能 | 安装 |
| --- | --- | --- |
| [@shellraining/dsh-acrylic-wallpaper](plugins/acrylic-wallpaper) | 本地静态壁纸 + 克制的 Acrylic 模糊、色调遮罩和噪点 | `dsh plugin --profile web add @shellraining/dsh-acrylic-wallpaper` |
| [@shellraining/dsh-local-annotation](plugins/annotation) | 原生高亮、就地批注卡片与显式引用插入（IndexedDB 本地存储） | `dsh plugin --profile web add @shellraining/dsh-local-annotation` |
| [@shellraining/dsh-side-chat](plugins/side-chat) | 右侧边栏派生当前会话的临时对话，可真实修改工作区文件，不污染主会话 | `dsh plugin --profile web add @shellraining/dsh-side-chat` |
| [@shellraining/dsh-mermaid](plugins/mermaid) | Mermaid 代码/图表双视图渲染（fork 自 [MrmoLabs/dsh-mermaid](https://github.com/MrmoLabs/dsh-mermaid)，集成主题与设计变量） | `dsh plugin --profile web add @shellraining/dsh-mermaid` |
| [@shellraining/dsh-session-title-layout](plugins/session-title-layout) | 会话标题版式定制：`<type>：<摘要>`，可配分隔符与摘要语言 | `dsh plugin --profile web add @shellraining/dsh-session-title-layout` |
| [@shellraining/dsh-sidebar-session-preview](plugins/sidebar-session-preview) | 侧栏会话悬浮预览 | `dsh plugin --profile web add @shellraining/dsh-sidebar-session-preview` |
| [@shellraining/dsh-inline-code-copy](plugins/inline-code-copy) | 点击助手输出中的行内代码即复制 | `dsh plugin --profile web add @shellraining/dsh-inline-code-copy` |
| [@shellraining/dsh-brand](plugins/shellraining-brand) | 个人品牌层：替换侧栏与 Hero 的 logo/产品名。fork 它换成你自己的品牌 | `dsh plugin --profile web add @shellraining/dsh-brand` |

## 兼容性

插件按 DSH `0.2.1-rc.x`（`@deepseek-ai/dsh-client-ui-* 0.2.1-rc.3`）开发与验证；DSH 的 client 注入 API 仍在 rc 阶段，升级 DSH 后如插件报 token 缺失，等待本仓库适配即可。

## 开发

pnpm（v12+）monorepo，Node 20+：

```sh
pnpm install
pnpm typecheck # 全部插件类型检查
pnpm build     # 全部插件构建（typecheck + esbuild/tsc）
```

发布由 GitHub Actions 完成：修改插件的版本号并推送到 main，流水线会把 npm 上还没有的版本发布出去，细节见 [docs/quality.md](docs/quality.md)。

所有插件业务源码使用 strict TypeScript，生成的 JavaScript 不手工维护。开发入口与约束见 [AGENTS.md](AGENTS.md)，架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，插件规范见 [docs/plugins.md](docs/plugins.md)，验证与测试权限见 [docs/quality.md](docs/quality.md)。agent 不得自行新增或改写测试。

## 许可

MIT。`plugins/mermaid` 基于 [MrmoLabs/dsh-mermaid](https://github.com/MrmoLabs/dsh-mermaid)（MIT，Mrmo072），沿用其许可并保留署名。
