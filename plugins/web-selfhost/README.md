# 自建搜索与抓取

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 `web_search` 和 `web_fetch` 提供两个提供方，后端是你自己部署的服务：

| 提供方 id | 请求 | 后端 |
|---|---|---|
| `selfhost-searxng` | `GET {baseURL}/search?q=...&format=json` | SearXNG |
| `selfhost-crawl4ai` | `POST {baseURL}/crawl`，请求体 `{"urls": [url]}` | Crawl4AI，也可以是前面套了一层路由的兼容服务 |

dsh 默认使用的 DeepSeek Search API 和 Fetch API 按次计费，换成自建服务就没有这笔费用。

## 要求

- dsh `>=0.2.2-rc.1 <0.3.0`
- 一个同时提供上面两个接口的服务，通过 `X-API-Key` 请求头鉴权。如果 SearXNG 和 Crawl4AI 分开部署，可以在前面加一层 nginx 统一转发。

## 安装与启用

只安装插件不会改变任何行为：没配置 `baseURL` 时，两个提供方都处于不可用状态。启用需要三步。

1. 安装 `@shellraining/dsh-web-selfhost`。
2. 在 profile 的 `cordis.patch.yml` 中填写服务地址，并把 dsh 的搜索和抓取固定为这两个提供方：

   ```yaml
   - id: web-selfhost
     name: '@shellraining/dsh-web-selfhost'
     config:
       baseURL: https://crawl.example.com

   - id: web
     name: '@deepseek-ai/dsh-web'
     config:
       searchProvider: selfhost-searxng
       fetchProvider: selfhost-crawl4ai
   ```

   第二段也可以不写，改在设置页的「网页搜索与抓取」里选择。
3. 把 API Key 存到 dsh 凭据库，引用名为 `CRAWL_API_KEY`；也可以在启动 dsh 的环境里设置同名环境变量。

## 配置

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseURL` | 空，未启用 | 服务根地址 |
| `apiKeyEnv` | `CRAWL_API_KEY` | 凭据引用名 |
| `searchResults` | `10` | 单次搜索最多返回的结果数 |
| `timeoutMs` | `90000` | 单次请求的超时时间（毫秒） |
| `maxBodyChars` | `100000` | 抓取正文超过这个长度会被截断 |
| `minContentChars` | `200` | 正文短于这个长度视为可疑 |
| `qualityHints` | `true` | 是否在结果里附加质量提示 |

## 质量提示

结果可能有问题时，插件会在返回给模型的内容末尾附一句提示，请 agent 在回复里告诉用户是哪个 URL 或查询、出了什么问题，方便之后人工汇总，再去修复自建服务。插件本身不写文件，也不上报任何数据。

会触发提示的情况：

- 请求失败或超时，提示附在错误信息后面。用户主动取消的请求不提示。
- 搜索没有结果。
- 抓到的正文过短，或者正文较短且开头像 Cloudflare 验证页、要求开启 JavaScript 的页面、验证码、拒绝访问页或登录墙。

## 开发

```sh
pnpm --filter @shellraining/dsh-web-selfhost build
```
