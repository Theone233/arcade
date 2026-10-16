import { STAGE_LABEL, stockById, themeById } from '../core/index.ts';
import type { Session } from '../view/session.ts';

/**
 * 调试浮层（DOM）：种子、今天预先掷好的行情、题材真实阶段、持仓买入时的阶段。
 * 这些都是隐藏信息，只在 URL 带 debug=1 时挂载。
 */
export function mountOverlay(session: Session): void {
  const el = document.createElement('pre');
  el.id = 'debug-overlay';
  Object.assign(el.style, {
    position: 'fixed',
    left: '8px',
    bottom: '8px',
    margin: '0',
    padding: '6px 8px',
    background: 'rgba(0, 0, 0, 0.72)',
    color: '#9fe870',
    font: '12px/1.4 Consolas, "DejaVu Sans Mono", monospace',
    border: '1px solid #335',
    borderRadius: '4px',
    pointerEvents: 'none',
    zIndex: '10',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);

  const update = (): void => {
    const s = session.state;
    const plan = s.today.plan;
    const themes = s.themeIds
      .map((id) => {
        const t = s.themes[id];
        const dH = plan.dH[id];
        return `${themeById(id).name}=${t ? `${STAGE_LABEL[t.stage]}(${t.left})${t.sure ? '!' : ''}` : '-'}${dH !== undefined ? ` ΔH${dH >= 0 ? '+' : ''}${dH.toFixed(0)}` : ''}`;
      })
      .join('  ');
    const holds = s.slots
      .map((h, i) => (h ? `${i + 1}.${stockById(h.stockId).name}@${STAGE_LABEL[h.buyStage]}` : `${i + 1}.现金`))
      .join('  ');
    el.textContent = [
      `seed ${s.seed}  phase ${s.phase}  ${s.month}月第${s.dayInMonth + 1}天（day ${s.dayIndex}）  动作 ${s.actions.length}  场景 ${session.sceneKey ?? '-'}`,
      `今日行情：大盘 ${plan.mood} ${plan.marketRet >= 0 ? '+' : ''}${plan.marketRet.toFixed(2)}%`,
      `题材真实阶段：${themes}`,
      `持仓买入阶段：${holds}`,
    ].join('\n');
  };
  session.subscribe(update);
  update();
}
