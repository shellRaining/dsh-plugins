# dsh-session-title-layout

[English](README.md) | 简体中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的会话标题 provider。它让模型只生成标题中有意义的部分，再按你选的版式拼起来，例如：

```text
feat: add dark mode to settings
feat：给设置页增加深色模式
feat/261022/add dark mode to settings
给设置页增加深色模式
```

标题最多由三段组成：

| 段 | 由谁生成 | 说明 |
|---|---|---|
| `type` | 模型 | 从允许列表中选一个（`feat`、`fix` 等）。 |
| `date` | 本插件 | 本地格式化，模型看不到。 |
| `summary` | 模型 | 普通文本，不做 slug 化，语言可指定。 |

只会向模型要求你用到的那几段。

## 要求

- dsh `>=0.2.1-rc.2 <0.3.0`
- Node.js 20 及以上

dsh 同一时间只允许一个异步标题 provider。本包的 bundle 会禁用自带的 `session-title-llm`，不要同时启用别的 provider（比如 all-prompts 那个 bundle）。

## 安装

在 Plugins 页面安装，或让 agent 调用 `plugin_manager` 的 `install_bundle`，目标为：

```text
git+https://github.com/shellRaining/dsh-session-title-layout.git
```

安装 bundle 会插入一行默认配置（`conventional` 版式）。要自定义，在 profile 的 `cordis.patch.yml` 里覆盖这一行：

```yaml
- id: session-title-layout
  config:
    preset: type-summary
    separator: "："
    summaryLanguage: 中文
    automatic: all-prompts
```

如果你是按路径加载插件而不是安装 bundle，就自己插入这一行，`name` 指向 `lib/index.js`。两种方式不要同时用，否则行 id 会冲突。

已安装包的代码更新后需要重启 dsh；配置变更按 profile 的 patch 重载模式生效。

## 配置

所有字段都可省略。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `preset` | `conventional` | `conventional` 为 `type/date/summary`，以 `/` 连接；`type-summary` 为 `type/summary`，以 `/` 连接；`summary` 只有摘要。 |
| `segments` | 取自预设 | 有序列表，元素为 `type`、`date`、`summary`。必须含 `summary`，不可重复。 |
| `separator` | 取自预设 | 段与段之间的文本，如 `": "` 或 `"："`。 |
| `types` | `feat, fix, refactor, docs, chore, style, test, perf, build, ci, revert` | `type` 的允许值，比较时不区分大小写。 |
| `dateFormat` | `YYMMDD` | 支持 `YYYY`、`YY`、`MM`、`DD`，使用本地时间。 |
| `dateSource` | `session-created` | `session-created` 使重新生成标题时日期保持不变；`now` 用生成时刻。 |
| `summaryMaxLength` | `40` | 摘要最多字符数，既写进 prompt 也对结果强制截断。 |
| `summaryLanguage` | 跟随用户语言 | 摘要语言，如 `中文`、`English`。 |
| `automatic` | `first-prompt` | `first-prompt` 只生成一次；`all-prompts` 随新消息重新生成。 |
| `provider`、`model` | 会话主路由 | 生成标题用的辅助模型，要么都设要么都不设。 |
| `maxInputChars` | `8000` | 发给模型的用户文本预算：第一条消息加能放下的最新几条，每条最多取 2000 字符。 |
| `maxOutputTokens` | `2048` | 标题请求的输出 token 上限。 |
| `timeoutMs` | `60000` | 标题请求的超时。 |

配置无效时插件在激活阶段报错，并指出字段名。

## 行为

- 模型回复不可用（没有 JSON、没有 summary，或 `type` 不在允许列表）时本次调用失败，会话保留当前标题，不会猜一个。
- 版式变更只影响之后生成的标题。已有标题以纯文本存于会话日志，不会被改写。
- 标题仍会经过 dsh 自身的规范化和字节上限。

## 隐私

标题生成会把你的提示词发给所配置的模型路由。使用 `all-prompts` 时，每条新消息都会触发一次。请把 `provider` 和 `model` 指向你放心发送提示词的路由。

## 开发

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build   # 生成 lib/；lib/ 已提交，所以 git 安装无需构建
```

纯逻辑（配置、prompt、解析、渲染）在 `src/format.ts`，`src/index.ts` 只负责接到 dsh 上。

## 许可证

[MIT](LICENSE)
