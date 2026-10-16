# 飞驰（racing）

回合制卡牌赛车：换挡出牌、热量、过弯限速、打滑、冲刺、尾流。玩法照《Heat: Pedal to the Metal》（Days of Wonder）基础赛的核心规则，
名字、术语、赛道、卡面、美术全部自己设计。单机对电脑（全在浏览器里跑）和好友房（基于 `arcade-kit`，2–6 辆车，空位电脑补）。娱乐模式，不碰钱包。

- 路径：`/games/racing/`（Worker 名 `racing`），开发端口 5177，预览 4177
- 设计见 [DESIGN.md](DESIGN.md)，模块约定见 [AGENTS.md](AGENTS.md)，当前版本见 `package.json` 的 `version`，各版改了什么见 [CHANGELOG.md](CHANGELOG.md)。选桌页右下角显示版本号。

## 功能

- **规则**：换挡出牌（跳两挡付热量）、速度牌 / 改装牌 / 热量 / 手抖、熄火、散热、冲刺、拼劲、尾流、过弯限速（超速付热量，付不起打滑）、冲线名次（DESIGN.md 第 2 节）。
- **三条固定赛道**：环湖（均衡）、山城（发夹弯多）、海港（急弯加长直道），1–3 圈。随机赛道是下一阶段（DESIGN.md 3.3）。
- **单机**：对 1–5 台电脑，6 种性格，可以挑新手 / 普通 / 老手 / 混着来；跑到一半关了页面，回来接着跑（`racing.solo`）。
- **出牌预览**：选好挡和牌，赛道上画一辆虚影车：停在哪、过哪几个弯、要付几张热量、会不会打滑（手抖按点数范围算）。
- **预设**：冲刺、尾流、拼劲、弃牌可以出牌时定好，轮到时不用再点。
- **好友房**：开房给六位房间码或邀请链接，空位电脑补；服务端说了算，不下发别人的手牌和牌堆；掉线托管、中途接管电脑、跑完"再来一场"；短语、表情包、道具，可以屏蔽。
- **登录闸门**：首页要先在平台登录（`GATE=login`），平台有问题时回本游戏自己的 503 页。
- **赛道镜头**：拖动平移、双指或滚轮缩放，一键"跟车"或看全图。

### 地址参数
| 参数 | 做什么 |
|---|---|
| `?room=123456` | 邀请链接：直接进这个房间 |
| `?online=1` | 平台大厅卡片上的"好友房"按钮：开房、进房摆在最前面 |

### 手机和平板
按仓库 AGENTS.md 第 4 节：高度按 `visualViewport` 算（`--app-h`，CSS 先 `100vh` 再 `100dvh`），转屏后补算一次；双指放大时不重排；
四边用 `env(safe-area-inset-*, 0px)` 让出刘海；横屏、竖屏各有一套布局。赛道和牌是 DOM + SVG，没有画布和 WebGL，"画布倍数封顶 2""WebGL 上下文丢失"不适用。

### 素材
全部由本模块的代码生成，没有图片、音频、字体文件，没有第三方素材，见 [ASSETS.md](ASSETS.md)。

## 本地开发
```bash
npm ci
npm run dev           # 页面（vite，5177），单机直接能玩；平台接口转给 5181；设 RACING_WORKER=<本地 Worker 端口> 把开房、进房转给 Worker
npm test              # 类型检查 + vitest（规则、赛道、电脑、架构约束、房间规则）+ workerd 里的 Worker 和好友房测试
npm run test:worker   # 只跑 workerd 里的那部分（test/worker/，配置 test/wrangler.test.jsonc，平台的 /api/me 用假的服务绑定）
npm run build:cf      # 页面打包到 dist-cf/games/racing/（Worker 的静态资源）
npm run smoke         # 冒烟：起 vite、无头 Chromium 横屏竖屏各跑完一场单机，控制台零报错
npm run sim 200       # 模拟器：电脑对跑，量回合数、打滑、各性格名次（DESIGN.md 5.3）
node scripts/track.ts --png   # 赛道自查：按形状找弯、和弯道线对一对，截图到 shots/
node scripts/shots.ts         # PR 用的截图（电脑 1280×720、手机横屏）到 shots/pr-*.png
node scripts/tune.ts 40       # 调电脑参数（网格搜索，开发用）
```

依赖仓库里的共用包 `packages/arcade-kit`（`file:` 依赖，只经它的包入口用）。脚本直接用 Node 跑 TypeScript（Node 22 的类型剥离）。
截图和冒烟用的无头浏览器：先看环境变量 `CHROME`，没有就在 playwright 的缓存目录里找装了的 chrome-headless-shell（`scripts/browser.ts`）。

## 部署

飞驰是一个 Cloudflare Worker（名字 `racing`），挂在平台同一个域名的 `/games/racing` 路径下，依赖平台和共用包 `packages/arcade-kit`（`file:` 依赖），所以没有一键部署按钮，
按仓库根 README 的部署一节用 GitHub Actions 部署：**先部署平台**（Worker 名 `arcade`，服务绑定指向它），再跑本模块的流程。

本仓库的正式站由 `.github/workflows/game-racing.yml` 部署：改动经 PR 合并进 `main` 且涉及 `games/racing/**` 或 `packages/arcade-kit/**` 时，先跑模块独立性检查，再 `npm ci`、`npm test`、`build:cf`，
然后 `wrangler deploy` 并注入路由 `<站点>/games/racing`、`<站点>/games/racing/*` 和变量 `SITE_ORIGIN=https://<站点>`（站点的主机名在 GitHub `production` 环境的 secret `SITE_HOST` 里，没设就失败）；
PR 上只测试不部署。路由不写在 `wrangler.jsonc` 里；`workers_dev` 关着，没有路由时外面访问不到。在本仓库里不对正式环境手动部署。

本模块要的绑定、变量和 secret：

| 名字 | 类型 | 说明 |
|---|---|---|
| `ASSETS` | 静态资源 | `dist-cf/`，由 `npm run build:cf` 生成 |
| `ROOM` | Durable Object `RacingRoom` | 好友房 |
| `METER` | Durable Object `RoomMeter` | kit 的每日额度计量 |
| `ARCADE` | 服务绑定 → `arcade` | 登录闸门和认人，问平台 `/api/me` |
| `GATE` | 变量 | `login`（没登录跳平台登录页）或 `off`（不拦，本地试页面用） |
| `KIT_QUOTA` | 变量 | 每天的写入预算和每人开房数（DESIGN.md 6.1） |
| `SITE_ORIGIN` | 变量（可选，部署时注入） | 开房、进房只认这个 Origin；没设就认请求自己的 origin |
| `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SITE_HOST` | GitHub `production` 环境的 secret | 部署流程用，不进 Worker |

需要拆成单独仓库时，在仓库根运行 `tools/split-module.sh games/racing`。

## 目录结构
| 路径 | 内容 |
|---|---|
| `src/core/` | 规则（纯函数）：`rules.ts` 一回合的流程、`cards.ts` 牌、`view.ts` 每个座位看到的、`types.ts` |
| `src/track/` | 赛道：`fixed.ts` 规则用的数据、`index.ts` 按 id 找、`shape.ts` 画法（只给画面层） |
| `src/ai/` | 电脑（只拿视图）：`index.ts` 决定、`personas.ts` 6 种性格 |
| `src/room/` | 好友房的规则：把规则接到 kit 的 `RoomGame` 上（纯函数，房间和页面共用） |
| `src/game/` | 交流编号（短语、表情、道具） |
| `src/solo.ts`、`src/online.ts`、`src/main.ts` | 单机控制器、好友房连接、页面入口 |
| `src/view/` | 画面（DOM + SVG）：`board.ts` 赛道和车、`dash.ts` 驾驶台、`side.ts` 名次栏、`cards.ts` 卡面、`lobby.ts` 选桌页、`room.ts` 等人页、`comms.ts` 交流，其余见目录 |
| `worker/` | racing Worker：`main.ts` 路由和登录闸门、`room.ts` 好友房 DO |
| `test/` | vitest；`test/worker/` 跑在 workerd 里 |
| `scripts/` | `sim.ts` 模拟器、`smoke.ts` 冒烟、`track.ts` 赛道自查、`shots.ts` 截图、`tune.ts` 调电脑、`browser.ts` 无头浏览器 |

## 许可证

MIT，见仓库根的 [LICENSE](../../LICENSE)。
