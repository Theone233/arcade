# 掼蛋（guandan）

arcade 总仓库里的独立游戏模块：两副牌、四人、对家一队，从打 2 升到过 A。单机：玩家 + 3 个电脑，全在浏览器里跑；0.2 起有好友房：四人联机，房间在 Durable Object 里，服务端说了算；0.3 起正式放开，每天的联机额度由 arcade-kit 的计量管着。
线上位置：`game.yyyu.org/games/guandan/`，Worker 名 `guandan`。

## 现状（0.6）

- 规则核心 `src/core/`：牌型识别（含逢人配的所有解释）、比大小、出法枚举、进贡/抗贡/还贡、接风、名次升级、打 A，纯函数、可序列化、可回放。
- 电脑对手 `src/ai/`：三档难度，只读玩家视角。
- 画面层 `src/view/`：Phaser 4 牌桌、标题页、规则、设置、战绩、新手引导、动画与 WebAudio 合成音效；每副结算页有复盘和称号。
- 联机 `src/net/` + `worker/room.ts`：基于 `packages/arcade-kit`；开房、叫朋友（链接进房自动坐下、开打后接管电脑座位）、掉线重连、30 秒超时代出、
  走开了自动托管（0.6.3）、掉线 60 秒电脑托管、打完"再来一场"（0.6.2）；好友房的嘲讽、表情包、扔道具（0.6.0，见 AGENTS.md 第 3 节）。
- 实盘 `src/stake/` + `src/net/stake.ts` + `worker/stake.ts`：筹码走平台钱包，单机（0.4）和好友房（0.5）都有，设计在 `docs/stake.md`。
- 美术 `src/view/art/`：全部程序生成的原创 SVG（牌面、牌背、头像、图标、桌布、标题图），启动时烘焙成纹理。

## 好友房里会碰到的限制（0.6.0 盘点）

所有者定的方向："联机体验要正好，不要设乱七八糟的限制"。没必要的已经去掉，留下的都是为了不超账单、筹码算得对或者牌局能往下走，页面上都有一句大白话：

| 限制 | 为什么留着 | 用户看到的 / 怎么办 |
|---|---|---|
| 每人同时开 5 个房间、每天开 100 个 | 防一个号刷房间吃光全站额度（0.6.0 从 1 / 6 放宽） | "你同时开着的房间太多了，先离开几个再开"；"开房间"永远开新的，不再把人送回旧房间 |
| 全站每天 300 个房间、写入到 5 万停开新房、6 万收场 | Cloudflare 免费额度是全账户共用的 | "今天联机的人太多了，明天再来，单机照常玩" |
| 每手 30 秒、结算页 20 秒 | 一个人走神不能卡住另外三个人 | 头像上倒计时，最后 5 秒嘀嗒；到点按"能不出就不出"代出 |
| 连着两手到点被代出，就算走开了：轮到他只等 3 秒（0.6.3） | 人在但走开了，别的三个人不用每手干等 30 秒 | 头像下写"托管中"；他自己出一手、或者点"我回来了"马上恢复 30 秒；掉线重连、刷新页面回来的自动恢复（0.6.4） |
| 掉线 60 秒后电脑接着打 | 同上 | 回来自动回到自己的座位接着打 |
| 别人坐过的座位只能他本人回来坐 | 实盘的结回要记到那个人的钱包上 | "座位被占：这是别人的座位，电脑在替他打"；没人坐过的电脑座位谁都能接管（点开链接会自动接管） |
| 实盘房间至少两个真人 | 防一个人带三个电脑绕开单机的每日上限 | "实盘好友房至少要两个人；一个人想玩实盘，去单机" |
| 嘲讽、表情、道具每人每秒 1 个（能攒 3 个） | 不刷屏、房间账单 | 不提示，发得快的自动排队 |
| 打完一整场，"再来一场"等 3 分钟（0.6.2，娱乐房间） | 没人点的房间要关掉、还开房名额 | 结束页上点"再来一场"，这一桌自动换到新房间，队友、上下家和上一场一样；过了 3 分钟再点，自己先去新房间，再叫朋友 |
| 必须登录 | 测试期邀请制 | 点开房间链接没登录的，先去登录，登录完直接回到这个房间 |

去掉的：同时只能开 1 个房间（"你已经有一个房间了，先回去"）、每天只能开 6 个；离开实盘房间要等整场打完才结回（现在点"离开"马上按当时的分结回）；
房间里没真人了电脑还一直打到房间超时（现在真人都走了房间马上结束、还名额）；点开邀请链接还要再点"坐这里"（现在自动坐第一个空位，开打了自动接管电脑座位；实盘房间坐下要带入，仍由自己点）；
打完一整场要回首页重新开房、重新发链接（0.6.2 起结束页点"再来一场"，大家一起过去；实盘房间打完照旧结回，再开要自己开）。

## 开发

```bash
npm ci
npm test              # vitest：牌型、比大小、流程、进贡、打 A、回放、防泄漏、电脑、架构约束
npm run typecheck     # 全量 tsc；npm run typecheck:core 只查规则核心和电脑（不带 DOM 库）
npm run sim           # 机器人对打 5000 副：电脑 vs 随机；更多模式见 tools/sim.ts 顶部
npm run dev           # 0.0.0.0:5174（预览 npm run build && npm run preview → 4174）
npm run shot          # 无头冒烟 + 截图到 shots/（--playtest 真实速度鼠标试玩一副，--only desktop,mobile,viewport,… 只跑部分）
node tools/mem.ts     # 内存估算（模拟 iPhone 8 / 8 Plus 横屏，各渲染倍数的纹理和画布占用）
npm run test:room     # 联机房间测试（workerd 里的真 Durable Object）；npm run room-sim 规则层批量对打
npm run online-smoke  # 本地联机栈 + 四个无头浏览器打一整副、断线重连、同号顶替（--quick 跳过 70 秒那项）
npm run quota-smoke   # 额度调得极紧的本地联机栈：同时开着的房间太多、今天开房次数用完、今天人太多、不进新人、额度满了收场，五种提示
npm run stake-smoke   # 实盘：本地栈（真 Worker + 假钱包）上单机的选档、退回、接着打、结算、到顶、再来一场、现在结算、被拒，加好友房实盘打完一场（--no-room 跳过）
npm run art           # 美术预览图 → shots/art/；npm run cover 重新生成 public/cover.png
npm run build:cf      # 部署产物 dist-cf/games/guandan/（线上 Worker：worker/，登录闸门 GATE=off|login、好友房开关 ONLINE=on|off，见 AGENTS.md）；npm run deploy = build:cf + wrangler deploy（拆成独立仓库后才用，总仓库里只经 PR 合并后由 CI 部署）
```

调试用 URL 参数：`?seed=abc`（直接开局）、`&jump=tribute`（第二副进贡）、`&jump=ace`（打 A）、`&debug=1`（挂 `window.__game`）、
`&autoplay=1`（电脑代打我）、`&online=1`（打开就弹出好友房面板）、`&room=123456`（直接进房）、`&anim=0`、`&speed=2`、`&difficulty=hard`。URL 开的局在已有存档时不写存档、不计战绩。

## 素材

全部图片素材由 `src/view/art/` 的代码生成（SVG），没有外部图片或音频文件；音效和背景音由 `src/view/audio.ts` 用 WebAudio 实时合成。
好友房的表情包和互动道具（0.6.0）来自共用包 `arcade-kit/fun`：同样是手写 SVG 和 WebAudio 合成，来源见 `packages/arcade-kit/README.md`。

唯一的外部素材是标题字体 `src/view/fonts/`：思源宋体 Noto Serif SC Bold（[notofonts/noto-cjk](https://github.com/notofonts/noto-cjk)，
SIL Open Font License 1.1，可商用；版权声明和许可原文在 `src/view/fonts/OFL.txt`，版权行取自字体 name 表和上游 adobe-fonts/source-han-serif 的 LICENSE）的两个子集——`gd-title.woff2`（画布上的大字、横幅、弹窗标题，
字表 `title-chars.txt`）和 `gd-serif-svg.woff2`（SVG 美术里的 logo、牌背、印章，字表 `svg-chars.txt`，内嵌进 SVG）。
加了新的标题文字、`tests/view.test.ts` 报缺字时，把字补进字表后重新生成（fonttools，不是项目依赖）：

```sh
pip install fonttools brotli
pyftsubset NotoSerifSC-Bold.otf --text-file=src/view/fonts/title-chars.txt --flavor=woff2 --output-file=src/view/fonts/gd-title.woff2
pyftsubset NotoSerifSC-Bold.otf --text-file=src/view/fonts/svg-chars.txt --flavor=woff2 --output-file=src/view/fonts/gd-serif-svg.woff2
```
`public/cover.png`（平台首页封面）由 `tools/cover.ts` 从同一套 SVG 渲染。

文档：`docs/design.md` 设计、`docs/rules.md` 规则核实与取舍、`docs/core-api.md` 给画面层的接口说明、`docs/stake.md` 实盘设计（筹码体系第 3 步；0.4.0 单机实盘、0.5.0 好友房实盘；数字由 `node tools/stake-sim.ts` 量出）。
