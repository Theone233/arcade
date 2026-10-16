# racing 模块约定（《飞驰》）

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和 `DESIGN.md` 为准）。设计正本是 [DESIGN.md](DESIGN.md)。

- 模块 id `racing`，Worker 名 `racing`，路径 `/games/racing/`，开发端口 5177、预览 4177；工具用系统分配的临时端口（端口写 0）。
- 只改 `games/racing/`；不读、不引用其他游戏的源码。共用的东西只走 `packages/arcade-kit` 和平台的公开 `/api`。
- 规则核心 `src/core/`、赛道数据 `src/track/`（`shape.ts` 除外）、电脑 `src/ai/`、房间规则 `src/room/` 是纯函数：不碰 DOM、网络；
  不用 `Math.random`、`Date.now`、`new Date`、三角函数和 `Math.exp/log/pow/sqrt` 这类结果依赖平台的数学函数；
  随机只用 `arcade-kit/rng`（ChaCha20）按"用途 + 序号"分流（`grid` 发车格、`deck` 每辆车每次洗牌、`persona` 挑电脑、`form` 每个座位这一场的状态）。`test/arch.test.ts` 检查这些。
- 规则只认一维赛道（一圈几格、弯道线在哪、限速）；画法在 `src/track/shape.ts`，只有画面层和 `scripts/track.ts` 用。
  改了赛道的形状，跑 `node scripts/track.ts --png` 看弯道线还在不在弯的入口，`test/track.test.ts` 也会查。
- 隐藏信息：视图只放这个座位能看到的；别人的手牌、任何人的牌堆顺序、密钥一律不下发；交计划时别人只看得到"选好了没有"。
- 改了电脑、赛道的限速或热量，跑 `npm run sim 200`，结果写进 DESIGN.md 5.3。
- 互动（DESIGN.md 6.2）：电脑说什么只看公开的事（`src/game/banter.ts`），规则和电脑开车不 import 交流的代码（`test/arch.test.ts`），不把真人的短语记进状态或存储。
- `wrangler.jsonc` 是独立配置：不写平台绑定和 `GATE`（本站部署时由部署工具补），只用部署配置检查允许的字段（docs/new-game.md 第 4 节）。
- 浏览器存储的键一律 `racing.` 前缀（DESIGN.md 第 9 节）。
- 提交信息以 `racing:` 开头，分支 `racing/<说明>`；只暂存明确路径。
