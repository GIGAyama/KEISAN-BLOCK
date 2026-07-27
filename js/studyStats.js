/* ============================================================
   学習ログの よみだし・集計（study.v1 / §5.5）

   じぶんの きろくを 児童本人に かえすための モジュール。

   遵守事項（§5.5）
   ・よみだし専用。study.records.v1 への 書きこみ・削除は しない
   ・自アプリの appId（keisan-block）で しぼる。ほかのアプリの きろくは 見せない
   ・schema === "study.v1" を たしかめる
   ・パース失敗時は 空配列を かえし、アプリの 表示を こわさない
   ・正答率は firstTryCorrect / attempted を つかう
   ============================================================ */

const StudyStats = (() => {
  const KEY = "study.records.v1";
  const APP_ID = "keisan-block";

  /** §5.5 参照実装。あたらしい ものから ならべて かえす */
  function loadStudyRecords(appId) {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const log = JSON.parse(raw);
      if (!Array.isArray(log)) return [];
      return log.filter((r) => r && r.schema === "study.v1" && r.appId === appId).reverse();
    } catch (e) {
      return [];
    }
  }

  /** このアプリの きろく（あたらしい ものから） */
  function load() {
    return loadStudyRecords(APP_ID).filter((r) => r.summary && typeof r.summary.count === "number");
  }

  /** きょうから かぞえて days 日ぶんの きろくに しぼる */
  function lastDays(records, days) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    const ms = from.getTime();
    return records.filter((r) => {
      const t = Date.parse(r.startedAt);
      return Number.isFinite(t) && t >= ms;
    });
  }

  /** ごうけい。正答率は firstTryCorrect / attempted */
  function total(records) {
    const t = {
      records: records.length, sets: 0, sessions: 0, aborted: 0,
      count: 0, attempted: 0, firstTryCorrect: 0, correct: 0,
      elapsedMs: 0, activeMs: 0, days: 0,
    };
    const days = new Set();
    records.forEach((r) => {
      const s = r.summary || {};
      if (r.kind === "session") t.sessions++; else t.sets++;
      if (r.status === "aborted") t.aborted++;
      t.count += num(s.count);
      t.attempted += num(s.attempted, num(s.count));
      t.firstTryCorrect += num(s.firstTryCorrect);
      t.correct += num(s.correct);
      t.elapsedMs += num(r.elapsedMs);
      t.activeMs += num(r.activeMs);
      const d = dayKey(r.startedAt);
      if (d) days.add(d);
    });
    t.days = days.size;
    return t;
  }

  /** モードごとの ごうけい（おおい ものから） */
  function byMode(records) {
    const map = new Map();
    records.forEach((r) => {
      const id = (r.unit && r.unit.id) || r.mode || "?";
      const row = map.get(id) || {
        id, title: (r.unit && r.unit.title) || id,
        records: 0, attempted: 0, firstTryCorrect: 0, activeMs: 0,
      };
      const s = r.summary || {};
      row.records++;
      row.attempted += num(s.attempted, num(s.count));
      row.firstTryCorrect += num(s.firstTryCorrect);
      row.activeMs += num(r.activeMs);
      map.set(id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.attempted - a.attempted);
  }

  /** さいきんの n件 */
  function recent(records, n) {
    return records.slice(0, n);
  }

  /** 初回正答率（0〜1）。とけるだけの もんだいが なければ null */
  function firstTryRate(t) {
    return t.attempted > 0 ? t.firstTryCorrect / t.attempted : null;
  }

  // ---------- 表示のための ととのえ ----------
  function num(v, alt) {
    return typeof v === "number" && Number.isFinite(v) ? v : (alt || 0);
  }

  function dayKey(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 「7がつ27にち」 */
  function dateLabel(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    return `${d.getMonth() + 1}がつ${d.getDate()}にち`;
  }

  /**
   * 時刻は「時間帯」までに とどめる（§4.1）。
   * 分単位の 学習時刻は 家庭の ようすを 推測させるため、表示にも つかわない。
   */
  function bandLabel(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const h = new Date(t).getHours();
    if (h < 12) return "ごぜん";
    if (h < 17) return "ごご";
    return "ゆうがた";
  }

  /** 「25びょう」「3ふん」「1じかん20ふん」 */
  function durationLabel(ms) {
    const sec = Math.max(0, Math.round(num(ms) / 1000));
    if (sec < 60) return `${sec}びょう`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}ふん`;
    return `${Math.floor(min / 60)}じかん${min % 60}ふん`;
  }

  return {
    APP_ID,
    load, lastDays, total, byMode, recent, firstTryRate,
    dateLabel, bandLabel, durationLabel,
  };
})();
