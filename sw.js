/*
 * さんすうブロック — Service Worker（オフライン対応）
 *
 * 【重要】activate では 自アプリ以外の キャッシュを けさない。
 *   いまは 独自ドメイン keisan-block.giga-school.com が このアプリ せんようの
 *   オリジンだが、旧配信元の gigayama.github.io は 何十個もの アプリが
 *   おなじ オリジンを 共有していた。caches.keys() を 全消しする 書き方に すると、
 *   その形に もどした とたん ほかの アプリが オフラインで 起動しなくなる。
 *   CACHE_PREFIX で はじまる キャッシュだけを そうじする。
 *
 * Service Worker は localStorage を いっさい さわらない。
 */

const CACHE_PREFIX  = "sansu-block-";
const APP_VERSION   = "v11";              // ← リリースごとに かならず 上げる
const CACHE_STATIC  = CACHE_PREFIX + "static-" + APP_VERSION;
const CACHE_RUNTIME = CACHE_PREFIX + "runtime-" + APP_VERSION;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./offline.html",
  "./css/style.css",
  "./install-hook.js",
  "./js/audio.js",
  "./js/blocks.js",
  "./js/marks.js",
  "./js/storage.js",
  "./js/studyLog.js",
  "./js/studySession.js",
  "./js/studyStats.js",
  "./records-export.html",
  "./js/records-export.js",
  "./js/main.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => e.waitUntil((async () => {
  const cache = await caches.open(CACHE_STATIC);
  // 1本でも しっぱいすると addAll 全体が おちるため、1つずつ 入れる。
  // アイコンを 1枚 入れそこねただけで、オフラインで 起動しなくなるのは こまる。
  await Promise.all(PRECACHE_URLS.map((u) =>
    cache.add(new Request(u, { cache: "reload" }))
      .catch((err) => console.warn("[sw] precache skipped", u, err))
  ));
  // ここでは skipWaiting しない。
  // 児童が といている さいちゅうに 画面が 入れかわると、
  // うちかけの こたえや ならべた ブロックが きえる。
  // 画面がわで「さいしんに する」を おしてもらってから 切りかえる。
})()));

self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_STATIC && k !== CACHE_RUNTIME)
      .map((k) => caches.delete(k))          // ← 自アプリ分だけ 削除
  );
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== location.origin) return;

  // 画面遷移は network-first。あたらしい版を すぐ とどけ、
  // 圏外なら 手元の index.html、それも 無ければ offline.html を 出す。
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        // 圏外。まず「ひらこうとした 画面 そのもの」を さがす。
        // これを とばして index.html から かえすと、圏外では
        // りようきやくを ひらいても アプリが 出る、という へんな 動きになる。
        return (await caches.match(req))
            || (await caches.match("./index.html"))
            || (await caches.match("./offline.html"))
            || Response.error();
      }
    })());
    return;
  }

  // 静的ファイルは cache-first（校内 Wi-Fi が こんでいても すぐ 出る）
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === "basic") {
      const copy = res.clone();
      const c = await caches.open(CACHE_RUNTIME);
      await c.put(req, copy);
    }
    return res;
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
