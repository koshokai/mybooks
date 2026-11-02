/*
 * 万象 · 离线缓存（Service Worker）
 * - 页面与代码（html / js / css / json）：网络优先，拿到就更新缓存；断网或网络极慢（8 秒无响应）时用缓存。
 * - 大文件与图片（three.js、实拍照片、图标等）：先用缓存秒开，同时在后台更新。
 * - 只处理本站的 GET 请求；画廊的博物馆接口、Google 字体等外站请求一律不拦截。
 */
const VERSION = "wx-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const SHELL = ["./", "index.html", "hub/hub.css", "hub/hub.js", "shared/status.js", "icon.svg", "icon-192.png", "manifest.webmanifest"];
const STATIC_MAX = 400;
const NET_TIMEOUT = 8000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isStatic = (url) =>
  url.pathname.includes("/shared/vendor/") ||
  /\.(?:jpe?g|png|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp3|ogg|wav)$/i.test(url.pathname);

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const refresh = fetch(req).then(async (res) => {
    if (res && res.ok && res.type === "basic") { await cache.put(req, res.clone()); trim(STATIC, STATIC_MAX); }
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  return (await refresh) || new Response("", { status: 504 });
}

const OFFLINE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>暂时离线 · 万象</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07070a;color:#f4f0e8;font-family:"Songti SC","Noto Serif SC",serif;text-align:center;padding:24px}
b{display:block;font-size:64px;color:#e3b866;margin-bottom:12px}p{color:#a9a39a;line-height:2;letter-spacing:.1em}a{color:#e3b866}</style></head>
<body><div><b>万象</b><p>暂时连不上网络。<br>之前打开过的世界可以离线浏览，<br><a href="__ROOT__">回到入口</a> 试试看。</p></div></body></html>`;

async function networkFirst(req, event) {
  const cache = await caches.open(PAGES);
  const net = fetch(req).then(async (res) => {
    if (res && res.ok && res.type === "basic") await cache.put(req, res.clone());
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, NET_TIMEOUT, "slow"); });
  try {
    const first = await Promise.race([net, slow]);
    if (first !== "slow") { clearTimeout(timer); return first; }
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    return hit || (await net);
  } catch {
    clearTimeout(timer);
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") return new Response(OFFLINE_HTML.replace("__ROOT__", self.registration.scope), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外站请求不拦截
  if (req.headers.has("range")) return;            // 媒体分段请求交给浏览器
  event.respondWith(isStatic(url) ? staleWhileRevalidate(req, event) : networkFirst(req, event));
});
