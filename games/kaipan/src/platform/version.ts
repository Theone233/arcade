// 由 vite.config.ts 的 define 在构建时注入
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

/** 应用版本号（package.json 的 version）。 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
/** 构建时间（ISO 字符串）；开发模式下为启动开发服务器的时间。 */
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
