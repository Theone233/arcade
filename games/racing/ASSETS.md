# 素材说明

本模块没有外部素材，全部由程序生成：

| 素材 | 来源 |
|---|---|
| 卡面（速度牌、改装牌、热量、手抖） | `src/view/cards.ts` 运行时画的 SVG：数字用系统字体，条纹、散热片、火苗、波纹都是手写的路径 |
| 赛道、车、场景 | `src/view/board.ts`、`src/track/shape.ts`：控制点连成样条，路面、路肩、格线、限速牌、湖、楼、码头都是 SVG 基本图形 |
| 封面 `public/cover.svg` | 手写的 SVG |
| 音效 | WebAudio 现合成（`src/view/sound.ts`） |
| 表情包、扔的道具 | `arcade-kit/fun`（kit 自己程序画的，见 kit 的说明） |

赛道、名字、术语、卡面、规则文字都是原创的。
