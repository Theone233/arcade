# 德州扑克（texas）

无限注德州扑克，一桌 2–6 人：单机对电脑（全在浏览器里跑）和好友房（基于 `arcade-kit`，空位电脑补）。
筹码跨场保留，存在平台的钱包里（开盘、掼蛋、德州共用一个余额，`docs/economy.md`），先选娱乐（不碰钱包）或实盘；筹码只是游戏积分，**无任何现金价值**：不能买、不能换钱换物、不能转给别人，输光了靠每日补给。

- 线上路径：`/games/texas/`（Worker 名 `texas`），开发端口 5175，预览 4175
- 设计见 [DESIGN.md](DESIGN.md)，模块约定见 [AGENTS.md](AGENTS.md)
- 现状：当前版本见 `package.json` 的 `version`，各版改了什么见 [CHANGELOG.md](CHANGELOG.md)；单机、好友房、平台钱包都已上线（`wrangler.jsonc`，部署见仓库根 `.github/workflows/game-texas.yml`）。标题页左边牌扇下面显示版本号。

## 地址参数

| 参数 | 做什么 |
|---|---|
| `?room=123456` | 邀请链接：直接进这个房间（档位、人数由房间告诉他） |
| `?online=1` | 平台大厅卡片上的"好友房"按钮（和掼蛋同一个约定）：打开标题页、好友房那一行（开房间 / 输码进房间）滚到看得见并亮一下，有鼠标的光标直接在房间码里 |

两个参数读完都用 `history.replaceState` 去掉，刷新不会再触发。刷新前在好友房里的（6 小时内），标题页会给一条"回到房间"横幅，点了才进，不自动拉回去。

## 开发

```bash
npm ci
npm run dev           # 页面（vite，5175）；钱包连不上时娱乐照常，设 TEXAS_WORKER=<本机 Worker 端口> 把 api/、/api/wallet* 转给 Worker
npm run build:cf      # 页面打包到 dist-cf/games/texas/（Worker 的静态资源）
npm run smoke         # 冒烟：先 build:cf；本机起 Worker + 无头 Chromium 打满 30 手（一手打完不点"下一手"不发、自动下一手）、补码、离桌结算页、回大厅、手机横屏、双指放大、竖屏、好友房（两手之间的停顿、换设备开房 409）
node scripts/capture.ts [--device desk|phone|both] [--every 250] [--secs 40] [--auto] [--out 目录]
                      # 连拍：本机起页面、娱乐桌自动打，每隔固定毫秒截一张，拼成带时间的 4×4 大图，逐帧看节奏（不进 CI）
npm test              # 类型检查 + vitest（含全量 1.34 亿手的牌力测试、机器人对打 1 万手，约 10 秒）+ workerd 里的 Worker 和好友房测试
npm run test:worker   # 只跑 workerd 里的那部分（test/worker/，配置 test/wrangler.test.jsonc，平台和平台钱包用假的服务绑定，钱包是 arcade-kit/testing）
npm run sim [手数] [档位] [--size=2–9] [--mix-only]  # 性格混桌对打（10 种里挑），打印每种性格每百手的输赢和各热点的耗时
npm run gen:preflop   # 重新生成翻牌前胜率表 src/ai/preflop-table.ts（约 25 秒，固定种子）
```

依赖仓库里的共用包 `packages/arcade-kit`（`file:` 依赖，只经它的包入口用：`arcade-kit/rng`、`/room`、`/client`、`/auth` 等）。脚本直接用 Node 跑 TypeScript（Node 22 的类型剥离）。

## 目录

| 路径 | 内容 |
|---|---|
| `src/core/` | 规则（纯函数）：`table.ts` 一桌的规则、`eval.ts` 牌力评估、`view.ts` 每个座位看到的、`stakes.ts` 四档桌子、`cards.ts` |
| `src/ai/` | 电脑：`decide.ts` 决定、`equity.ts` 蒙特卡洛、`preflop.ts` 翻牌前查表、`personas.ts` 10 种性格 |
| `src/bot.ts` | 把状态换成视图、分好随机流再交给电脑（单机页面、房间、测试共用） |
| `src/solo.ts` | 单机的一桌：实盘先从钱包带一份再上桌、电脑按节奏出手、补码、离桌结回；每一步存本机（`texas.session`） |
| `src/online.ts` | 好友房的一局：连房间（kit 的 `RoomClient`）、按顺序播房间发来的帧、发操作；开房（`texas.room` 记着现在在的房间，标题页给"回到房间"，不自动进） |
| `src/main.ts` | 页面入口：大厅、等人页和牌桌，单机和好友房共用一套牌桌，接钱包、云存档、声音 |
| `src/view/` | 画面（DOM + CSS，不用画布），主要的几个：`table.ts` 牌桌和动画、`actions.ts` 操作区、`lobby.ts` 标题页兼选桌、`room.ts` 好友房的等人页、`art.ts` 牌面头像筹码、`viewport.ts` 看得见的区域、`sound.ts` 合成音效；其余见目录 |
| `src/net/` | `wallet.ts` 钱包（看钱包、领补给走平台的 `/api/wallet*`，单机带入结回走德州 Worker）、`cloud.ts` 云存档（战绩槽 `stats`，按平台的推荐做法） |
| `src/room/` | 好友房的规则：把牌桌接到 kit 的 `RoomGame` 上（纯函数，房间和页面共用） |
| `worker/` | texas Worker：`main.ts` 路由、登录闸门（`arcade-kit/auth` 经平台 `/api/me` 认人）和单机带入结回（转平台钱包，client 模式）、`platform.ts` 平台钱包 RPC 的类型、`room.ts` 好友房 DO（server 模式调平台钱包） |
| `test/` | vitest；`bots.ts` 是机器人对打的驱动（测试和 `scripts/sim.ts` 共用）；`test/worker/` 跑在 workerd 里；`arcade.dev.ts` 假平台（钱包用 `arcade-kit/testing`）、`dev-entry.ts` 本机入口（测试、冒烟、本机试用，不部署） |
| `scripts/` | `sim.ts` 模拟和实测（`npm run sim -- --vs [每格场数] [档位,...] [策略,...]`：每档 × 每种策略一个玩家对电脑，打印每百手大盲）、`vs.ts` 是它的多线程部分（`--vs` 和性格混桌）、`gen-preflop.ts` 生成胜率表、`smoke.ts` 冒烟、`capture.ts` 连拍看节奏 |

## 素材

全部由本模块的代码生成，没有图片、音频、字体文件，没有第三方素材：
- 四种花色是自己画的 SVG 路径（`src/view/art.ts`），牌面、牌背、筹码是 SVG 和 CSS 渐变；
- 6 个电脑和"我"的头像按性格用 SVG 拼出来（脸、发型、眼镜、帽子）；
- 绒布的细纹理是 SVG 的 `feTurbulence` 噪声；
- 音效用 WebAudio 现合成（`src/view/sound.ts`）；文字用系统字体。

## 手机和平板

按仓库 AGENTS.md 第 4 节：高度按 `visualViewport` 算（`--app-h`，CSS 先 `100vh` 再 `100dvh`），转屏后补算一次；双指放大时不重排；
四边用 `env(safe-area-inset-*, 0px)` 让出刘海；竖屏盖一层"横过来"。牌桌是 DOM + CSS，没有画布和 WebGL，
"画布倍数封顶 2""整屏背景 1 倍""WebGL 上下文丢失"这三条不适用（DESIGN.md 8.1）。冒烟里模拟了省内存设备（CPU 降速 4 倍）和双指放大。

## 本机试 Worker

正式配置 `wrangler.jsonc` 指着线上的路由和平台，不在本机跑。本机试用时在模块根放一份 `wrangler.local.jsonc`（已 gitignore：照 `wrangler.jsonc` 抄，
去掉路由，入口换成 `test/dev-entry.ts`，静态目录写 `./test/assets` 或 `./dist-cf`，`run_worker_first` 加 `/api/wallet`、`/api/wallet/*`，`SITE_ORIGIN` 写本机地址），
平台的 `/api/me` 和钱包用一个名叫 `arcade` 的假 Worker 代替（`test/arcade.dev.ts`，cookie `__Host-sid=<id>` 就认作这个人，钱包是 `arcade-kit/testing`），
入口写 `test/dev-entry.ts`（本机没有平台的路由，浏览器的 `/api/wallet*` 由它转给假平台），两份配置一起起：

```bash
TEXAS_WORKER=8775 npm run dev:worker   # Worker 的端口取 TEXAS_WORKER，不设就由系统分配（看输出的 Ready on），不占 5175 / 4175
TEXAS_WORKER=8775 npm run dev           # 页面在 5175，api/、/api/wallet* 转给上面的 Worker；SITE_ORIGIN 写页面的 http://localhost:5175
curl -b '__Host-sid=me' http://localhost:8775/api/wallet
```
