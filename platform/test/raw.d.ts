// vite 的 ?raw 导入：文件原文当字符串（test/headers.test.ts 读 public/_headers 用）
declare module '*?raw' {
  const text: string;
  export default text;
}
