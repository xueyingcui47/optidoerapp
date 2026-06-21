import { Capacitor } from "@capacitor/core";

// 苹果/谷歌的应用商店规则要求"数字内容/订阅"必须走它们自己的 IAP（内购）才能在 App 里收钱，
// 不允许直接跳转外部支付。很多 App 的做法是：App 里完全不放购买入口，只提示"去网站订阅"，
// 网页版本身正常用 Stripe（之后接）收费。这个函数用来判断当前是不是跑在 Capacitor 包出来的
// 原生 App 里——是的话，UI 要隐藏所有"开始订阅/升级/切换账单周期"这类按钮。
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
