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

## 开发

开发使用仓库根目录的 Node 24.9+ / pnpm 环境，依赖版本统一由根 `pnpm-workspace.yaml` 的 catalog 管理。`build.ts` 调用共享 Vite 构建，构建前先执行 TypeScript 7 原生 `tsc` 类型检查。构建保留 `lib/index.js`、`lib/format.js`，并另行生成对应 `.d.ts`。

```sh
pnpm --filter @shellraining/dsh-session-title-layout build
```

## 许可

MIT
