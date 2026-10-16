# platform 模块约定

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和随附的 docs 为准）。

- 内容：平台主界面（React + Vite，`src/`）和平台 Worker（`worker/`），Worker 名 `arcade`，自定义域名 `game.yyyu.org`。
- `/api/*`（账号、云存档、好友、排行榜，以后还有房间登记）的方案和**接口约定**见仓库根的 `docs/platform-backend.md`（第 5–7 节、第 15 节）。
  拆分时把这份文档一起复制到 `platform/docs/`。
- 游戏目录在 `src/games.ts`，封面放在 `public/covers/<id>.webp`（16:9），来源写进 `ASSETS.md`。平台只负责展示和跳转，不引用任何游戏的代码。
- 正式环境只有这一个平台 Worker：不开 workers.dev、不建测试 Worker（所有者 2026-10-14 定）。测试全在本地：`npm test`（vitest 跑在本地 workerd 里）、
  `npm run dev:api`（wrangler dev + 本地 D1）。新接口先"暗上线"（界面入口藏在开关后），主线在线上验证后再打开。
- 账号界面从 0.5.0 起打开（暗上线开关 `ACCOUNTS_UI` 和 `?beta=` 在 0.10.17 删了）。测试期是邀请制：注册默认关着，管理员可在 `/admin` 随时开关（D1 `settings`；`vars.REGISTRATION` 是紧急总闸，见 `worker/api/settings.ts`），账号由管理员在 `/admin` 或用
  `npm run admin` 建（所有者 2026-10-14 定）。没登录的访客在首页一个 `/api` 请求都不发，只有打开登录页时问一次 `/api/me`。
- 管理接口 `/api/admin/*` 的两种认证（Bearer 令牌、管理员会话）和各自能做什么写在 `worker/api/admin.ts` 开头；改权限时同步改那里和测试。
- 改界面后跑 `npm run smoke`（无头浏览器走建号和账号主流程，控制台零报错、没有意料外的 4xx/5xx），并亲自看 `shots/` 里的截图。
- 命令：`npm run dev`（界面，5180）、`npm run dev:api`（接口，5181）、`npm test`、`npm run smoke`、`npm run build`、`npm run preview`（4180）、
  `npm run deploy`（拆成独立仓库后才用；在总仓库里正式部署只经 PR 合并进 main 后由 CI 完成）。
- 平台接口只增不改。游戏依赖平台，平台不依赖任何游戏，所以带接口变更的发布顺序是先迁移、再平台、后游戏。

## 写接口的规矩

- 每个接口都要有测试：正常路径、错误码、`rowsWritten()` 等于 `docs/platform-backend.md` 7.2 的写入行数；写请求测 CSRF（缺 `X-Arcade` 或 Origin 不对 403）、
  限流 429（被拒的请求写 0 行）。改了写入行数就同步改 7.2。
- D1 一律经 `worker/api/db.ts` 的 `Db` 调用，指定写入类别（6.6 的分类预算），不直接用 `env.DB`（计量会漏）。
- 限流计数用 `ratelimit.ts` 的带条件 UPSERT（超限 0 行写入）；匿名接口先过内存令牌桶。
- 密码、恢复码、会话令牌、IP 只存哈希；日志不记 cookie、请求体；错误日志只记路径和错误类型。
- 上限和阈值放 `worker/api/config.ts` 的默认值里，线上要调就改 `wrangler.jsonc` 的 `vars.LIMITS`，不在代码里散落数字。
- 迁移只增不删：加新文件 `migrations/000N_*.sql`，不改已合并的迁移。
