# 会话自动命名

根据对话内容自动命名会话，支持自定义标题格式和摘要语言。例如：`<type>：<摘要>`（如 `feat：重命名侧边栏会话标题`），分隔符、摘要语言、触发方式均可配。

在 profile 或 home 的 cordis.patch.yml 覆盖配置：

```yaml
- id: session-title-layout
  config:
    preset: type-summary
    separator: "："
    summaryLanguage: 中文
    automatic: all-prompts
```

## 从旧包迁移

本包原名 `@shellraining/dsh-session-title-layout`。备份 profile 配置，移除旧包后再安装新包，不要同时启用两者。Cordis 配置 ID 和标题 provider ID 仍为 `session-title-layout`，已有按 ID 编写的配置覆盖无需改名；格式、摘要语言和触发方式保持不变。显式引用旧包名或旧目录的配置需改为新名称。已有会话标题不会因为包名变化而重写。

## 安装

```sh
dsh plugin --profile web add @shellraining/dsh-session-auto-rename
```

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。构建保留 `lib/index.js`、`lib/format.js`，并另行生成对应 `.d.ts`。

```sh
pnpm --filter @shellraining/dsh-session-auto-rename build
```

## 许可

MIT
