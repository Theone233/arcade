# 素材说明

本模块没有外部素材，全部由程序生成：

| 素材 | 来源 |
|---|---|
| 麻将牌面（万、筒、条） | `src/view/tiles.ts` 运行时画的 SVG：万字用系统字体写汉字，筒画圆圈，条画竹节，一条画一只简笔小鸟 |
| 牌背、牌桌、头像 | CSS 渐变和 SVG，头像按名字算颜色和图形 |
| 封面 `public/cover.svg` | 手写的 SVG |
| 音效 | WebAudio 现合成（`src/view/sound.ts`） |
| 表情包、扔的道具 | `arcade-kit/fun`（kit 自己程序画的，见 kit 的说明） |
