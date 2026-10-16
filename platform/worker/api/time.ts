/**
 * 北京时间（UTC+8，没有夏令时）。每日榜的日期、钱包的"今天"、周榜的"这周"、好友"几天前来过"都按它算，
 * 放在一处免得各写一份、写法不一。
 */
import { DAY, HOUR } from './context';

const SHIFT = 8 * HOUR;

/** 北京时间的日期 YYYY-MM-DD */
export function beijingDate(ms: number): string {
  return new Date(ms + SHIFT).toISOString().slice(0, 10);
}

/** 北京时间的第几天（从 1970-01-01 数起）：只拿来比两天差几天 */
export function beijingDayNumber(ms: number): number {
  return Math.floor((ms + SHIFT) / DAY);
}

/** 北京时间这周一的日期（周一 0 点换周） */
export function beijingWeek(ms: number): string {
  const day = beijingDayNumber(ms);
  // 1970-01-01 是周四：往回数到周一
  const monday = day - ((day + 3) % 7);
  return new Date(monday * DAY).toISOString().slice(0, 10);
}

/** 北京时间某天 0 点的时间戳 */
export function beijingDayStart(day: string): number {
  return Date.parse(`${day}T00:00:00+08:00`);
}

/** 下一个北京时间 0 点 */
export function nextBeijingMidnight(now: number): number {
  return now + SHIFT - ((now + SHIFT) % DAY) + DAY - SHIFT;
}
