import Phaser from 'phaser';
import type { Rect } from '../rect.ts';
import { sound } from '../sound.ts';
import { COLOR } from '../theme.ts';
import { addText, setColor } from '../ui/text.ts';
import { bindTooltip } from '../ui/tooltip.ts';

/** 手机横屏右边那一块的三页：群聊消息、今日推荐、风口看板。 */
export type PanelTab = 'msgs' | 'recs' | 'board';

const TABS: { id: PanelTab; label: string; tip: { title: string; body: string } }[] = [
  { id: 'msgs', label: '群聊', tip: { title: '群聊', body: '群友今天看好哪个风口、看衰哪个。名字后面是他们说对了几次。' } },
  { id: 'recs', label: '推荐', tip: { title: '今日推荐', body: '今天能买的几只：谁推荐的、最近走势、一句理由。点「买入」买进，持仓里的空格也能直接点。' } },
  { id: 'board', label: '风口', tip: { title: '风口看板', body: '6 个风口的热度和状态。状态看最近几天往哪走，不看热度高低。点一行看详情。' } },
];

/**
 * 0.5.5 手机横屏的标签页条（电脑上三块都摆开，没有它）。
 * 每页一个按钮，当前页是白底深字；推荐页上带一个数字角标（今天还有几只能买）。
 */
export class PanelTabs {
  private readonly scene: Phaser.Scene;
  private readonly rect: Rect;
  private readonly nodes = new Map<PanelTab, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; badge: Phaser.GameObjects.Container; rect: Rect }>();
  private current: PanelTab;

  constructor(scene: Phaser.Scene, rect: Rect, initial: PanelTab, onChange: (tab: PanelTab) => void) {
    this.scene = scene;
    this.rect = rect;
    this.current = initial;
    const gap = 4;
    const w = (rect.w - gap * (TABS.length - 1)) / TABS.length;
    TABS.forEach((t, i) => {
      const x = rect.x + i * (w + gap);
      const r = { x, y: rect.y, w, h: rect.h };
      const bg = scene.add.rectangle(x, rect.y, w, rect.h, COLOR.paper).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, COLOR.ink, 1);
      const label = addText(scene, x + w / 2, rect.y + rect.h / 2, t.label, { size: 15, bold: true, originX: 0.5, originY: 0.5 });
      const badge = scene.add.container(x + w / 2 + label.width / 2 + 14, rect.y + rect.h / 2).setVisible(false);
      // 点击区比按钮再往下多 4（到群聊框的上沿），凑够 50 高（844×390 上约 44px）
      bg.setInteractive({ hitArea: new Phaser.Geom.Rectangle(0, 0, w, rect.h + 4), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      bg.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        if (this.current === t.id) return;
        sound.ui('click');
        this.set(t.id);
        onChange(t.id);
      });
      bindTooltip(bg, () => r, () => t.tip);
      this.nodes.set(t.id, { bg, label, badge, rect: r });
    });
    this.set(initial);
  }

  get tab(): PanelTab {
    return this.current;
  }

  /** 切到某一页（只改按钮外观；内容的显隐由场景做）。 */
  set(tab: PanelTab): void {
    this.current = tab;
    for (const [id, n] of this.nodes) {
      const on = id === tab;
      n.bg.setFillStyle(on ? COLOR.paperHi : 0xe9dfd2, 1).setStrokeStyle(on ? 3 : 2, on ? COLOR.accentDark : 0xb9a9ad, 1);
      setColor(n.label, on ? COLOR.ink : 0x6e5966);
    }
  }

  /** 角标数字（0 时不显示）。 */
  setBadge(tab: PanelTab, n: number): void {
    const node = this.nodes.get(tab);
    if (!node) return;
    node.badge.removeAll(true);
    node.badge.setVisible(n > 0);
    if (n <= 0) return;
    const t = addText(this.scene, 0, 0, `${n}`, { size: 13, bold: true, num: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
    const d = Math.max(20, t.width + 10);
    node.badge.add([this.scene.add.rectangle(0, 0, d, 20, COLOR.accent).setRounded(10), t]);
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [id, n] of this.nodes) out[`tab:${id}`] = { x: n.rect.x + n.rect.w / 2, y: n.rect.y + n.rect.h / 2 };
    return out;
  }

  rectOf(tab: PanelTab): Rect | null {
    return this.nodes.get(tab)?.rect ?? null;
  }

  area(): Rect {
    return { ...this.rect };
  }
}
