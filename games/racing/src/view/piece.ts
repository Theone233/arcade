/**
 * 棋子（DESIGN.md 第 8 节）：塑料小车，车身按座位配色、一块高光，车顶一个白圆牌写着座位号（红绿分不清的玩家看号码），车下一片投影。
 * 车头朝 +x，长 33、宽 18。高光和投影用的渐变、滤镜在 mapart.ts 的 MAP_DEFS 里。
 */
import { C } from './mapkit.ts';
import { CAR_COLORS } from './text.ts';

const BODY = 'M-15 -7Q-16 -9 -12 -9H8Q17 -7 18 0Q17 7 8 9H-12Q-16 9 -15 7Z';

/** 车身；号码单独一个 .num，车转弯时要转回正向（board.ts） */
export function pieceMarkup(seat: number): string {
  const c = CAR_COLORS[seat % CAR_COLORS.length]!;
  return `<path d="${BODY}" fill="#000" opacity=".45" filter="url(#rb-soft2)" transform="translate(3 4)"/>
<path d="${BODY}" fill="${c.body}" stroke="${c.dark}" stroke-width="1"/><path d="${BODY}" fill="url(#rb-plast)"/>
<circle cx="-2" cy="0" r="6" fill="#fff" stroke="${c.dark}" stroke-width="1"/>
<text class="num" x="-2" y="3.4" font-size="9" font-weight="900" text-anchor="middle" fill="${c.dark}">${seat + 1}</text>`;
}

/** 名次栏、结算里的小图标（车头朝右，不转） */
export function pieceIcon(seat: number): string {
  return `<svg viewBox="-18 -11 38 22" aria-hidden="true">${pieceMarkup(seat)}</svg>`;
}

/** 我的车外面一圈金色 */
export const ME_RING = `<ellipse class="ring" cx="1" cy="0" rx="24" ry="15" fill="none" stroke="${C.gold}" stroke-width="3.2"/><ellipse class="ring" cx="1" cy="0" rx="24" ry="15" fill="none" stroke="${C.ink}" stroke-width="1" opacity=".6"/>`;
