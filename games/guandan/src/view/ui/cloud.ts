/** 云朵图标：五种状态换图，出问题时右上角一个小红点；点开用一句话说明，没登录就去登录页。 */
import Phaser from 'phaser';
import { app } from '../app.ts';
import { tapAction, type CloudNote, type CloudStatus } from '../cloud.ts';
import { iconButton, toast, worldW } from './kit.ts';

/**
 * 去登录，登录完回到 search 指的这一页（平台 0.10.1 的 next，docs/platform-backend.md 5.7：查询原样带回，比如 ?room= 房间码）。
 * 不给 search 就是现在地址栏里的
 */
export function loginUrl(search: string = window.location.search): string {
  return `/login?next=${encodeURIComponent(window.location.pathname + search)}`;
}

const ICON: Record<CloudStatus, string> = {
  loggedOut: 'cloudOff',
  synced: 'cloudCheck',
  syncing: 'cloudSync',
  pending: 'cloudUp',
  merged: 'cloudMerge',
};
/** 按状态染色：已同步绿、待上传橙、同步中蓝、已合并青，未登录灰 */
const TINT: Record<CloudStatus, number> = {
  loggedOut: 0xc8b8a0,
  synced: 0x8fe39a,
  syncing: 0xa9d6ff,
  pending: 0xffb84d,
  merged: 0x7fe0d6,
};
const SAY: Record<CloudStatus, string> = {
  loggedOut: '没登录，战绩只存在这台设备上',
  synced: '战绩已经存到云端',
  syncing: '正在同步战绩…',
  pending: '战绩稍后自动存到云端',
  merged: '已经和别的设备上的战绩合在一起',
};
const NOTE: Record<Exclude<CloudNote, null>, string> = {
  paused: '云存档在维护，战绩先存在本机',
  offline: '连不上云端，战绩先存在本机，回头再传',
  tooLarge: '存档太大，传不上云端了',
  noSpace: '本机存储满了，换账号前的战绩备份不下来，云同步先停着；清理空间后刷新页面',
  rejected: '云端不收这次同步，战绩先存在本机；刷新页面后再试',
};

export function cloudButton(scene: Phaser.Scene, x: number, y: number, size = 46): Phaser.GameObjects.Container {
  const b = iconButton(scene, x, y, ICON.loggedOut, () => {
    const cloud = app.cloud;
    if (!cloud || tapAction(cloud.status, cloud.note) === 'login') {
      window.location.href = loginUrl();
      return;
    }
    const msg = cloud.note ? NOTE[cloud.note] : SAY[cloud.status];
    // 图标靠边时提示框往里挪，免得出画面
    toast(scene, msg, Phaser.Math.Clamp(x, 260, worldW(scene) - 260), y + size + 18);
  }, size);
  const img = b.getData('icon') as Phaser.GameObjects.Image;
  const dot = scene.add.circle(size * 0.36, -size * 0.36, 8, 0xe0302a).setStrokeStyle(2.5, 0xfff0d0);
  b.add(dot);
  b.setData('cloud', true);
  const paint = (): void => {
    const cloud = app.cloud;
    const status = cloud?.status ?? 'loggedOut';
    img.setTexture(`icon:${ICON[status]}`).setDisplaySize(size * 0.72, size * 0.72).setTint(TINT[status]);
    img.setAlpha(status === 'loggedOut' ? 0.75 : 1);
    dot.setVisible(!!cloud?.note);
    b.setData('status', status);
  };
  paint();
  const off = app.cloud?.onChange(paint);
  b.once(Phaser.GameObjects.Events.DESTROY, () => off?.());
  return b;
}
