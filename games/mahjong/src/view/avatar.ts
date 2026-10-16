/** 头像：按名字算颜色和花纹的 SVG（素材全程序生成，ASSETS.md），真人和电脑一眼分得清（电脑带小天线） */
const COLORS = ['#e07a5f', '#3d8bd9', '#81b29a', '#f2cc8f', '#b07cc6', '#e5989b', '#5fb3b3', '#d4a373'];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h;
}

export function avatarSvg(name: string, bot: boolean): string {
  const h = hash(name);
  const bg = COLORS[h % COLORS.length]!;
  // 好友房里是别人起的昵称：拼进 SVG 前转义（只取一个字，也不留尖括号、& 这类口子）
  const ch = ([...name][0] ?? '?').replace(/[<>&"']/g, '?');
  const antenna = bot
    ? '<line x1="32" y1="8" x2="32" y2="1" stroke="#203040" stroke-width="2.5"/><circle cx="32" cy="2" r="2.6" fill="#f3c86b"/>'
    : '';
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${antenna}<circle cx="32" cy="35" r="27" fill="${bg}" stroke="#fff6" stroke-width="2"/><text x="32" y="45" text-anchor="middle" font-size="28" font-weight="700" fill="#fff" font-family="'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Microsoft YaHei',sans-serif">${ch}</text></svg>`;
}
