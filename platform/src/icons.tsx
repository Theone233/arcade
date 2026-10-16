/** 共用的小图标：用 SVG 不用 emoji（没装 emoji 字体的设备会显示成方框）。单独一个文件，大厅首屏不用把钱包页一起加载。 */

/** 金币图标（不用 emoji：没装 emoji 字体的设备会显示成方框） */
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="#ffc83d" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="#e58f12" strokeWidth="2" />
    </svg>
  );
}
