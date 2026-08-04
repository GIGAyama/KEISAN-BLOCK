/*
 * インストールの合図を いちばん先に うけとるための 小さな ファイル。
 *
 * Chrome は 条件が そろうと すぐに beforeinstallprompt を 出す。
 * 本体（js/main.js）は </body> の直前に 8本目として ならんでいるので、
 * 通信が おそい端末では 合図に まにあわず、「インストール」ボタンが
 * 一度も 出ないまま おわる。
 *
 * <head> の 先頭で 同期に よみこんで、ここで うけとって ためておく。
 * 本体は あとから window.__pwaInstallPrompt を 見にくる。
 *
 * インラインの <script> に しないのは、CSP の script-src 'self' が
 * インラインを 止めるからである（'unsafe-inline' を たすと CSP の いみが なくなる）。
 */
(function () {
  window.__pwaInstallPrompt = null;
  window.__pwaInstalled = false;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    window.dispatchEvent(new Event("pwa-install-available"));
  });

  window.addEventListener("appinstalled", function () {
    window.__pwaInstallPrompt = null;
    window.__pwaInstalled = true;
    window.dispatchEvent(new Event("pwa-installed"));
  });
})();
