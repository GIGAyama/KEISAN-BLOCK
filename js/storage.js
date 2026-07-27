/* ============================================================
   データ層 — 記録・レベル・習熟度・ミッション・バッジ (localStorage)
   ============================================================ */

const Store = (() => {
  const KEY = "keisan-block-v2";
  const LEGACY_KEY = "keisan-block-records-v1";

  const MISSION_TARGET = 10; // 1にちの もくひょう もんすう

  const LEVEL_TITLES = [
    [1, "けいさん みならい"],
    [3, "けいさん れんしゅうちゅう"],
    [5, "けいさん がんばりや"],
    [8, "けいさん じょうずさん"],
    [12, "けいさん はかせ"],
    [16, "けいさん めいじん"],
    [20, "けいさん マスター"],
  ];

  const BADGES = [
    { id: "first5", icon: "flower", name: "はじめの いっぽ", desc: "はじめて 5もん クリアした" },
    { id: "solve50", icon: "medal", name: "50もん とっぱ", desc: "ぜんぶで 50もん といた" },
    { id: "solve200", icon: "trophy", name: "200もん とっぱ", desc: "ぜんぶで 200もん といた" },
    { id: "streak10", icon: "flame", name: "れんぞく 10もん", desc: "10もん れんぞくで せいかいした" },
    { id: "days3", icon: "calendar", name: "3にち つづけた", desc: "3にち れんぞくで がくしゅうした" },
    { id: "days7", icon: "sparkle", name: "1しゅうかん つづけた", desc: "7にち れんぞくで がくしゅうした" },
    { id: "timedClear", icon: "bolt", name: "スピードスター", desc: "タイムアタックを クリアした" },
    { id: "timedPerfect", icon: "gem", name: "パーフェクト", desc: "タイムアタックを ノーミスで クリアした" },
    { id: "devClear10", icon: "rocket", name: "はってん チャレンジャー", desc: "はってんもんだいを 10もん といた" },
    { id: "map20", icon: "map", name: "マップたんけんか", desc: "けいさんマップで 20マスを ばっちりにした" },
  ];

  function defaults() {
    return {
      xp: 0,
      modes: {
        add: { solved: 0, best: 0 },
        genka: { solved: 0, best: 0 },
        gengen: { solved: 0, best: 0 },
        "dev-add": { solved: 0, best: 0 },
        "dev-sub": { solved: 0, best: 0 },
        timed: { plays: 0, bestMs: 0, perfect: 0 },
      },
      facts: {},   // "A8+7" / "S13-9" → { c: せいかい, w: まちがい, s: れんぞくせいかい }
      days: {},    // "2026-07-24" → { solved: n, mission: true }
      badges: {},  // id → かくとくび
      settings: { sound: true },
    };
  }

  let data = load();

  function load() {
    let d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        d = Object.assign(d, saved);
        d.modes = Object.assign(defaults().modes, saved.modes || {});
        d.settings = Object.assign(defaults().settings, saved.settings || {});
      } else {
        // 旧バージョンからの ひきつぎ
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy);
          ["add", "genka", "gengen"].forEach((k) => {
            if (old[k]) d.modes[k] = { solved: old[k].solved || 0, best: old[k].best || 0 };
          });
        }
      }
    } catch (e) { /* こわれていたら 初期化 */ }
    return d;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 続行 */ }
  }

  // ---------- 日付 ----------
  function todayKey(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dayStreak() {
    // きょう または きのうから さかのぼって かぞえる
    let streak = 0;
    let offset = data.days[todayKey()] ? 0 : -1;
    while (data.days[todayKey(offset)]) { streak++; offset--; }
    return streak;
  }

  // ---------- レベル ----------
  function xpForNext(level) {
    return 60 + 30 * (level - 1); // つぎのレベルに ひつような XP
  }

  function levelInfo() {
    let level = 1;
    let rest = data.xp;
    while (rest >= xpForNext(level)) { rest -= xpForNext(level); level++; }
    let title = LEVEL_TITLES[0][1];
    for (const [lv, t] of LEVEL_TITLES) if (level >= lv) title = t;
    return { level, title, into: rest, need: xpForNext(level) };
  }

  // ---------- 習熟度 ----------
  function factState(key) {
    const f = data.facts[key];
    if (!f || f.c + f.w === 0) return "gray";
    if (f.s >= 3) return "green";
    if (f.s >= 1) return "yellow";
    return "red";
  }

  function weakFacts(prefix) {
    // といたことが あるのに まだ ばっちりでない カード
    return Object.keys(data.facts).filter(
      (k) => k.startsWith(prefix) && data.facts[k].s < 3
    );
  }

  function masteredCount() {
    return Object.keys(data.facts).filter((k) => factState(k) === "green").length;
  }

  // ---------- 記録の更新 ----------
  /**
   * 1もん といた ときに よぶ。
   * opts: { mode, factKey, success, xp }
   * もどりち: { events: [{type:"levelup"|"mission"|"badge", ...}] }
   */
  function recordProblem(opts) {
    const events = [];
    const before = levelInfo();

    if (data.modes[opts.mode]) data.modes[opts.mode].solved++;

    if (opts.factKey) {
      const f = data.facts[opts.factKey] || { c: 0, w: 0, s: 0 };
      if (opts.success) { f.c++; f.s++; }
      else { f.w++; f.s = 0; }
      data.facts[opts.factKey] = f;
    }

    data.xp += opts.xp || 0;

    // きょうの きろく と ミッション
    const tk = todayKey();
    const day = data.days[tk] || { solved: 0, mission: false };
    day.solved++;
    if (!day.mission && day.solved >= MISSION_TARGET) {
      day.mission = true;
      events.push({ type: "mission" });
    }
    data.days[tk] = day;

    const after = levelInfo();
    if (after.level > before.level) events.push({ type: "levelup", level: after.level, title: after.title });

    checkBadges(events);
    save();
    return { events };
  }

  function totalSolved() {
    return Object.values(data.modes).reduce((s, m) => s + (m.solved || 0), 0);
  }

  function checkBadges(events) {
    const earn = (id) => {
      if (!data.badges[id]) {
        data.badges[id] = todayKey();
        const def = BADGES.find((b) => b.id === id);
        events.push({ type: "badge", badge: def });
      }
    };
    const total = totalSolved();
    if (total >= 50) earn("solve50");
    if (total >= 200) earn("solve200");
    const ds = dayStreak();
    if (ds >= 3) earn("days3");
    if (ds >= 7) earn("days7");
    if (data.modes["dev-add"].solved + data.modes["dev-sub"].solved >= 10) earn("devClear10");
    if (masteredCount() >= 20) earn("map20");
  }

  /** バッジを直接あたえる（セットクリア・ストリークなど画面側のイベント用） */
  function earnBadge(id) {
    if (data.badges[id]) return null;
    data.badges[id] = todayKey();
    save();
    return BADGES.find((b) => b.id === id);
  }

  function recordTimed(ms, misses) {
    const t = data.modes.timed;
    const events = [];
    t.plays++;
    if (misses === 0) t.perfect++;
    if (!t.bestMs || ms < t.bestMs) t.bestMs = ms;
    const b1 = earnBadgeInto(events, "timedClear");
    if (misses === 0) earnBadgeInto(events, "timedPerfect");
    save();
    return { events };
  }

  function earnBadgeInto(events, id) {
    const def = earnBadge(id);
    if (def) events.push({ type: "badge", badge: def });
    return def;
  }

  function updateBest(mode, streak) {
    if (data.modes[mode] && streak > data.modes[mode].best) {
      data.modes[mode].best = streak;
      save();
    }
  }

  /**
   * このアプリの きろく（レベル・にがてカード・カレンダー・バッジ）だけを けす。
   *
   * 学習ログ `study.records.v1` は 複数アプリ共通の キーであり、
   * ここでは ぜったいに けさない。localStorage.clear() も つかわない。
   * （まだ 送信していない ログが きえるため。共通スキーマ study.v1 §1.2）
   */
  function resetAll() {
    data = defaults();
    save();
  }

  return {
    get data() { return data; },
    MISSION_TARGET, BADGES,
    save, todayKey, dayStreak, levelInfo,
    factState, weakFacts, masteredCount,
    recordProblem, recordTimed, updateBest, earnBadge, earnBadgeInto,
    totalSolved, resetAll,
  };
})();
