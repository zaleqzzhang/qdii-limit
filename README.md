# QDII Limit Monitor

![QDII Limit Monitor 头图](./og.png)

QDII Limit Monitor 是一个用于查看 QDII 基金申购状态与日累计申购限额的轻量看板。

项目基于东方财富基金公开接口获取基金申购状态数据，在服务端完成数据拉取、解析、标准化和 QDII 筛选，前端提供地区、主题、申购状态、限额等维度的快速筛选与排序。

## 功能特性

- 查看 QDII / 海外基金的申购状态与日累计申购限额。
- 默认展示美国地区、纳指 100 主题、开放申购的基金。
- 支持按基金代码、基金简称、基金类型搜索。
- 支持国家 / 地区多选筛选。
- 支持主题多选筛选，并与地区联动：
  - 选择地区后，主题下拉仅展示该地区实际存在的主题。
  - 当前已选主题如果在新地区中不存在，会自动剔除。
  - 如果已选主题全部不可用，会自动切回全部主题。
- 支持申购状态筛选：开放申购、暂停申购。
- 支持限额筛选：低限额、中限额、高限额、无限额。
- 表格默认按日累计限额从高到低排序。
- 点击基金代码或基金名称可打开东方财富基金详情页。
- 支持明暗主题切换。
- 服务端 API 响应带 CDN 缓存策略，适合部署到 Vercel。
- 每日定时检查申购状态与限额变化，通过 PushPlus 多渠道推送（微信公众号、邮箱等，可配置）。

## 数据口径说明

数据源来自东方财富基金接口：

```text
https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx
```

项目会请求全量基金申购状态数据，然后在服务端本地筛选和标准化。

当前 QDII 入选口径采用较严格的官方信号：

- 基金类型包含 `QDII`。
- 或基金类型包含 `海外`。
- 或基金简称包含 `QDII`。

主题关键词只用于对已入选基金进行分类展示，不再用于决定基金是否进入 QDII 清单。

## 申购状态与限额规则

为了降低理解成本，前端只展示两种申购状态：

- 开放申购
- 暂停申购

当日累计限额为 0，或日累计限额小于最低申购金额时，会归一化为“暂停申购”。

限额展示用于辅助判断额度紧张程度：

- 低限额
- 中限额
- 高限额
- 无限额

## 地区与主题

项目会为每只入选基金计算两个分类字段：

- 国家 / 地区：回答“主要投向哪里”。
- 主题：回答“主要投向什么”。

地区与主题筛选支持联动：选择地区后，主题下拉只显示所选地区实际存在的主题。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- TanStack Table
- Radix UI
- lucide-react
- next-themes
- sonner

## 本地开发

安装依赖：

```bash
pnpm install
```

如需测试通知推送功能，复制 `.env.example` 为 `.env.local` 并填入相应环境变量。

启动开发服务器：

```bash
pnpm dev
```

构建生产版本：

```bash
pnpm build
```

启动生产服务：

```bash
pnpm start
```

## 项目结构

```text
app/
  api/funds/route.ts        服务端基金数据接口
  api/check/route.ts        定时检查与变化推送接口
  globals.css               全局样式与主题变量
  layout.tsx                应用布局
  page.tsx                  首页入口
components/
  fund-dashboard.tsx        看板主界面
  fund-toolbar.tsx          搜索与筛选工具栏
  fund-table.tsx            基金表格
  fund-status-badge.tsx     申购状态徽章
  limit-badge.tsx           限额徽章
  theme-toggle.tsx          明暗主题切换
lib/
  eastmoney.ts              东方财富接口请求与响应构建
  fund-filters.ts           QDII、地区、主题、交易形态分类规则
  fund-format.ts            金额、状态、时间格式化
  fund-normalizer.ts        原始基金记录标准化
  notify-diff.ts            基金变化 diff 与推送消息渲染
  pushplus.ts               PushPlus 微信推送
  snapshot-store.ts         Upstash Redis 快照读写
  types.ts                  类型定义
vercel.json                 Vercel Cron 定时任务配置
.env.example                环境变量模板
```

## 服务端缓存

`/api/funds` 会在服务端拉取东方财富全量数据，过滤并返回应用所需的 QDII 数据。

响应头使用：

```text
Cache-Control: s-maxage=21600, stale-while-revalidate=43200
```

含义：

- CDN 可缓存 6 小时。
- 过期后可在 12 小时内使用 stale 数据并后台更新。

这样可以减少部署到 Vercel 后对上游接口的频繁访问。

## 通知推送

`/api/check` 由 Vercel Cron 每天北京时间 09:10（`10 1 * * *` UTC）触发：

1. 拉取东方财富最新数据，与 Upstash Redis 中的上次快照对比。
2. 出现以下变化时通过 PushPlus 推送（渠道由 `PUSHPLUS_CHANNELS` 配置，默认微信公众号）：
   - 申购状态变化（恢复申购 / 暂停申购）。
   - 日累计限额数值变化（收紧 / 放宽）。
   - 新增 QDII 基金。
3. 无变化时不推送；推送失败时保留旧快照，下次运行自动重试。

首次运行会先建立基线快照，并发送一条"监控已启动"确认消息。消息按变化类型分组展示，每组最多列出 10 只，超出部分汇总提示。删除 Upstash 中的快照键（`qdii:snapshot:v1`）即可重建基线（会再收到一条启动确认）。注意：本地与生产共用同一个 Upstash 库时，本地测试建立基线后，生产首次运行将不再发启动消息。

需要配置的环境变量（仅存于 Vercel，不进 git）：

| 变量 | 说明 |
| --- | --- |
| `PUSHPLUS_TOKEN` | PushPlus 用户 token（pushplus.plus 注册并实名后获取） |
| `PUSHPLUS_CHANNELS` | 推送渠道，逗号分隔，默认 `wechat`；可选 `mail`、`app`、`webhook` 等（[多渠道接口文档](https://pushplus.plus/doc/guide/api.html)） |
| `PUSHPLUS_MAIL_OPTION` | 可选，`mail` 渠道自定义发件邮箱的配置编码（个人中心 → 渠道配置 → 邮件，需 SMTP 信息）；不填用 PushPlus 官网邮箱发送，收件邮箱需在公众号「个人中心 → 个人资料 → 邮箱」中绑定 |
| `CRON_SECRET` | 定时任务鉴权密钥；设置后 Vercel 会在 cron 请求中自动附带 Bearer 头 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST 地址（Vercel 市场集成自动创建，注入名为 `KV_REST_API_URL`，两者兼容） |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST 令牌（Vercel 市场集成自动创建，注入名为 `KV_REST_API_TOKEN`，两者兼容） |

配置步骤：

1. Vercel 后台 → 项目 → Storage → 集成 Upstash Redis（免费额度即可）。
2. `vercel env add PUSHPLUS_TOKEN production`，粘贴 PushPlus token。
3. 如需邮箱渠道：先在「pushplus 推送加」公众号 → 功能 → 个人中心 → 个人资料 → 邮箱 中绑定收件邮箱，然后 `vercel env add PUSHPLUS_CHANNELS production` 填 `wechat,mail`（如需自定义发件邮箱，再配置 `PUSHPLUS_MAIL_OPTION`）。
4. `vercel env add CRON_SECRET production`，填一个随机字符串。
5. `vercel env pull .env.local` 同步到本地后可直接测试。

本地测试：

```bash
pnpm dev

# dry 模式：只渲染消息，不发送、不写快照
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/check?dry=1"

# 正式触发：会写快照并推送通知
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/check"
```

## 部署

推荐部署到 Vercel。

部署前确认可以正常构建：

```bash
pnpm build
```

## 注意事项

- 本项目仅用于信息展示与个人研究，不构成投资建议。
- 上游数据字段和接口行为可能变化，若出现异常需要同步调整解析逻辑。
- QDII 入选与主题分类基于公开字段和关键词规则，可能存在边界情况。

🔗 **友情链接**: [LINUX DO (linux.do)](https://linux.do)
