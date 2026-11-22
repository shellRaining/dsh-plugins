# 工具名自动还原

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 `llm/stream` 阶段拦截模型流式输出，对照当前请求已注册的工具列表，自动还原被代理别名污染、丢前缀或轻微拼写漂移的工具调用名。

典型场景是通过 CLIProxyAPI（CPA）Claude OAuth Cloak 转发 Opus / Sonnet 请求时，代理会把客户端工具重命名为 `mcp__<server>__<word>_<tool>`，而模型偶尔会丢掉 `mcp__<server>__` 前缀直接输出 `<word>_<tool>`（例如 `orbit_edit`、`village_bash`），导致 CPA 无法还原并透传给下游客户端。

## 还原策略

对不在当前已注册工具列表中的工具名，按以下顺序尝试唯一匹配；所有已经合法的工具名直接 O(1) 放行，不做改写：

1. **显式别名映射**：命中 `aliases` 配置且目标工具已注册时直接替换。
2. **规范化精确匹配**：统一大小写、驼峰和分隔符（如 `WebSearch` -> `web_search`、`AskUserQuestion` -> `ask_user_question`、`read-image` -> `read_image`）。
3. **前缀剥离**：剥离泄漏的 `mcp__<server>__` 命名空间以及 CPA 单英文词前缀 `<word>_`（如 `orbit_edit` -> `edit`、`mcp__brave_lemon__orbit_read_image` -> `read_image`）。
4. **长工具名截断前缀匹配**：剥离前缀后若剩余长度不小于 `minTruncatedPrefixLength`，匹配唯一以该前缀开头的已注册工具。
5. **高置信度相似度回退**：仅在 `block-end` 阶段启用，计算归一化 Damerau-Levenshtein 相似度，同时要求高于 `minSimilarity`、领先第二名至少 `minMargin`，并且通过参数 schema 校验。

在 `block-end` 阶段，所有还原都会结合该次调用实际传入的参数键与目标工具的 JSON Schema `properties` 做核对。如果参数键与目标工具完全不重合（例如模型编造了不存在的工具和参数），插件会放弃改写，避免误触发其他工具。

## 要求

- dsh `>=0.2.2-rc.1 <0.3.0`

## 安装与配置

安装 `@shellraining/dsh-tool-name-recovery` 后即可生效，默认覆盖全部提供方和模型，无需额外配置。如需按提供方或阈值微调，在 profile 的 `cordis.patch.yml` 中覆盖 `tool-name-recovery`：

```yaml
- id: tool-name-recovery
  name: '@shellraining/dsh-tool-name-recovery'
  config:
    providers: []
    models: []
    aliases: {}
    fuzzySimilarity: true
    minSimilarity: 0.78
    minMargin: 0.12
    logRecoveries: true
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `providers` | `[]`（全部） | 仅对指定提供方路由生效 |
| `models` | `[]`（全部） | 仅对指定模型 id 生效 |
| `aliases` | `{}` | 手工指定的原始名到已注册工具名映射 |
| `fuzzySimilarity` | `true` | 是否在 `block-end` 启用相似度回退 |
| `minSimilarity` | `0.78` | 相似度回退的最低分（0 到 1） |
| `minMargin` | `0.12` | 最高分与次高分的最小分差（0 到 1） |
| `minFuzzyLength` | `4` | 参与相似度回退的最短规范化长度 |
| `minTruncatedPrefixLength` | `6` | 参与截断前缀匹配的最短规范化长度 |
| `logRecoveries` | `true` | 还原成功时在宿主日志输出一条 info 记录 |

## 开发

```sh
pnpm --filter @shellraining/dsh-tool-name-recovery build
```
