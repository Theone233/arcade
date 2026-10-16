# arcade：小游戏平台总仓库

平台主界面和所有小游戏都在这一个仓库里，每个都是可以单独部署、随时拆分的独立模块。线上地址：https://game.yyyu.org

| 模块 | 内容 | 线上 | 部署流程 |
|---|---|---|---|
| [platform/](platform/) | 平台主界面和 `/api`：账号（邀请制，管理员可开关注册）、云存档、好友、排行榜、钱包（筹码）、战绩；之后是联机房间登记 | `/` | `.github/workflows/platform.yml` |
| [games/kaipan/](games/kaipan/) | 《开盘》：散户炒股题材的肉鸽游戏 | `/games/kaipan/` | `.github/workflows/game-kaipan.yml` |
| [games/guandan/](games/guandan/) | 《掼蛋》：规则完整的竞赛掼蛋，单机对三个电脑，也能开好友房 | `/games/guandan/` | `.github/workflows/game-guandan.yml` |
| [games/texas/](games/texas/) | 《德州扑克》：无限注德州，2–9 人，单机对电脑和好友房，筹码来自平台钱包（无任何现金价值）；设计见 `DESIGN.md` | `/games/texas/` | `.github/workflows/game-texas.yml` |
| [games/mahjong/](games/mahjong/) | 《雀馆》麻将：一套引擎多种玩法，先做川麻·血战到底（单机对电脑和好友房），以后加日麻；设计见 `DESIGN.md` | `/games/mahjong/` | `.github/workflows/game-mahjong.yml` |
| [packages/arcade-kit/](packages/arcade-kit/) | 共用包：联机房间基类、开房进房入口、浏览器连接器、协议 | 不单独上线，随用它的游戏打包 | `.github/workflows/pkg-arcade-kit.yml`（只测试） |

- 规范（必读）：[AGENTS.md](AGENTS.md)。要点是每个模块自带全部依赖和配置、不引用模块外的文件、各自部署。
- 定位：[docs/project.md](docs/project.md)（项目总体定义：做什么、给谁、底线、路线图）。
- 设计：[docs/architecture.md](docs/architecture.md)（整体架构）、[docs/platform-backend.md](docs/platform-backend.md)（账号、联机、费用熔断）、[docs/economy.md](docs/economy.md)（筹码体系）。
- 开发：进入模块目录 `npm ci && npm run dev`；改动推功能分支、开 PR，合并进 `main` 后只部署有改动的模块。
- 合作：[CONTRIBUTING.md](CONTRIBUTING.md)（main 只接受 PR 合并，合并前 CI 全绿并完整审阅）。克隆后先 `git config core.hooksPath tools/git-hooks`。
- 检查：`node tools/check-isolation.mjs`；拆分：`tools/split-module.sh games/<id>`。
