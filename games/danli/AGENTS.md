# danli 模块约定（《弹里个弹》）

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和 `DESIGN.md` 为准）。设计正本是 [DESIGN.md](DESIGN.md)，由策划维护；实现里拿不准的地方提出来，不自己改设计。

- 模块 id `danli`，Worker 名 `danli`，路径 `/games/danli/`，开发端口 5179、预览 4179；冒烟、截图、性能脚本用系统分配的临时端口（端口写 0）。
- 只改 `games/danli/`；不读、不引用其他游戏的源码。共用的东西只走 `arcade-kit`（npm 上的 `@yyyu-star/arcade-kit`，按别名装）和平台的公开 `/api`。
- 规则核心 `src/core/`（含地图数据 `maps.ts`）和电脑 `src/ai/` 是纯函数：不碰 DOM、网络、存储；
  不用 `Math.random`、`Date`、`performance.now`、三角函数、开方、`**` 这类结果依赖平台的东西（角度用 `core/fixed.ts` 的整数表，开方用 `isqrt`）；
  炮弹用定点整数（1/1024 单位）、固定步长；道具的倍率用万分比整数；随机只用 `arcade-kit/rng`（ChaCha20）按用途分流：`open` 开局（出生点洗牌、谁先手）、`wind` 每回合的风（序号是回合数）、`ai` 电脑出手的误差（序号是回合数）。
  准备房间里"随机"地图在页面里抽（不进规则核心），抽到的写进开局设置。
  `test/arch.test.ts` 检查这些。
- 画面（`src/view/`）只读状态和事件：事件按顺序放成动画，地形在画面里另存一份，放到"爆炸"那一刻才挖；不自己算规则。
- 浏览器存储的键一律 `danli.` 前缀（DESIGN.md 第 8 节）：`danli.solo`（单机存档第 2 版：种子 + 整局的开局设置 + 操作序列，读档时重放；版本对不上的直接丢掉）、
  `danli.prefs`（静音和准备房间上次的选择，`src/room.ts` 逐项检查着读，坏了的那一项用默认）。
- 电脑人物在 `src/ai/personas.ts`（0.2.0 是橘子、团团、企企、柴柴、兔兔、鼠鼠）：加、改名字时在 PR 说明里写上，由平台另开 PR 登记进保留昵称。
- 改了数值（`core/weapons.ts`、`core/items.ts`、`core/rules.ts` 的常量、`core/physics.ts` 的重力风力、`core/maps.ts` 的地形和出生点）或电脑，跑模拟器（`scripts/sim.ts`）把结果写进 README 的"数值"一节：
  `npm run sim 100 ab`（1v1，加道具用和不用的对比）、`npm run sim 100 2v2`、`npm run sim 100 3v3`、`npm run sim 16 weapons`（8 把武器两两对打）、
  `npm run sim 50 1v1 map:all`（6 张图各打一遍）、`npm run sim 100 3v3 room`（房间的默认阵容）。
- `wrangler.jsonc` 是独立配置：不写平台绑定和 `GATE`（本站部署时由部署工具补），只用部署配置检查允许的字段（docs/new-game.md 第 4 节）；`observability` 开着。
- 监控（docs/platform-backend.md 第 16 节）：`worker/route.ts` 最前面接 `/games/danli/health`（不登录、不读存储，版本号从 `package.json` 导入），`test/worker-health.test.ts` 检查；页面入口调一次 `reportErrors`。
- 改了界面：跑 `npm run smoke`（手机横竖屏各走一遍"首页 → 准备房间 → 冰淇淋雪山、3v3、换武器和小动物 → 开打 → 把自己炸出局 → 跳到结果 → 结算 → 回房间"），
  `npm run shots` 截验收图（`shots/v020-*.png`：首页、房间四张（武器、地图、地图往下滑的"快图""慢图"、换人物）、6 张图各一张开局、出局、结算，已被 gitignore），自己看一遍。
- 美术代理交付的画法（地图数据、地形、远景、角色、武器图标、标题字、页面设计稿）改写成 TS 放在模块里（`core/mapData.ts`、`view/mapArt.ts`、`view/terrainPaint.ts`、
  `view/backdrops.ts`、`view/charArt.ts`、`view/weaponArt.ts`、`view/title.ts`、`view/pages.css`），不引用仓库外的文件；改画法前先问策划要不要交给美术。
- 音效在 `src/view/sound.ts`，全部 WebAudio 现场合成，不放音频文件；加声音时守住"同一时刻最多 6 个、每种有最短间隔"。
- 临时脚本放 `scripts/_*.ts`，用完删掉。
- 提交信息以 `danli:` 开头，分支 `danli/<说明>`；只暂存明确路径。
