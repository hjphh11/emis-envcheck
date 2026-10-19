/**
 * 通用 hooks。
 *
 * 说明：这里原有的 useCountUp / useDocumentHidden 已删除——全仓无引用（死代码），
 * 且同类能力已有更贴近现场的替代：
 *  - 数字滚动由 components/ui/Gauge.tsx 用 motion 的 animate 内联实现；
 *  - 页面可见性由 App.tsx（全局暂停动画）与 pages/Monitor.tsx（暂停采样）各自订阅。
 * 文件本身保留，避免以后按旧路径 import 时断裂。
 */
export {};
