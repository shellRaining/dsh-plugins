# dsh-session-title-layout

会话标题版式提供者：`<type>：<摘要>`（如 `feat：重命名侧边栏会话标题`），分隔符、摘要语言、触发方式均可配。

在 profile 或 home 的 cordis.patch.yml 覆盖配置：

```yaml
- id: session-title-layout
  config:
    preset: type-summary
    separator: "："
    summaryLanguage: 中文
    automatic: all-prompts
```

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-session-title-layout
```

## 许可

MIT
