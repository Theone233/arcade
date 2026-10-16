# 小游戏街机厅（arcade）

小游戏平台：主界面列出各个小游戏，选一个进入；`/api/*` 提供账号、云存档、好友和排行榜；钱包（筹码，0.9.0）给游戏的服务端用服务绑定 RPC 调。
0.10.x 起平台把各游戏串起来：战绩页（`/me/stats`、别人的 `/u/<id>`）、排行榜页（`/boards`：本周净赢、各游戏的每日挑战、称号收集）、好友分享和点名字看战绩，
钱包页的"最近进出"流水，大厅的提醒条（桌上的筹码、就地领补给）、最近玩过的排前面和本周净赢；管理页有今日概况、可调的钱包规则和大厅公告。
测试期是邀请制（所有者 2026-10-14 定）：不登录不能玩，注册默认关着，账号由管理员在 `/admin` 或用本机建号工具建；管理员可以随时开关注册（0.8.0）。
本目录是总仓库 `yyyu-star/arcade` 里的 `platform/` 模块；游戏在同一仓库的 `games/<id>/` 下。

架构和选型原则见仓库根的 `docs/architecture.md`；后端方案和**接口约定**见 `docs/platform-backend.md`（第 5–7 节、第 15 节）。

## 命令

```bash
cd platform
npm ci
npm run dev        # 界面开发服务器 0.0.0.0:5180
npm run dev:api    # 接口：本地 D1 应用迁移后起 wrangler dev，0.0.0.0:5181（先 npm run build 生成 dist/，再照下面准备 .dev.vars）
npm test           # 测试：类型检查 + vitest（跑在本地 workerd 里，D1 是本地库）
npm run smoke      # 界面冒烟：构建后用临时本地 D1 起 wrangler dev（5181，要空着），无头浏览器走建号、登录、账号主流程和各种出错提示，截图到 shots/
npm run smoke -- --only=wallet   # 只跑一段（一次只认一个）：wallet chunk next stats boards friends rules overview notice nudge
npm run admin -- list   # 本机建号工具，见下面「邀请制」
npm run build      # 类型检查 + 正式构建到 dist/
npm run preview    # 用正式构建启动服务 0.0.0.0:4180
```

本地起接口前，先 `npm run build` 生成 `dist/`（wrangler 把它当静态资源目录，没有就起不来；改了界面要重新 build），
再把 `.dev.vars.example` 复制成 `.dev.vars`（里面是本地用的假 Secret，`.dev.vars` 不进 Git）：

```bash
npm run build
cp .dev.vars.example .dev.vars
npm run dev:api
curl http://localhost:5181/api/me
```

写请求要带 `X-Arcade: 1` 和 `Origin: http://localhost:5181`（见 `docs/platform-backend.md` 15.1）。

改界面时两个一起开：`npm run dev:api`（接口 5181）和 `npm run dev`（界面 5180，热更新）。vite 把 `/api` 转给 5181，并把 Host、Origin 改成 5181 的，
所以 `.dev.vars` 里的 `SITE_ORIGIN` 保持 `http://localhost:5181` 就行。本地注册默认也关着；先用建号工具建一个管理员
（令牌是 `.dev.vars.example` 里的本地假值）：

```bash
ARCADE_ADMIN_TOKEN=dev:local-dev-admin-token-000000 npm run admin -- create me 我自己 --admin --base=http://localhost:5181
```

## 邀请制（测试期）

- 注册开关存在 D1（`settings` 表，迁移 0004），管理员在 `/admin` 的"开放注册"或 `npm run admin -- registration open|close|status` 里改，不用重新部署；没设过按关。
  关着时 `POST /api/auth/register` 回 403 `registration_closed`，登录页不露"注册"。
  `wrangler.jsonc` 的 `vars.REGISTRATION` 是紧急总闸：`"switch"`（默认）听上面的开关；改成 `"off"` 或任何别的值都一定关，管理页会说明"开关暂时不起作用"（`worker/api/settings.ts`）。
- 没登录时首页的游戏卡片是"登录后才能玩"，点了去 `/login?from=<id>`；各游戏的 Worker 自己也会挡（经服务绑定问 `/api/me`）。
- 登录后，有好友房的游戏（`src/games.ts` 里写了 `online`，目前是掼蛋、德州、麻将）在"进入游戏"旁边多一个"好友房"，链到游戏地址加参数（都是 `?online=1`；麻将认这个参数之前打开的是它的选桌页，里面也有好友房入口）。
  平台不设开关：游戏关掉联机时这个链接照样打开游戏首页；额度（每人几个房间、每天开房数）由游戏和 arcade-kit 管。
- `/privacy` 隐私说明里有"积分和筹码"一段（所有者定）：免费、没有充值；积分筹码没有现金价值，不能买、换、转让，不设奖品；
  不涉及线下财物；可能因调整规则或清理数据清零；适用于所有游戏。新游戏有筹码、积分时以这段为准。
- 管理员：`users.role = 'admin'`，`/api/me` 的 user 带 `isAdmin: true`，右上角多一个"管理"。管理员只能用建号工具建，没有改角色的接口。
- `/admin`：今日概况和 7 天趋势；大厅公告；开放注册；钱包规则（补给额、单机每日净赢份数、新号筹码、单次调整上限，即时生效、留记录）；
  给朋友建号（密码留空自动生成"3 个词 + 2 位数字"）、重设密码（顺带可换恢复码）、删号，账号列表带钱包摘要，点开看战绩和最近 30 笔流水；最近 30 天的筹码统计。
  大厅的"管理筹码"小窗口给人加减筹码。密码卡片可以一键复制成一段话发给对方。
  在页面上动不了管理员账号（包括自己）。
- 本机建号工具 `tools/admin.ts`（主线用）：

  ```bash
  npm run admin -- list
  npm run admin -- create <用户名> <昵称> [--admin] [--password=<密码>]
  npm run admin -- reset <用户名> [--new-recovery-code] [--password=<密码>]
  npm run admin -- registration open|close|status
  ```

  调线上 `https://game.yyyu.org/api/admin/*`（`--base=<地址>` 换成别的），令牌只从环境变量 `ARCADE_ADMIN_TOKEN` 读、不打印；生成的密码和恢复码打印在终端。
  不给 `--password` 时由服务器生成（推荐：命令行里的密码会留在 shell 历史里）。

## 代码结构

- `src/`：界面。`App.tsx` 首页和页面切换，`pages/` 下是登录注册、找回密码、我的账号、好友（`/friends`、好友链接 `/f/<码>`）、我的筹码（`/wallet`）、战绩（`Stats.tsx`：`/me/stats`、`/u/<id>`）、排行榜（`Boards.tsx`：`/boards`）、隐私说明、管理界面；`session.tsx` 登录状态（有登录提示 cookie 才问 `/api/me`，8 秒超时、再试 2 次），`wallet.tsx` 钱包余额（登录后问一次，进钱包页再问一次），
  `api.ts` 接口封装，`router.tsx` 极简路由，`ui.tsx` 表单和恢复码卡片，`ledger.tsx` 钱包流水列表，`gamefile.ts` 读各游戏公开的 JSON，`titles.ts` 用它读 `titles.json`（称号名），`daily.ts` 用它读 `daily.json`（每日榜分数怎么写），`next.ts` 登录后跳回的地址（`?next=`），`AdminChips.tsx` 大厅的管理筹码小窗口。
- `public/_headers`：静态页面的安全头（CSP 等，`docs/platform-backend.md` 5.2）。只管静态资源，`/api` 的响应由 Worker 自己回。
  改界面时别用内联脚本、内联 style、外站资源，CSP 会拦；冒烟会把任何拦截当成失败。
- `tools/smoke.ts`：界面冒烟（`npm run smoke`）；`tools/admin.ts`：本机建号工具（`npm run admin`）；`tools/cover.ts`：程序画的德州封面（`npm run cover`），也把别的游戏给的 SVG 封面光栅化成 800×450 webp（`npm run cover -- --from=<SVG> --id=<游戏 id>`，麻将用这个）。
- `ASSETS.md`：素材说明（封面等图片的来源）。
- `worker/index.ts`：Worker 入口。`/api/*` 交给 `worker/api/router.ts`；Cron 每天跑 `worker/api/cron.ts`（先记筹码统计，再清理）；还导出给游戏用的钱包 RPC 入口 `WalletService`（`worker/wallet-service.ts`）。
- `worker/api/`：
  - `router.ts`：路由表和通用检查（Host、方法、熔断档位、X-Arcade 与 Origin、请求体）；
  - `auth.ts`、`account.ts`：注册、登录、退出、找回、改昵称；改密码、换恢复码、退出其他设备、注销；
  - `admin.ts`：管理接口（Bearer 令牌或管理员会话），`words.ts` 生成好记的密码；
  - `friends.ts`：好友、屏蔽、换好友码（对别人只给公开资料，不给用户名）；
  - `boards.ts`：排行榜（简单版，不防作弊：只查格式、只防刷额度，每人每榜留最好的一条；读榜只给公开资料）。
    榜单只收每日榜 `daily-YYYY-MM-DD` 和 `src/games.ts` 里登记的固定榜（`boards`）；写入单独记在排行榜类预算；
  - `wallet.ts`、`wallet-store.ts`、`wallet-api.ts`：钱包（`docs/platform-backend.md` 5.9、`docs/economy.md`）：带入、结回、放弃、到期退回、每日补给和 client 模式的每日上限。
    `wallet.ts` 是核心（类型和纯函数的账，不碰 D1），`wallet-store.ts` 读写那一行（一人一行、带 `rev` 的乐观并发）、管理员可调的规则和每天的统计，`wallet-api.ts` 是浏览器和管理页的接口；只能 api → store → 核心这样 import；
    浏览器只有 `GET /api/wallet` 和 `POST /api/wallet/relief`，带入、结回、放弃只能经 `WalletService` 的 RPC 调；
  - `stats.ts`：战绩页（钱包行里的 `career`）；`leaderboard.ts`：排行榜页（本周净赢、称号，每个 isolate 缓存 5 分钟）；
  - `settings.ts`：运行时设置（注册开关、大厅公告），每个 isolate 缓存 30 秒；钱包规则也存在 settings 表，代码在 `wallet-store.ts`；
  - `saves.ts`：云存档读写。游戏白名单就是 `src/games.ts` 的 `GAMES`，加游戏时登记一次，界面和接口都认；
  - `crypto.ts`：PBKDF2、pepper HMAC、恢复码、会话令牌、IP 哈希；`validate.ts`：用户名、密码、昵称规则；
  - `ratelimit.ts`：持久限流、每天的上限和内存令牌桶；`time.ts`：北京时间（每日榜、钱包的今天、周榜）；`meter.ts`：计量与熔断档位；`db.ts`：D1 包装（按类别记写入行数）；
  - `context.ts`、`http.ts`、`session.ts`：请求上下文、错误码和给玩家看的文案、会话；`cron.ts`：每天的统计和清理；
  - `config.ts`：所有上限和阈值的默认值，线上在 `wrangler.jsonc` 的 `vars.LIMITS` 里覆盖。
- `migrations/`：D1 迁移，只增不删。
- `test/`：每个接口都有测试，并断言写入行数（`docs/platform-backend.md` 7.2）。`d1-facts.test.ts` 记录了实测的 D1 计数口径。

## 部署

- 线上地址：https://game.yyyu.org（自定义域名）。不开 workers.dev 地址，也没有测试 Worker（所有者 2026-10-14 定）。
- 改动经 PR 合并进 `main` 后，GitHub Actions 自动构建并部署（仓库根的 `.github/workflows/platform.yml`）。部署前要先对正式库跑迁移：
  `wrangler d1 migrations apply arcade --remote`。`npm run deploy` 是拆成独立仓库后用的；在总仓库里不对正式环境手动部署。
- Secret（不进 Git，正式环境一套）：`PEPPER_PW`、`PEPPER_RC`、`PEPPER_SID`、`PEPPER_IP`，值写成 `<kid>:<随机串>`（随机串至少 16 个字符）；
  换 pepper 时把旧值放进对应的 `*_PREV`（`PEPPER_IP` 没有）。缺 Secret 时 `/api` 返回 503，不会写出没法验证的哈希。
  紧急开关 `API_MODE`（`normal` / `readonly` / `off`）也是 Secret，用法见 `docs/platform-backend.md` 6.6。
  `ADMIN_TOKEN`（同样 `<kid>:<随机串>`）给本机建号工具用；没设时管理接口只认管理员的会话。
- 正式域名上，各游戏用路径路由 `game.yyyu.org/games/<id>/*` 直接挂自己的 Worker（路由优先于平台的自定义域名），请求不经过平台。

## 加一个新游戏

见仓库根 `AGENTS.md` 第 2 节。在 `src/games.ts` 登记后，这个游戏的 `gameId` 也就能用云存档了。
登记即生效的还有：钱包的游戏白名单、保留用户名（都从 `GAMES` 派生，`GAME_IDS`）；钱包的游戏那边服务绑定写上 `props.game`（`docs/platform-backend.md` 5.9）。
想先接钱包、存档，再正式上大厅：先登记成 `status: 'coming'`（大厅显示"即将上线"，进不去），上线时改成 `'playable'`。
有电脑人物的，把名字补进 `worker/api/validate.ts` 的 `RESERVED_PERSONAS`（按游戏 id 分组；没有电脑也要写一组空的，测试会查）。

## 第三方数据

- `worker/api/weak-passwords.ts`：常见弱密码表，取自 SecLists（MIT 许可，Copyright (c) 2018 Daniel Miessler）。
