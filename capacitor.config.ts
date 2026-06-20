import type { CapacitorConfig } from '@capacitor/cli';

// 这个 app 不打包静态网页——Next.js 这边有服务端 API 路由（/api/admin、/api/ai/parse-event）
// 和服务端鉴权逻辑，没法整个导出成静态文件塞进 native 包里。
// 改用 server.url：原生外壳直接加载线上正式网站，相当于给现有网站套一个能上架的 App 外壳，
// 网站怎么更新，app 里看到的就跟着怎么更新，不需要重新提审。
const config: CapacitorConfig = {
  appId: 'com.optidoerapp.app',
  appName: 'OptiDoerApp',
  webDir: 'public',
  server: {
    url: 'https://www.optidoerapp.com',
    cleartext: false,
  },
};

export default config;
