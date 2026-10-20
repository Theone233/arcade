# danli 模块约定（《弹里个弹》）

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和 `DESIGN.md` 为准）。设计正本是 [DESIGN.md](DESIGN.md)，由策划维护；实现里拿不准的地方提出来，不自己改设计。

- 模块 id `danli`，Worker 名 `danli`，路径 `/games/danli/`，开发端口 5179、预览 4179；冒烟、截图、性能脚本用系统分配的临时端口（端口写 0）。
- 只改 `games/danli/`；不读、不引用其他游戏的源码。共用的东西只走 `arcade-kit`（npm 上的 `@yyyu-star/arcade-kit`，按别名装）和平台的公开 `/api`。
- 规则核心 `src/core/`（含地图数据 `maps.ts`）和电脑 `src/ai/` 是纯函数：不碰 DOM、网络、存储；
  不用 `Math.random`、`Date`、`performance.now`、三角函数、开方、`**` 这类结果依赖平台的东西（角度用 `core/fixed.ts` 的整数表，开方用 `isqrt`）；
  炮弹用定点整数（1/1024 单位）、固定步长；道具的倍率用万分比整数；随机只用 `arcade-kit/rng`（ChaCha20）按用途分流：`open` 开局（出生点、谁先手）、`wind` 每回合的风（序号是回合数）、`ai` 电脑出手的误差（序号是回合数）。
  `test/arch.test.ts` 检查这些。
- 画面（`src/view/`）只读状态和事件：事件按顺序放成动画，地形在画面里另存一份，放到"爆炸"那一刻才挖；不自己算规则。
- 浏览器存储的键一律 `danli.` 前缀（DESIGN.md 第 8 节）：现在只有 `danli.solo`（单机存档：种子 + 开局设置 + 操作序列，读档时重放）。
- 改了数值（`core/weapons.ts`、`core/items.ts`、`core/rules.ts` 的常量、`core/physics.ts` 的重力风力、`core/maps.ts` 的地形）或电脑，跑 `npm run sim 100 ab`（电脑对电脑，加道具用和不用的对比），把结果写进 README 的"数值"一节。
- `wrangler.jsonc` 是独立配置：不写平台绑定和 `GATE`（本站部署时由部署工具补），只用部署配置检查允许的字段（docs/new-game.md 第 4 节）。
- 改了界面：跑 `npm run smoke`（手机横竖屏打完一局），`npm run shots` 截验收图（`shots/v010-*.png`，已被 gitignore），自己看一遍。
- 临时脚本放 `scripts/_*.ts`，用完删掉。
- 提交信息以 `danli:` 开头，分支 `danli/<说明>`；只暂存明确路径。
