/**
 * 固定赛道（DESIGN.md 3.2），全部自己设计，地名是虚构的。
 * 弯道线的位置和画法（shape.ts 的控制点）是一起定的：scripts/track.ts 按控制点算出每一格的弯曲程度，弯道线放在每个弯的入口。
 * 限速、热量、手抖张数用模拟器（npm run sim）调，结果写在 DESIGN.md 5.3。
 */
import type { Track } from './types.ts';

export const FIXED: readonly Track[] = [
  {
    id: 'lakeside',
    name: '环湖',
    blurb: '长直道接中速弯，热量不紧',
    spaces: 60,
    laps: 2,
    corners: [
      { at: 9, limit: 5 },
      { at: 19, limit: 6 },
      { at: 30, limit: 3 },
      { at: 36, limit: 4 },
      { at: 49, limit: 6 },
    ],
    heat: 6,
    stress: 3,
  },
  {
    id: 'hillcity',
    name: '山城',
    blurb: '连续低速弯和发夹弯，考验降挡和散热',
    spaces: 56,
    laps: 2,
    corners: [
      { at: 5, limit: 3 },
      { at: 11, limit: 2 },
      { at: 19, limit: 4 },
      { at: 33, limit: 4 },
      { at: 38, limit: 3 },
      { at: 43, limit: 3 },
    ],
    heat: 6,
    stress: 4,
  },
  {
    id: 'harbor',
    name: '海港',
    blurb: '两条超长直道各接一个急弯，冲刺和尾流的大场面',
    spaces: 64,
    laps: 2,
    corners: [
      { at: 8, limit: 3 },
      { at: 19, limit: 2 },
      { at: 28, limit: 3 },
      { at: 46, limit: 6 },
      { at: 54, limit: 5 },
    ],
    heat: 5,
    stress: 3,
  },
];
