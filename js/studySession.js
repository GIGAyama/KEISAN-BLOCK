/* ============================================================
   学習ログの くみたて（study.v1 / アプリ側）

   1セット（5もん）＝1レコード、タイムアタックは 1セッション＝1レコード。
   ・セットの 開始時刻・elapsedMs・activeMs を もつ
   ・1もんごとに 設問層（items）を ためる
   ・完走／中断 で StudyLog.saveStudyRecord に わたす

   保存そのものは js/studyLog.js（全アプリ共通・同一）が おこなう。
   このファイルは さんすうブロック 固有の くみたてだけを うけもつ。

   きろくしないもの（仕様書 §4）
   ・「じぶんで しきを いれる」モード（先生が入力した式。source: teacher にあたる）
   ・氏名・出席番号・端末情報など 児童を 識別しうる もの
   ============================================================ */

const StudySession = (() => {
  const APP_ID = "keisan-block";
  const APP_VERSION = "1.1.0";   // このアプリの バージョン（学習ログの appVersion）

  const SET_KIND = "set";        // ガイドつき: 5もんごとに 区切る（§2.6）
  const SESSION_KIND = "session";// タイムアタックは 明確な おわりが ある
  const HIDDEN_ABORT_MS = 5 * 60 * 1000;  // 5ふん もどらなければ 中断（§5.4。みじかくしない）
  const WRONG_MAX = 8;           // 1もんあたりに のこす 誤答の かず
  const FACT_KEYS_MAX = 50;      // ext.factKeys の かず（ext は 8KB まで）

  /**
   * モードごとの 単元定義。
   * unit.id は mode と 同一値（§3.5）。改訂しても かえてはならない。
   */
  const UNITS = {
    add:        { title: "たしざん（くりあがり）",              grade: 1, strategy: "add" },
    genka:      { title: "ひきざん 10から ひいて たす",         grade: 1, strategy: "genka" },
    gengen:     { title: "ひきざん ばらから ひいて 10から ひく", grade: 1, strategy: "gengen" },
    mix:        { title: "ひきざん ミックス",                   grade: 1, strategy: "mix" },
    timed:      { title: "あんざん タイムアタック",             grade: 1, strategy: "mental" },
    "dev-add":  { title: "はってん たしざん（2けた＋1けた）",    grade: 2, strategy: "dev-add" },
    "dev-sub":  { title: "はってん ひきざん（2けた−1けた）",     grade: 2, strategy: "dev-sub" },
    "dev-mix":  { title: "はってん ミックス",                   grade: 2, strategy: "mix" },
  };

  // ---------- activeMs の 計測（§2.8 の参照実装） ----------
  let activeAcc = 0;
  let mark = Date.now();
  let idle = false;
  let running = false;

  const tick = () => {
    if (running && !idle && !document.hidden) activeAcc += Date.now() - mark;
    mark = Date.now();
  };
  const wake = () => { tick(); idle = false; };

  setInterval(tick, 1000);
  setInterval(() => { tick(); idle = true; }, 60000);  // 60びょう さわらなければ とめる
  document.addEventListener("visibilitychange", tick);
  ["click", "keydown", "touchstart", "pointerdown"].forEach((ev) =>
    document.addEventListener(ev, wake, true));

  // ---------- 状態 ----------
  let rec = null;        // いま きろくちゅうの セット／セッション
  let hiddenAt = 0;      // タブが 見えなくなった 時刻
  let abortTimer = 0;

  /**
   * Chromebook では メモリ不足や スリープで タブが すてられる ことがある。
   * 5ふんの タイマーごと きえてしまうので、pagehide で かならず レコードを 確定する（§5.4）。
   * beforeunload は モバイルや bfcache 経路で 発火しない ことが あるため つかわない。
   *
   * おわりの 時刻は「はなれた 時刻」。すでに タブが 見えなくなっていれば その ときの 時刻を、
   * 見えたまま とじた／リロードした ときは いまの 時刻を つかう。
   */
  window.addEventListener("pagehide", () => {
    if (!rec) return;
    finish("aborted", { endMs: document.hidden && hiddenAt ? hiddenAt : Date.now() });
  });

  /** 5ふん もどってこなければ そこまでを 中断として のこす（§5.4） */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!rec) return;
      hiddenAt = Date.now();
      clearTimeout(abortTimer);
      abortTimer = setTimeout(() => {
        abortTimer = 0;
        // 中断の おわりは「はなれた 時刻」。まっていた 5ふんは 学習時間に いれない
        finish("aborted", { endMs: hiddenAt });
      }, HIDDEN_ABORT_MS);
    } else {
      clearTimeout(abortTimer);
      abortTimer = 0;
    }
  });

  // ---------- 1レコードの はじまり ----------
  /**
   * @param {string} mode  add / genka / gengen / mix / timed / dev-add / dev-sub / dev-mix
   * @param {number} planned このレコードで 出題する よていの もんだい数
   */
  function begin(mode, planned) {
    if (rec) finish("aborted");            // とじわすれが あれば 中断として のこす
    if (!UNITS[mode]) return;              // free など きろく対象外の モード
    rec = {
      mode,
      kind: mode === "timed" ? SESSION_KIND : SET_KIND,
      planned: Math.max(0, Math.round(planned) || 0),
      startedAt: new Date().toISOString(), // performance.now() は startedAt に つかえない（§2.8）
      startMs: Date.now(),
      items: [],
      cur: null,
      maxStreak: 0,
    };
    activeAcc = 0;
    mark = Date.now();
    idle = false;
    running = true;
  }

  function isActive() { return !!rec; }
  function currentMode() { return rec ? rec.mode : ""; }

  // ---------- 1もんごとの きろく ----------
  /**
   * @param {string} q        設問ID（A8+7 / S13-9 など。もんだい文は いれない）
   * @param {string} strategy そのもんだいの さくせん（add / genka / gengen / dev-add …）
   * @param {string} factKey  けいさんカードの キー（習熟度マップと つなぐ ため）
   */
  function startProblem(q, strategy, factKey) {
    if (!rec) return;
    if (rec.cur) closeProblem();           // 前のもんだいが とじられていない
    rec.cur = {
      q: String(q || ""),
      strategy: strategy || "",
      factKey: factKey || "",
      startMs: Date.now(),
      tries: 0,
      wrong: [],
      hint: false,
      revealed: false,
      firstTry: true,
    };
  }

  /**
   * こたえを 1かい 入力した。
   * @param {boolean} ok    あっていたか
   * @param {string}  input まちがえた ときの 入力値（数字だけ のこす）
   */
  function answered(ok, input) {
    if (!rec || !rec.cur) return;
    rec.cur.tries++;
    if (ok) return;
    rec.cur.firstTry = false;
    const v = String(input == null ? "" : input).replace(/[^0-9]/g, "").slice(0, 12);
    if (v && rec.cur.wrong.length < WRONG_MAX) rec.cur.wrong.push(v);
  }

  /** ヒント・補助ツール（じどうで うごかす など）を つかった */
  function usedHint() {
    if (rec && rec.cur) rec.cur.hint = true;
  }

  /** 3かい まちがえて こたえを 見せた（この もんだいは じぶんで とけていない） */
  function usedAnswer() {
    if (!rec || !rec.cur) return;
    rec.cur.hint = true;
    rec.cur.revealed = true;
  }

  /** れんぞく せいかいの さいこう記録 */
  function setStreak(n) {
    if (rec && n > rec.maxStreak) rec.maxStreak = n;
  }

  /** 1もん おわった（さいごの ステップまで こたえた） */
  function finishProblem() {
    if (!rec || !rec.cur) return;
    rec.cur.done = true;
    closeProblem();
  }

  /**
   * いまの もんだいを items に つみ、cur を からにする。
   * 一度も こたえを 入力していない もんだいは 未着手として のぞく（§2.7）。
   */
  function closeProblem(endMs) {
    const cur = rec.cur;
    rec.cur = null;
    if (!cur || cur.tries === 0) return;
    const end = endMs || Date.now();
    cur.ms = Math.max(0, end - cur.startMs);
    // 「とけた」のは さいごまで すすみ、こたえを 見せずに こたえられた もんだいだけ。
    // 中断で とちゅうまでの もんだい（done でない）も 初回正答には かぞえない
    cur.ok = !!cur.done && !cur.revealed;
    if (!cur.ok) cur.firstTry = false;
    rec.items.push(cur);
  }

  // ---------- 1レコードの おわり ----------
  /**
   * @param {string} status "completed" | "aborted"
   * @param {object} opts   { ext: 追加の 拡張層, endMs: おわりの 時刻 }
   * @returns {string|null} 保存した レコードの id
   */
  function finish(status, opts) {
    if (!rec) return null;
    const o = opts || {};
    const end = o.endMs || Date.now();
    if (rec.cur) closeProblem(end);        // 中断: とちゅうの もんだいも attempted に かぞえる
    tick();
    running = false;
    clearTimeout(abortTimer);
    abortTimer = 0;

    const cur = rec;
    rec = null;

    // 1もんも こたえていない 中断は 学習データを もたない。のこすと ログが うまるだけ
    if (status === "aborted" && cur.items.length === 0) return null;

    const save = window.StudyLog && window.StudyLog.saveStudyRecord;
    if (typeof save !== "function") return null;   // ログが無くてもアプリは動く（§5.1.1）

    const unit = UNITS[cur.mode];
    const attempted = cur.items.length;
    const count = Math.max(cur.planned, attempted);
    const elapsedMs = Math.max(0, end - cur.startMs);
    // ちがう 時計の 丸め誤差で activeMs > elapsedMs に なりうる。かならず 抑えこむ（§2.8）
    const activeMs = Math.min(Math.max(0, Math.round(activeAcc)), elapsedMs);

    const firstTryCorrect = cur.items.filter((it) => it.firstTry).length;
    const correct = cur.items.filter((it) => it.ok).length;

    return save({
      appId: APP_ID,
      appVersion: APP_VERSION,
      kind: cur.kind,
      mode: cur.mode,
      unit: { id: cur.mode, title: unit.title, grade: unit.grade, preset: true },
      source: "course",
      multiplayer: false,
      grading: "objective",
      startedAt: cur.startedAt,
      endedAt: new Date(end).toISOString(),
      elapsedMs,
      activeMs,
      timeBasis: "app",
      status: status === "aborted" ? "aborted" : "completed",
      summary: { count, attempted, firstTryCorrect, correct },
      items: cur.items.map((it) => ({
        q: it.q,
        ok: it.ok,
        firstTry: it.firstTry,
        tries: it.tries,
        ms: it.ms,
        hint: it.hint,
        wrong: it.wrong.length ? it.wrong : undefined,
      })),
      ext: buildExt(cur, unit, o.ext),
    });
  }

  /** アプリ固有の 指標（横断集計には つかわない。§2.11） */
  function buildExt(cur, unit, extra) {
    const guided = cur.mode !== "timed";
    const ext = {
      strategy: unit.strategy,
      guided,
      factKeys: uniq(cur.items.map((it) => it.factKey)).slice(0, FACT_KEYS_MAX),
    };
    // れんぞく せいかいは ガイドつきモードだけが かぞえている
    if (guided) ext.maxStreak = cur.maxStreak;
    // 初回で まちがえた けいさんカード。items を 見ない 簡易集計でも つまずきを たどれる
    const wrongFactKeys = uniq(cur.items.filter((it) => !it.firstTry).map((it) => it.factKey));
    if (wrongFactKeys.length) ext.wrongFactKeys = wrongFactKeys.slice(0, FACT_KEYS_MAX);
    // ミックスは さくせんごとの 定着（減加法／減減法）が わかるように ばらして のこす
    if (unit.strategy === "mix") {
      const stats = {};
      cur.items.forEach((it) => {
        const k = it.strategy || "unknown";
        const s = stats[k] || (stats[k] = { count: 0, firstTryCorrect: 0 });
        s.count++;
        if (it.firstTry) s.firstTryCorrect++;
      });
      if (Object.keys(stats).length) ext.strategyStats = stats;
    }
    return Object.assign(ext, extra || {});
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  return {
    APP_ID, APP_VERSION, UNITS,
    begin, isActive, currentMode,
    startProblem, answered, usedHint, usedAnswer, setStreak, finishProblem,
    finish,
  };
})();
