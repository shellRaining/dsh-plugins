# dsh-plugins

这是 shellRaining 的 DSH 插件集，使用 pnpm workspace，各插件独立安装和发布。本文件只放入口与硬约束，具体规则按需读，不要一次加载全部文档。

## 常用命令

```sh
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

单包开发用 `pnpm --filter <包名> typecheck` 或 `pnpm --filter <包名> build`。完整交付前依次运行类型检查、构建和现有测试。`pnpm test` 不负责构建，先生成产物。

## 何时读什么

- 开工前读 [架构](docs/ARCHITECTURE.md)，再读目标插件的 README、package.json 和构建配置。
- 写代码前读 [插件开发规范](docs/plugins.md)，尤其是宿主接口、类型边界和资源清理。
- 收尾前读 [质量与验证](docs/quality.md)。涉及宿主加载或界面行为时，按其中的说明验证实际页面。
- 修改开发规则时同步本索引和对应文档；修改用户行为、安装或构建方式时同步插件 README。

## 核心约束

- 所有插件实现必须使用 TypeScript，源码放在 `src/`，React 使用 TSX。启用 `strict`；不得用 `allowJs`、`@ts-nocheck`、批量 `any` 或关闭检查来完成迁移。JavaScript 构建产物、构建脚本和既有空宿主入口不属于业务源码，详见 [插件开发规范](docs/plugins.md)。
- agent 不得自行新增或改写测试，包括主 agent、子 agent、临时测试脚本和快照。可以运行现有测试；需要变更测试时先说明原因并取得用户明确授权。不得为了让检查通过删除、跳过或弱化既有断言，详见 [质量与验证](docs/quality.md)。
- 通过官方 profile、bundle patch 和 client 注入 API 接入 DSH，不直接修改宿主源码。不跨插件导入内部源码，不把独立插件合并成一个安装单元。
- 依赖宿主提供的 React、服务和设计变量，不另建一套 UI 运行时。注册的 ModuleLoader id、包名和依赖声明必须一致。
- 实现保持清晰、简洁，避免无关重构、通用框架和没有实际调用方的抽象。优先使用工具原生命令与声明式配置。
- 新增项目知识和开发说明用中文；写文档前加载 `write` skill。保留已有英文文档、许可证和上游署名，不为统一语言全量改写。
- 知识只记录可复用规则与架构边界，不存聊天记录、临时检查报告、凭据或某台机器的绝对路径。新增一级知识文档先确认范围，不随任务无限扩张。
- 不擅自提交、发布包、修改版本号或更改用户的插件安装配置。遇到用户纠正，先判断是否适合更新为长期规则，再同步相应文档。
