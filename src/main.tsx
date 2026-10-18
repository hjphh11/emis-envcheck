import React from "react";
import ReactDOM from "react-dom/client";
// 字体不再走 @fontsource 整包（12.3MB），改为 scripts/subset-fonts.py 生成的子集，
// 由 ./styles/fonts.css 里的 @font-face 引入（约 530KB）。
import "./styles/app.css";
import App from "./App";

/* 用内联 SVG 定一个品牌色 favicon：浏览器预览时不会再 404 请求 /favicon.ico */
const brandIcon =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="30%" cy="24%" r="80%"><stop offset="0" stop-color="#fff6f8"/><stop offset=".42" stop-color="#f6a5b8"/><stop offset="1" stop-color="#c23a55"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#g)"/><circle cx="47" cy="46" r="7" fill="#e8b04b"/></svg>`,
  );
const link = document.createElement("link");
link.rel = "icon";
link.type = "image/svg+xml";
link.href = brandIcon;
document.head.appendChild(link);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
