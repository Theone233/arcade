# 雀馆（games/mahjong）

一套麻将引擎 + 多个玩法。第一个玩法：**川麻·血战到底**（换三张、定缺、刮风下雨、一炮多响、查花猪查大叫）。
单机对三个电脑；好友房（kit 的联机房间，娱乐或实盘）。实盘的筹码来自平台钱包，无任何现金价值。

现在有（0.3.x）：六个性格的电脑（新手到老练，强弱拉开）；听牌提示（剩几张只按看得见的算）；点两下或往上拖出牌、飞牌；胡牌亮牌和番型；
好友房叫朋友（分享链接、房间号）、掉线托管、中途接管电脑、离座马上结回、打完"再来一场"；四川话短语、表情包、扔道具、催促炸弹、屏蔽；
手机横竖屏（iPhone SE 也过）。

- 设计正本：[DESIGN.md](DESIGN.md)；模块约定：[AGENTS.md](AGENTS.md)；素材：[ASSETS.md](ASSETS.md)
- 线上：<https://game.yyyu.org/games/mahjong/>（Worker `mahjong`，部署流程 `.github/workflows/game-mahjong.yml`）

## 开发

```bash
npm ci
npm run dev          # http://localhost:5176/games/mahjong/（娱乐局直接能玩；平台接口转给 5181）
npm test             # 类型检查 + vitest（规则、电脑、架构约束、房间规则）+ workerd 里的 Worker 和房间测试
npm run build        # 页面
npm run sim 2000     # 模拟器：电脑对打，量时长、输赢、各性格强弱（DESIGN.md 4.1）
node scripts/strength.ts 1200 0,2,3 5   # 一个性格对固定三家的强弱（轮换座位）
npm run smoke        # 无头浏览器冒烟：单机横竖屏各一场
npm run build:cf && npm run smoke:room  # 好友房两个浏览器（本机 wrangler dev + 假平台）
npm run build:cf && npm run dev:worker  # 本机整套（Worker + 页面 + 假平台），端口由系统分配，打开它打印的地址；登录用 __Host-sid cookie（见 test/arcade.dev.ts）
node scripts/capture.ts se-port 40      # 截图到 shots/，并报互相压住的元素（land|port|se-land|se-port）
```

## 目录

| 目录 | 是什么 |
|---|---|
| `src/core/tiles`、`hand`、`table`、`match` | 通用层：牌、向听和听牌、牌桌小件、筹码账 |
| `src/core/variants/<id>/` | 玩法（`sichuan-xuezhan`）；`variants/index.ts` 登记 |
| `src/ai/` | 电脑（只拿视图），`personas.ts` 性格 |
| `src/game/` | 档位和底分、单机推进、交流编号 |
| `src/room/` | 好友房的规则（kit 的 RoomGame：带入结回、座位换人、再来一场），房间和页面共用 |
| `src/net/` | 单机实盘的带入结回（经本模块 Worker 转平台钱包） |
| `src/main.ts`、`solo.ts`、`online.ts` | 页面入口、单机控制器、好友房连接 |
| `src/view/` | 牌桌（DOM + SVG），`view/variants/<id>/` 是玩法专属的界面（听牌提示、胡牌亮牌、结算） |
| `worker/` | 登录闸门、单机带入结回、开房进房、房间 DO（`room.ts`） |
