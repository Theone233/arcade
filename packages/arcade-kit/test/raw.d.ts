// vite 的 ?raw 导入：文件原文当字符串（room.test.ts 检查源码里没有 setTimeout 等）
declare module '*?raw' {
  const text: string;
  export default text;
}
