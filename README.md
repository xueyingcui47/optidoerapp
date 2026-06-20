# OptiDoerAPP — Web MVP（笔记 · 日历 · 提醒 + AI）

基于 SOW《跨平台「笔记 + 日历 + 提醒」订阅制应用》的 **Phase 1 Web 端**实现（可运行 MVP）。
技术栈：**Next.js 14 (App Router) + TypeScript + Tailwind CSS**。数据存于浏览器 localStorage，
AI 自然语言事件创建默认走**本地 mock 解析器**，配置 API Key 后自动切换到真正的 Claude。

## 快速开始

```bash
cd OptiDoerApp
npm install
npm run dev
```

打开 http://localhost:3000 ，注册一个本地账号即可开始（15 天试用）。

## 已实现（对应 SOW）

| SOW 章节 | 功能 | 状态 |
|---|---|---|
| 4.2 笔记 | 富文本（加粗/斜体/标题/列表/引用/代码/链接）、标签、搜索、置顶、归档、删除、笔记提醒 | ✅ |
| 4.3 日历 | 日 / 周 / 月视图、带时间事件、全天事件、地点/备注、重复规则字段、点击空格创建 | ✅ |
| 4.4 提醒 | 事件/笔记提醒、提前量、通知偏好、浏览器通知（模拟设备推送） | ✅（前端） |
| 4.4b.1 AI | **自然语言创建事件**（中/英），预览→确认→保存，置信度提示 | ✅ |
| 4.4b.3 AI 隐私 | 首次使用隐私确认、AI 调用审计日志、可清空、功能开关 | ✅ |
| 4.5 试用/付费墙 | 15 天试用倒计时、硬付费墙、两层×月/年定价、模拟订阅 | ✅ |
| 4.6 导入 | 通用 CSV（事件/笔记，字段映射+模板）、.ics 日历文件；均含预览/去重/撤销 | ✅ |

## AI：先 mock，之后填 key

- **不配置任何东西**：`/api/ai/parse-event` 使用 `src/lib/mockParser.ts` 本地启发式解析，数据不出本机。
- **接入真 Claude**：
  ```bash
  cp .env.example .env.local
  # 编辑 .env.local，填入 ANTHROPIC_API_KEY
  ```
  之后服务端会自动改用 Claude（默认模型 `claude-opus-4-8`，可用 `ANTHROPIC_MODEL` 改为
  `claude-sonnet-4-6` 以控制高频调用成本）。Claude 调用失败时自动降级回 mock，不中断用户。
- Key 只在服务端使用（API 路由 `runtime = "nodejs"`），**绝不暴露给浏览器**。

## 目录结构

```
OptiDoerApp/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx            # 根布局 + StoreProvider + AppShell
│  │  ├─ page.tsx              # 「今天」总览
│  │  ├─ notes/page.tsx        # 笔记
│  │  ├─ calendar/page.tsx     # 日历（月/周/日）
│  │  ├─ reminders/page.tsx    # 提醒
│  │  ├─ import/page.tsx       # 导入（CSV / .ics，预览·去重·撤销）
│  │  ├─ settings/page.tsx     # 设置（账号/AI/通知）
│  │  └─ api/ai/parse-event/route.ts   # AI 解析（Claude / mock）
│  ├─ components/              # AppShell、Sidebar、Paywall、Onboarding、EventEditor…
│  └─ lib/                     # types / store / date / mockParser / ai / reminders
```

## 尚未实现（后续 / 二期，见 SOW 第 8 节）

- 真正的云端账号与同步（Supabase Auth + Postgres + Realtime）——当前为本地 localStorage。
- 服务端提醒调度与邮件送达（Resend）、原生推送（FCM/APNs）。
- 真实支付（Stripe / Apple IAP / Google Play Billing）与年付锁价 cohort 追踪。
- Todoist / Google / Apple 的 OAuth 直连导入（当前已提供 CSV 与 .ics 文件导入；OAuth 为 Phase 2）。
- 外部日历双向同步、智能日程建议（AI 二期）、桌面端、中文/多语言完整化。

> 当前实现把这些点都留了清晰的接口与位置，便于后续按 Phase 2 接入真实后端。
