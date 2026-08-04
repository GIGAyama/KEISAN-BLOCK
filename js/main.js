/* ============================================================
   さんすうブロック — アプリ本体
   ・ガイドつき れんしゅう（たしざん／ひきざん2さくせん）
   ・あんざんタイムアタック
   ・はってん（2けた±1けた）
   ・じぶんで しきを いれる（2けた±2けた／せつめいモード・きろくに のこさない）
   ・ミッション／レベル／バッジ／習熟度マップ

   さくせんの なまえは こども むけに:
     genka  → 「10から ひいて たす さくせん」
     gengen → 「ばらから ひいて 10から ひく さくせん」
   ============================================================ */

(() => {
  const $ = (sel) => document.querySelector(sel);

  /** SVGスプライトのアイコンをHTML文字列で返す */
  const icon = (name, cls) =>
    `<svg class="icon${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  const SET_SIZE = 5;        // ガイドつき 1セットの もんだい数
  const TIMED_COUNT = 10;    // タイムアタックの もんだい数
  const HOWTO_READ_SEC = 5;  // 「けいさんの しかた」を よむ じかん（このあいだは つぎへ すすめない）

  const PRAISES = ["せいかい！", "すごい！", "やったね！", "いいね！", "そのちょうし！"];

  /** さくせんの なまえ（もんだいの うえに 出る おび） */
  const METHOD_LABELS = {
    add: `${icon("cherry", "ic-add")} 10の まとまりを つくる さくせん`,
    genka: `${icon("ten", "ic-sub")} 10から ひいて たす さくせん`,
    gengen: `${icon("cherry", "ic-add")} ばらから ひいて 10から ひく さくせん`,
    "dev-add": `${icon("rocket", "ic-dev")} つぎの なん10を つくる さくせん`,
    "dev-sub": `${icon("rocket", "ic-dev")} ばらから ひいて 10から ひく さくせん`,
    "free-add": `${icon("ten", "ic-add")} 10の まとまりで かんがえる さくせん`,
    "free-sub": `${icon("ten", "ic-sub")} 10の まとまりで かんがえる さくせん`,
    timed: "",
  };

  const FREE_MAX = 99;       // じぶんで いれる しきの おおきさの かぎり

  // ---------- 状態 ----------
  const state = {
    mode: "add",         // add | genka | gengen | mix | timed | dev-add | dev-sub | dev-mix
    problem: null,
    steps: [],
    stepIndex: 0,
    buffer: "",
    wrongCount: 0,
    accepting: false,
    firstTry: true,
    setSolved: 0,
    streak: 0,
    lastKey: "",
    session: 0,      // れんしゅうセッションの識別子（quit後の遅延コールバック暴発防止）
    task: null,      // いま すすめている ブロックそうさ
    // タイムアタック
    timedIndex: 0,
    timedMisses: 0,
    timedStart: 0,
    timerId: null,
    // じぶんで しきを いれる モード
    free: { a: "", b: "", op: "+", slot: "a", method: "genka", explain: false },
    freeProblem: null,
    revealed: false, // せつめいモードで こたえを 見せたか
  };

  function isTimed() { return state.mode === "timed"; }
  function isDev() { return state.mode.startsWith("dev"); }
  function isFree() { return state.mode === "free"; }
  /** せつめいモード（こたえを 見せながら すすむ）は じぶんの しき のときだけ */
  function isExplain() { return isFree() && state.free.explain; }

  // ---------- 画面切りかえ ----------
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#screen-" + id).classList.add("active");
    if (id === "home") renderHome();
    if (id === "free") renderFree();
  }

  // ---------- ユーティリティ ----------
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* 無視 */ } }
  }

  // ---------- 紙吹雪 ----------
  const CONFETTI_COLORS = ["#ffb400", "#4aa3ff", "#ff7eb3", "#2ecc71", "#a06cd5", "#ff9f43"];

  /** 画面のうえから 紙吹雪を ふらせて おいわいする */
  function burstConfetti(count) {
    const layer = $("#confetti-layer");
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "confetti-piece" + (Math.random() < 0.35 ? " round" : "");
      const size = 6 + Math.random() * 7;
      p.style.left = Math.random() * 100 + "vw";
      p.style.width = size + "px";
      p.style.height = (Math.random() < 0.5 ? size : size * 1.7) + "px";
      p.style.background = pick(CONFETTI_COLORS);
      p.style.animationDelay = Math.random() * 0.3 + "s";
      p.style.animationDuration = 1.1 + Math.random() * 0.9 + "s";
      p.style.setProperty("--drift", Math.random() * 160 - 80 + "px");
      p.style.setProperty("--spin", Math.random() * 720 - 360 + "deg");
      layer.appendChild(p);
      setTimeout(() => p.remove(), 2400);
    }
  }

  // ---------- もんだいの 生成 ----------
  // 基本のたしざん: a 6〜9, a+b≧11 ／ 基本のひきざん: a 11〜18, くりさがり必須
  const ADD_FACTS = (() => {
    const out = [];
    for (let a = 6; a <= 9; a++) for (let b = 11 - a; b <= 9; b++) out.push([a, b]);
    return out;
  })();

  const SUB_FACTS = (() => {
    const out = [];
    for (let a = 11; a <= 18; a++) for (let b = a - 10 + 1; b <= 9; b++) out.push([a, b]);
    return out;
  })();

  function factKeyOf(type, a, b) {
    return type === "add" ? `A${a}+${b}` : `S${a}-${b}`;
  }

  /**
   * 学習ログの 設問ID（items[].q）。
   *
   * 設問IDの生成規則（仕様書 §2.10）にしたがい、**しき その ものを ID とする**
   * （`8+7` / `13-9` / `25+8` / `48-9`）。20文字以内で 日本語を ふくまないため
   * ハッシュ化は しない。しきは それ自体が 安定した 識別子であり、
   * けいさんカード（`8+5`）・100マス計算（`8+9`）と 同じ かたちに なるので、
   * 教師が アプリを またいで 「どの しきで つまずいたか」を たどれる。
   *
   * このアプリの 習熟度マップの キー（`A8+7` / `S13-9`）は アプリ内部の ものなので、
   * 設問IDには つかわず `ext.factKeys` に 併記する。
   */
  function problemId(p) {
    const plus = p.op ? p.op === "+" : (p.type === "add" || p.type === "dev-add" || p.type === "free-add");
    return `${p.a}${plus ? "+" : "-"}${p.b}`;
  }

  /** にがてカードを 35%の かくりつで まぜる 適応出題 */
  function pickFact(type) {
    const pool = type === "add" ? ADD_FACTS : SUB_FACTS;
    const prefix = type === "add" ? "A" : "S";
    const weak = Store.weakFacts(prefix);
    if (weak.length > 0 && Math.random() < 0.35) {
      const key = pick(weak);
      const m = key.match(/^[AS](\d+)[+-](\d+)$/);
      if (m) return [Number(m[1]), Number(m[2])];
    }
    return pick(pool);
  }

  /**
   * じぶんで いれた しきを もんだいに する。
   * きょうかしょの さくせんが そのまま つかえる かたち（9＋4・13−9・25＋8・33−6）なら
   * これまでと おなじ さくらんぼの ステップを つかい、それいがいは
   * 「10の まとまりで かんがえる」ステップを くみたてる。
   */
  function makeFreeProblem(a, op, b, method) {
    const aT = Math.floor(a / 10), aO = a % 10;
    const bT = Math.floor(b / 10), bO = b % 10;
    const base = { a, b, op, aT, aO, bT, bO, free: true };

    if (op === "+") {
      if (a <= 9 && b <= 9 && a + b >= 11) {
        return { ...base, type: "add", answer: a + b, cherry: "b" };
      }
      if (a >= 10 && b <= 9 && aO >= 1 && aO + b >= 11) {
        return { ...base, type: "dev-add", tens: aT, ones: aO, answer: a + b, cherry: "b" };
      }
      // 2けたを たす ときだけ さくらんぼで 「10と ばら」に わけて 見せる
      return { ...base, type: "free-add", answer: a + b, cherry: bT > 0 && bO > 0 ? "b" : "none" };
    }

    if (b <= 9 && bO > aO) {
      if (a >= 11 && a <= 18) {
        const type = method === "gengen" ? "gengen" : "genka";
        return { ...base, type, answer: a - b, cherry: type === "genka" ? "a" : "b" };
      }
      if (a >= 20 && aO >= 1) {
        return { ...base, type: "dev-sub", tens: aT, ones: aO, answer: a - b, cherry: "b" };
      }
    }
    return { ...base, type: "free-sub", answer: a - b, cherry: bT > 0 && bO > 0 ? "b" : "none" };
  }

  function generateProblem(mode) {
    if (mode === "free") return state.freeProblem;
    for (let tries = 0; tries < 30; tries++) {
      let p;
      if (mode === "add") {
        const [a, b] = pickFact("add");
        p = { type: "add", a, b, answer: a + b, factKey: factKeyOf("add", a, b) };
      } else if (mode === "genka" || mode === "gengen" || mode === "mix") {
        const [a, b] = pickFact("sub");
        const method = mode === "mix" ? (Math.random() < 0.5 ? "genka" : "gengen") : mode;
        p = { type: method, a, b, answer: a - b, factKey: factKeyOf("sub", a, b) };
      } else if (mode === "timed") {
        if (Math.random() < 0.5) {
          const [a, b] = pickFact("add");
          p = { type: "timed", op: "+", a, b, answer: a + b, factKey: factKeyOf("add", a, b) };
        } else {
          const [a, b] = pickFact("sub");
          p = { type: "timed", op: "−", a, b, answer: a - b, factKey: factKeyOf("sub", a, b) };
        }
      } else {
        // はってん: 2けた±1けた
        const kind = mode === "dev-mix" ? (Math.random() < 0.5 ? "dev-add" : "dev-sub") : mode;
        const tens = randInt(2, 7); // 十のくらいは 2以上（きほんもんだいと かぶらないように）
        if (kind === "dev-add") {
          const ones = randInt(2, 9);
          const b = randInt(Math.max(2, 11 - ones), 9);
          const a = tens * 10 + ones;
          // 基本カード ones+b も いっしょに きたえられる
          p = { type: "dev-add", a, b, tens, ones, answer: a + b, factKey: factKeyOf("add", ones, b) };
        } else {
          const ones = randInt(1, 8);
          const b = randInt(ones + 1, 9);
          const a = tens * 10 + ones;
          p = { type: "dev-sub", a, b, tens, ones, answer: a - b, factKey: factKeyOf("sub", 10 + ones, b) };
        }
      }
      const key = `${p.type}:${p.a}:${p.b}`;
      if (key !== state.lastKey || tries === 29) { state.lastKey = key; return p; }
    }
  }

  // ---------- もんだいの 描画 ----------
  let frameSlots = [];
  let looseSlots = [];
  let cherry = null;
  let eqAnsEl = null;
  let eqEls = { a: null, b: null };   // しきの かず（しるしを つける あいて）

  function eqNum(v) {
    const el = document.createElement("span");
    el.className = "eq-num";
    el.textContent = v;
    return el;
  }

  function eqOp(v) {
    const el = document.createElement("span");
    el.className = "eq-op";
    el.textContent = v;
    return el;
  }

  function eqGroup(numEl, cherryObj) {
    const g = document.createElement("div");
    g.className = "eq-group";
    g.appendChild(numEl);
    if (cherryObj) g.appendChild(cherryObj.root);
    return g;
  }

  function buildEquation(p) {
    const eq = $("#equation");
    eq.innerHTML = "";
    eqAnsEl = document.createElement("span");
    eqAnsEl.className = "eq-ans";
    eqAnsEl.textContent = "?";
    eqEls = { a: eqNum(p.a), b: eqNum(p.b) };

    const opText = p.op || (p.type === "add" || p.type === "dev-add" ? "+" : "−");

    if (p.type === "timed" || p.cherry === "none") {
      cherry = null;
      eq.appendChild(eqGroup(eqEls.a, null));
      eq.appendChild(eqOp(opText));
      eq.appendChild(eqGroup(eqEls.b, null));
      eq.appendChild(eqOp("="));
      eq.appendChild(eqGroup(eqAnsEl, null));
      Marks.reset(eq);
      return;
    }

    cherry = Blocks.makeCherry();
    // さくらんぼの位置: げんかほう→まえの数 / それ以外→うしろの数
    const cherryOnA = p.cherry ? p.cherry === "a" : p.type === "genka";
    eq.appendChild(eqGroup(eqEls.a, cherryOnA ? cherry : null));
    eq.appendChild(eqOp(opText));
    eq.appendChild(eqGroup(eqEls.b, cherryOnA ? null : cherry));
    eq.appendChild(eqOp("="));
    eq.appendChild(eqGroup(eqAnsEl, null));
    // しるしを のせる いたを しきの うえに おきなおす
    Marks.reset(eq);
  }

  // ---------- ステップ作成 ----------
  function buildSteps(p) {
    const rodArea = $("#rod-area");
    const frameArea = $("#frame-area");
    const looseArea = $("#loose-area");
    rodArea.innerHTML = "";
    frameArea.innerHTML = "";
    frameArea.hidden = false;
    looseArea.innerHTML = "";

    if (p.type === "timed") {
      frameSlots = [];
      looseSlots = [];
      return [{
        prompt: "こたえは いくつかな？",
        answer: p.answer,
        hint: "",
      }];
    }

    /** 10の まとまりの あいている ところの うち いちばん まえ */
    const nextEmpty = () => frameSlots.find((s) => !s.querySelector(".block"));

    /** ブロックを 1こ とる（タップ1かい ぶん） */
    const takeOne = async (slot) => { Sound.move(); await Blocks.flyAway(slot); };

    if (p.type === "free-add") return freeAddSteps(p, { rodArea, frameArea, looseArea, nextEmpty });
    if (p.type === "free-sub") return freeSubSteps(p, { rodArea, frameArea, looseArea, takeOne });

    if (p.type === "add") {
      // きょうかしょの「けいさんの しかた」（9＋4）
      //  ❶ 9は あと 1で 10。  ❷ 4を 1と 3に わける。
      //  ❸ 9に 1を たすと 10。 ❹ 10と 3で 13。
      const comp = 10 - p.a;
      const rest = p.b - comp;
      let splitParts = null;
      let tenLoop = null;
      frameSlots = Blocks.renderTenFrame(frameArea, p.a, "c-orange", "10の まとまり");
      looseSlots = Blocks.renderLoose(looseArea, p.b, "c-blue", "ばら");
      const empties = frameSlots.filter((s) => !s.querySelector(".block"));
      return [
        {
          prompt: `${p.a}は あと いくつで 10かな？`,
          answer: comp,
          hint: "10の まとまりの あいている ところを タップして かぞえてみよう！",
          recite: () => `${p.a}は あと ${comp}で 10。`,
          before() { Blocks.highlight(empties, true); enableCount(empties); },
          async after() {
            Blocks.highlight(empties, false);
            cherry.setLeft(comp);
          },
        },
        {
          prompt: `${p.b}を ${comp}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${comp}を とると のこりは いくつかな？`,
          recite: () => `${p.b}を ${comp}と ${rest}に わける。`,
          async after() {
            cherry.setRight(rest);
            splitParts = Blocks.splitLoose(looseArea, comp, rest, "c-blue");
            looseSlots = splitParts.all;
            await wait(400);
          },
        },
        {
          // じぶんの てで 10の まとまりを かんせいさせてから こたえる
          task: {
            text: `わけた ${comp}こを タップして 10の まとまりに いれよう！`,
            need: comp,
            get slots() { return splitParts.left; },
            async act(slot) { Sound.move(); await Blocks.flyBlock(slot, nextEmpty(), "c-blue"); },
            async done() {
              Blocks.tidyLoose(looseArea);
              Sound.correct();
              await Blocks.flashFrame(frameArea);
            },
          },
          prompt: `${p.a}に ${comp}を たすと いくつかな？`,
          answer: 10,
          hint: "まとまりが いっぱいに なったね。まとまりの ブロックは いくつかな？",
          recite: () => `${p.a}に ${comp}を たすと 10。`,
          before() { Marks.focus([eqEls.a, cherry.leftEl]); },
          async after() {
            Marks.unfocus();
            // 「9と 1で 10」を わで かこんで のこす
            await wait(260);
            tenLoop = Marks.loop([eqEls.a, cherry.leftEl], { label: "10" });
          },
        },
        {
          prompt: `10と ${rest}で いくつかな？`,
          answer: p.answer,
          hint: "10の まとまりと ばらの かずを たせば いいね！",
          recite: () => `10と ${rest}で ${p.answer}。`,
          before() {
            Blocks.pulseBlocks(frameSlots.concat(looseSlots), true);
            Marks.focus([tenLoop && tenLoop.label, cherry.rightEl]);
          },
          async after() {
            Blocks.pulseBlocks(frameSlots.concat(looseSlots), false);
            Marks.unfocus();
          },
        },
      ];
    }

    if (p.type === "genka") {
      // 13−9 →「10から ひいて たす さくせん」（きょうかしょの けいさんの しかた）
      //  ❶ 3から 9は ひけない。   ❷ 13を 10と 3に わける。
      //  ❸ 10から 9を ひくと 1。  ❹ 1と 3で 4。
      const ones = p.a - 10;
      const left = 10 - p.b;
      let leftEl = null;   // 10の 下に かきこんだ のこりの かず
      frameSlots = Blocks.renderTenFrame(frameArea, 10, "c-orange", "10の まとまり");
      looseSlots = Blocks.renderLoose(looseArea, ones, "c-orange", "ばら");
      return [
        {
          lead: `${ones}から ${p.b}は ひけない。`,
          prompt: `ばらの ${ones}から ${p.b}は ひけないね。${p.a}を 10と いくつに わけるかな？`,
          answer: ones,
          hint: "10の まとまりの そとの ばらを タップして かぞえてみよう！",
          recite: () => `${p.a}を 10と ${ones}に わける。`,
          before() { Blocks.pulseBlocks(looseSlots, true); enableCount(looseSlots); },
          async after() {
            Blocks.pulseBlocks(looseSlots, false);
            cherry.setLeft(10);
            cherry.setRight(ones);
          },
        },
        {
          // さきに ブロックを とってから、のこりを かぞえて こたえる
          task: {
            text: `10の まとまりから ブロックを ${p.b}こ タップして とろう！`,
            need: p.b,
            slots: frameSlots,
            fromEnd: true,
            act: takeOne,
          },
          prompt: `10から ${p.b}を ひくと いくつかな？`,
          answer: left,
          hint: "まとまりに のこった ブロックを タップして かぞえよう！",
          recite: () => `10から ${p.b}を ひくと ${left}。`,
          before() { enableCount(frameSlots); Marks.focus([cherry.leftEl, eqEls.b]); },
          async after() {
            Marks.unfocus();
            // つかった 9に いろを つけ、10に ななめ線、その下に のこりの 1
            Marks.tint(eqEls.b);
            Marks.strike(cherry.leftEl);
            leftEl = Marks.under(cherry.leftEl, left);
          },
        },
        {
          prompt: `のこった ${left}と ${ones}で いくつかな？`,
          answer: p.answer,
          hint: "のこりの ブロックを タップして ぜんぶ かぞえてみよう！",
          recite: () => `${left}と ${ones}で ${p.answer}。`,
          before() {
            const all = frameSlots.concat(looseSlots);
            Blocks.pulseBlocks(all, true);
            enableCount(all);
            // 「1と 3で 4」を むすんで 見せる（けした 10は そとがわに のこす）
            Marks.tie(leftEl, cherry.rightEl);
            Marks.focus([leftEl, cherry.rightEl]);
          },
          async after() {
            Blocks.pulseBlocks(frameSlots.concat(looseSlots), false);
            Marks.unfocus();
          },
        },
      ];
    }

    if (p.type === "gengen") {
      // 13−9 →「ばらから ひいて 10から ひく さくせん」
      //  ❶ 3から 9は ひけない。   ❷ 9を 3と 6に わける。
      //  ❸ 13から 3を ひくと 10。 ❹ 10から 6を ひくと 4。
      const ones = p.a - 10;
      const rest = p.b - ones;
      let tenLoop = null;
      frameSlots = Blocks.renderTenFrame(frameArea, 10, "c-orange", "10の まとまり");
      looseSlots = Blocks.renderLoose(looseArea, ones, "c-orange", "ばら");
      return [
        {
          lead: `${ones}から ${p.b}は ひけない。`,
          prompt: `ばらの ${ones}から ${p.b}は ひけないね。さきに ばらの ${ones}を ひくよ。${p.b}を ${ones}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${ones}を とると のこりは いくつかな？`,
          recite: () => `${p.b}を ${ones}と ${rest}に わける。`,
          before() { Blocks.pulseBlocks(looseSlots, true); },
          async after() {
            Blocks.pulseBlocks(looseSlots, false);
            cherry.setLeft(ones);
            cherry.setRight(rest);
          },
        },
        {
          task: {
            text: `ばらの ブロックを ${ones}こ ぜんぶ タップして とろう！`,
            need: ones,
            slots: looseSlots,
            act: takeOne,
            async done() { Sound.correct(); await Blocks.flashFrame(frameArea); },
          },
          prompt: `${p.a}から ${ones}を ひくと いくつかな？`,
          answer: 10,
          hint: "ばらが なくなって、きれいな 10の まとまりに なったね！",
          recite: () => `${p.a}から ${ones}を ひくと 10。`,
          before() { Marks.focus([eqEls.a, cherry.leftEl]); },
          async after() {
            Marks.unfocus();
            await wait(260);
            // 「13から 3を ひいて 10」を わで かこんで のこす
            tenLoop = Marks.loop([eqEls.a, cherry.leftEl], { label: "10" });
          },
        },
        {
          task: {
            text: `つぎは 10の まとまりから ${rest}こ タップして とろう！`,
            need: rest,
            slots: frameSlots,
            fromEnd: true,
            act: takeOne,
          },
          prompt: `10から ${rest}を ひくと いくつかな？`,
          answer: p.answer,
          hint: "まとまりに のこった ブロックを タップして かぞえよう！",
          recite: () => `10から ${rest}を ひくと ${p.answer}。`,
          before() {
            enableCount(frameSlots);
            Marks.focus([tenLoop && tenLoop.label, cherry.rightEl]);
          },
          async after() { Marks.unfocus(); },
        },
      ];
    }

    if (p.type === "dev-add") {
      // 25+8 → ❶ 25は あと5で 30。❷ 8を 5と3に わける。
      //         ❸ 25に 5を たすと 30。❹ 30と 3で 33。
      const comp = 10 - p.ones;
      const rest = p.b - comp;
      const next10 = (p.tens + 1) * 10;
      let splitParts = null;
      let tenLoop = null;
      Blocks.renderRods(rodArea, p.tens, "10の ぼう");
      frameSlots = Blocks.renderTenFrame(frameArea, p.ones, "c-orange", "10の まとまり");
      looseSlots = Blocks.renderLoose(looseArea, p.b, "c-blue", "ばら");
      const empties = frameSlots.filter((s) => !s.querySelector(".block"));
      return [
        {
          prompt: `${p.a}は あと いくつで ${next10}かな？`,
          answer: comp,
          hint: "10の まとまりの あいている ところを タップして かぞえてみよう！",
          recite: () => `${p.a}は あと ${comp}で ${next10}。`,
          before() { Blocks.highlight(empties, true); enableCount(empties); },
          async after() {
            Blocks.highlight(empties, false);
            cherry.setLeft(comp);
          },
        },
        {
          prompt: `${p.b}を ${comp}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${comp}を とると のこりは いくつかな？`,
          recite: () => `${p.b}を ${comp}と ${rest}に わける。`,
          async after() {
            cherry.setRight(rest);
            splitParts = Blocks.splitLoose(looseArea, comp, rest, "c-blue");
            looseSlots = splitParts.all;
            await wait(400);
          },
        },
        {
          task: {
            text: `わけた ${comp}こを タップして 10の まとまりに いれよう！`,
            need: comp,
            get slots() { return splitParts.left; },
            async act(slot) { Sound.move(); await Blocks.flyBlock(slot, nextEmpty(), "c-blue"); },
            async done() {
              Blocks.tidyLoose(looseArea);
              Sound.correct();
              await Blocks.flashFrame(frameArea);
              // 10こ そろった まとまりが 10のぼうに がったい！
              await Blocks.collapseFrameToRod(frameSlots, rodArea);
            },
          },
          prompt: `${p.a}に ${comp}を たすと いくつかな？`,
          answer: next10,
          hint: `10のぼうが ${p.tens + 1}ほんに なったね！`,
          recite: () => `${p.a}に ${comp}を たすと ${next10}。`,
          before() { Marks.focus([eqEls.a, cherry.leftEl]); },
          async after() {
            Marks.unfocus();
            await wait(260);
            tenLoop = Marks.loop([eqEls.a, cherry.leftEl], { label: String(next10) });
          },
        },
        {
          prompt: `${next10}と ${rest}で いくつかな？`,
          answer: p.answer,
          hint: `10のぼうが ${p.tens + 1}ほんと ばらが ${rest}こ だね！`,
          recite: () => `${next10}と ${rest}で ${p.answer}。`,
          before() { Marks.focus([tenLoop && tenLoop.label, cherry.rightEl]); },
          async after() { Marks.unfocus(); },
        },
      ];
    }

    // dev-sub: 33−6 →「ばらから ひいて 10から ひく さくせん」
    //  ❶ 3から 6は ひけない。   ❷ 6を 3と 3に わける。
    //  ❸ 33から 3を ひくと 30。 ❹ 30から 3を ひくと 27。
    const rest = p.b - p.ones;
    const tens10 = p.tens * 10;
    let tenLoop = null;
    Blocks.renderRods(rodArea, p.tens, "10の ぼう");
    frameSlots = Blocks.renderTenFrame(frameArea, 0, "c-orange", "10の まとまり");
    frameArea.hidden = true; // ぼうを ばらす ステップまで かくす
    looseSlots = Blocks.renderLoose(looseArea, p.ones, "c-orange", "ばら");
    return [
      {
        lead: `${p.ones}から ${p.b}は ひけない。`,
        prompt: `ばらの ${p.ones}から ${p.b}は ひけないね。さきに ばらの ${p.ones}を ひくよ。${p.b}を ${p.ones}と いくつに わけるかな？`,
        answer: rest,
        hint: `${p.b}から ${p.ones}を とると のこりは いくつかな？`,
        recite: () => `${p.b}を ${p.ones}と ${rest}に わける。`,
        before() { Blocks.pulseBlocks(looseSlots, true); },
        async after() {
          Blocks.pulseBlocks(looseSlots, false);
          cherry.setLeft(p.ones);
          cherry.setRight(rest);
        },
      },
      {
        task: {
          text: `ばらの ブロックを ${p.ones}こ ぜんぶ タップして とろう！`,
          need: p.ones,
          slots: looseSlots,
          act: takeOne,
        },
        prompt: `${p.a}から ${p.ones}を ひくと いくつかな？`,
        answer: tens10,
        hint: `ばらが なくなって 10のぼうだけに なったね！`,
        recite: () => `${p.a}から ${p.ones}を ひくと ${tens10}。`,
        before() { Marks.focus([eqEls.a, cherry.leftEl]); },
        async after() {
          Marks.unfocus();
          await wait(260);
          tenLoop = Marks.loop([eqEls.a, cherry.leftEl], { label: String(tens10) });
        },
      },
      {
        task: {
          setupText: "10のぼうを 1ぽん ばらして まとまりに もどすよ！",
          text: `まとまりから ブロックを ${rest}こ タップして とろう！`,
          need: rest,
          slots: frameSlots,
          fromEnd: true,
          async setup() {
            frameArea.hidden = false;
            await Blocks.breakRodToFrame(rodArea, frameSlots, "c-orange");
          },
          act: takeOne,
        },
        prompt: `${tens10}から ${rest}を ひくと いくつかな？`,
        answer: p.answer,
        hint: "10のぼうの かずと、まとまりに のこった かずを あわせて かんがえよう！",
        recite: () => `${tens10}から ${rest}を ひくと ${p.answer}。`,
        before() {
          enableCount(frameSlots);
          Marks.focus([tenLoop && tenLoop.label, cherry.rightEl]);
        },
        async after() { Marks.unfocus(); },
      },
    ];
  }

  // ---------- じぶんで いれた しきの ステップ ----------
  /*
     きょうかしょの さくせんが そのまま つかえない しき（3＋4・23＋14・42−17 …）を
     「10の まとまり（10の ぼう）から じゅんばんに」 かんがえる ステップに ばらす。
       たしざん: ❶ 10の ぼうを たす → ❷ ばらを たす（いっぱいに なったら ぼうに する）
       ひきざん: ❶ 10の ぼうを ひく → ❷ ばらを ひく（たりなければ ぼうを 1ぽん ばらす）
  */

  /** ステップが 1つも できない しき（5＋0 など）の ための ふつうの 1もん */
  function plainStep(p) {
    return [{
      prompt: "こたえは いくつかな？",
      answer: p.answer,
      hint: "ブロックを タップして かぞえてみよう！",
      recite: () => `${p.a}${p.op === "+" ? "＋" : "−"}${p.b}は ${p.answer}。`,
      before() { enableCount(frameSlots.concat(looseSlots)); },
    }];
  }

  function freeAddSteps(p, ctx) {
    const { rodArea, frameArea, looseArea, nextEmpty } = ctx;
    const steps = [];
    const addTens = p.bT * 10;
    const afterTens = p.a + addTens;      // 10の ぼうを たしおわった ときの かず
    const carry = p.aO + p.bO >= 11;

    // 10の ぼう（じぶんの かず）と、たす ぶんの ぼうを ならべる
    const mine = p.bT > 0 || p.aT > 0
      ? Blocks.addRodGroup(rodArea, p.aT, "10の ぼう")
      : { group: null, slots: [] };
    const adding = p.bT > 0
      ? Blocks.addRodGroup(rodArea, p.bT, "たす 10の ぼう", { append: true })
      : null;
    frameSlots = Blocks.renderTenFrame(frameArea, p.aO, "c-orange", "10の まとまり");
    looseSlots = p.bO > 0 ? Blocks.renderLoose(looseArea, p.bO, "c-blue", "たす ばら") : [];

    // 2けたを たす ときは さくらんぼで 「10と ばら」に わけて 見せる
    if (cherry && p.bT > 0 && p.bO > 0) { cherry.setLeft(addTens); cherry.setRight(p.bO); }

    let splitParts = null;
    const comp = 10 - p.aO;               // 10の まとまりを いっぱいに するのに いる かず
    const rest = p.bO - comp;
    const next10 = afterTens + comp;

    if (p.bT > 0) {
      steps.push({
        lead: p.bO > 0 ? `${p.b}を ${addTens}と ${p.bO}に わける。` : null,
        task: {
          text: `たす 10の ぼうを ${p.bT}ほん タップして いれよう！`,
          need: p.bT,
          slots: adding.slots,
          itemSel: ".ten-rod",
          async act(slot) { Sound.move(); await Blocks.moveRod(slot, mine.group); },
          async done() {
            adding.group.parentElement.remove();
            Sound.correct();
          },
        },
        prompt: `${p.a}に ${addTens}を たすと いくつかな？`,
        answer: afterTens,
        hint: `10の ぼうが ${p.aT + p.bT}ほんに なったね！`,
        recite: () => `${p.a}に ${addTens}を たすと ${afterTens}。`,
        async after() {
          // ばらに くりあがりが ある ときは、ここで ばらを わけて 見せる
          if (carry) {
            splitParts = Blocks.splitLoose(looseArea, comp, rest, "c-blue");
            looseSlots = splitParts.all;
            await wait(400);
          }
        },
      });
    }

    if (p.bO > 0 && !carry) {
      const full = p.aO + p.bO === 10;
      const hasRod = p.aT + p.bT > 0;
      steps.push({
        task: {
          text: `ばらの ${p.bO}こを タップして 10の まとまりに いれよう！`,
          need: p.bO,
          slots: looseSlots,
          async act(slot) { Sound.move(); await Blocks.flyBlock(slot, nextEmpty(), "c-blue"); },
          async done() {
            Blocks.tidyLoose(looseArea);
            if (!full) return;
            Sound.correct();
            await Blocks.flashFrame(frameArea);
            if (hasRod) await Blocks.collapseFrameToRod(frameSlots, rodArea);
          },
        },
        prompt: `${afterTens}に ${p.bO}を たすと いくつかな？`,
        answer: p.answer,
        hint: full ? "10の まとまりが いっぱいに なったね！" : "10の まとまりの ブロックを タップして かぞえてみよう！",
        recite: () => `${afterTens}に ${p.bO}を たすと ${p.answer}。`,
        before() { if (!full) enableCount(frameSlots); },
      });
    }

    if (carry) {
      steps.push({
        lead: `${p.bO}を ${comp}と ${rest}に わける。`,
        task: {
          text: `わけた ${comp}こを タップして 10の まとまりに いれよう！`,
          need: comp,
          get slots() { return splitParts.left; },
          async act(slot) { Sound.move(); await Blocks.flyBlock(slot, nextEmpty(), "c-blue"); },
          async done() {
            Blocks.tidyLoose(looseArea);
            Sound.correct();
            await Blocks.flashFrame(frameArea);
            await Blocks.collapseFrameToRod(frameSlots, rodArea);
          },
        },
        prompt: `${afterTens}に ${comp}を たすと いくつかな？`,
        answer: next10,
        hint: `10の ぼうが ${Math.floor(next10 / 10)}ほんに なったね！`,
        recite: () => `${afterTens}に ${comp}を たすと ${next10}。`,
      });
      steps.push({
        prompt: `${next10}と ${rest}で いくつかな？`,
        answer: p.answer,
        hint: "10の ぼうの かずと、のこった ばらを あわせて かんがえよう！",
        recite: () => `${next10}と ${rest}で ${p.answer}。`,
        before() { Blocks.pulseBlocks(looseSlots, true); },
        async after() { Blocks.pulseBlocks(looseSlots, false); },
      });
    }

    return steps.length ? steps : plainStep(p);
  }

  function freeSubSteps(p, ctx) {
    const { rodArea, frameArea, looseArea, takeOne } = ctx;
    const steps = [];
    const subTens = p.bT * 10;
    const afterTens = p.a - subTens;      // 10の ぼうを ひきおわった ときの かず
    const borrow = p.bO > p.aO;

    // 1けたの かずは 10の まとまりに いれて 見せると かぞえやすい
    const inFrame = p.aT === 0;
    const mine = p.aT > 0
      ? Blocks.addRodGroup(rodArea, p.aT, "10の ぼう")
      : { group: null, slots: [] };
    frameSlots = Blocks.renderTenFrame(frameArea, inFrame ? p.a : 0, "c-orange", "10の まとまり");
    if (!inFrame) frameArea.hidden = true;  // ぼうを ばらす ときに 出てくる
    looseSlots = !inFrame && p.aO > 0
      ? Blocks.renderLoose(looseArea, p.aO, "c-orange", "ばら")
      : [];

    if (cherry && p.bT > 0 && p.bO > 0) { cherry.setLeft(subTens); cherry.setRight(p.bO); }

    if (p.bT > 0) {
      steps.push({
        lead: p.bO > 0 ? `${p.b}を ${subTens}と ${p.bO}に わける。` : null,
        task: {
          text: `10の ぼうを ${p.bT}ほん タップして とろう！`,
          need: p.bT,
          slots: mine.slots,
          itemSel: ".ten-rod",
          fromEnd: true,
          async act(slot) { Sound.move(); await Blocks.flyRodAway(slot); },
        },
        prompt: `${p.a}から ${subTens}を ひくと いくつかな？`,
        answer: afterTens,
        hint: `10の ぼうが ${p.aT - p.bT}ほんに なったね！`,
        recite: () => `${p.a}から ${subTens}を ひくと ${afterTens}。`,
      });
    }

    if (p.bO > 0 && !borrow) {
      // ばらから そのまま ひける
      const from = inFrame ? frameSlots : looseSlots;
      steps.push({
        task: {
          text: inFrame
            ? `ブロックを ${p.bO}こ タップして とろう！`
            : `ばらの ブロックを ${p.bO}こ タップして とろう！`,
          need: p.bO,
          slots: from,
          fromEnd: true,
          act: takeOne,
        },
        prompt: `${afterTens}から ${p.bO}を ひくと いくつかな？`,
        answer: p.answer,
        hint: "のこった ブロックを タップして かぞえよう！",
        recite: () => `${afterTens}から ${p.bO}を ひくと ${p.answer}。`,
        before() { enableCount(from); },
      });
    }

    if (p.bO > 0 && borrow) {
      const rest = p.bO - p.aO;           // ぼうを ばらして から ひく ぶん
      const tens10 = afterTens - p.aO;    // ばらを ぜんぶ ひいた ときの なん10
      if (p.aO > 0) {
        steps.push({
          lead: `${p.bO}を ${p.aO}と ${rest}に わける。`,
          task: {
            text: `ばらの ブロックを ${p.aO}こ ぜんぶ タップして とろう！`,
            need: p.aO,
            slots: looseSlots,
            act: takeOne,
          },
          prompt: `${afterTens}から ${p.aO}を ひくと いくつかな？`,
          answer: tens10,
          hint: "ばらが なくなって 10の ぼうだけに なったね！",
          recite: () => `${afterTens}から ${p.aO}を ひくと ${tens10}。`,
        });
      }
      steps.push({
        task: {
          setupText: "10の ぼうを 1ぽん ばらして まとまりに もどすよ！",
          text: `まとまりから ブロックを ${rest}こ タップして とろう！`,
          need: rest,
          slots: frameSlots,
          fromEnd: true,
          async setup() {
            frameArea.hidden = false;
            await Blocks.breakRodToFrame(rodArea, frameSlots, "c-orange");
          },
          act: takeOne,
        },
        prompt: `${tens10}から ${rest}を ひくと いくつかな？`,
        answer: p.answer,
        hint: "10の ぼうの かずと、まとまりに のこった かずを あわせて かんがえよう！",
        recite: () => `${tens10}から ${rest}を ひくと ${p.answer}。`,
        before() { enableCount(frameSlots); },
      });
    }

    return steps.length ? steps : plainStep(p);
  }

  // ---------- ブロックそうさ（じぶんの てで うごかす） ----------
  let countSlots = [];

  /**
   * ブロックを タップして うごかす／とる フェーズ。
   * ぜんぶ そうさし おわるまで こたえは にゅうりょくできない。
   * じぶんの てで うごかすことで、しきの いみが てざわりとして のこる。
   */
  function runTask(task) {
    const sess = state.session;
    return new Promise((resolve) => {
      const bar = $("#task-bar");
      const remainEl = $("#task-remain");
      const autoBtn = $("#btn-task-auto");
      let done = 0;
      let busy = false;
      let hintTimer = 0;
      let finished = false;
      let slots = [];
      // ブロック（.block）だけでなく 10の ぼう（.ten-rod）も おなじ しくみで うごかす
      const itemSel = task.itemSel || ".block";

      const paint = () => {
        remainEl.innerHTML = `あと <b>${task.need - done}</b>${itemSel === ".ten-rod" ? "ほん" : "こ"}`;
      };

      const armHint = () => {
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => Blocks.hintNext(slots, true, task.fromEnd, itemSel), 4000);
      };

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(hintTimer);
        Blocks.disableTap(slots);
        autoBtn.onclick = null;
        bar.hidden = true;
        document.body.classList.remove("task-mode");
        state.task = null;
      };

      // やめた ときに 呼ばれて、まちを といてくれる
      state.task = { cancel: () => { cleanup(); resolve(); } };

      const tap = async (slot) => {
        if (finished || busy || done >= task.need) return;
        if (!slot.querySelector(itemSel)) return;
        busy = true;
        clearTimeout(hintTimer);
        Blocks.hintNext(slots, false, false, itemSel);
        await task.act(slot, done);
        if (sess !== state.session) return;
        // そうさ ずみの ところは もう ひからせない
        Blocks.disableTap([slot]);
        done++;
        paint();
        busy = false;
        if (done >= task.need) {
          cleanup();
          if (task.done) await task.done();
          if (sess !== state.session) return;
          resolve();
        } else {
          armHint();
        }
      };

      (async () => {
        state.accepting = false;
        document.body.classList.add("task-mode");
        setFeedback("", "");
        bar.hidden = false;
        remainEl.innerHTML = "";
        $("#prompt").textContent = task.setupText || task.text;
        if (task.setup) await task.setup();
        if (sess !== state.session) return;
        $("#prompt").textContent = task.text;
        slots = task.slots.filter((s) => s.querySelector(itemSel));
        paint();
        Blocks.enableTap(slots, tap);
        armHint();
        // まとめて うごかしたい ときの たすけぶね（補助ツールを つかった ことを のこす）
        autoBtn.onclick = async () => {
          StudySession.usedHint();
          while (!finished && done < task.need) {
            const s = Blocks.nextTarget(slots, task.fromEnd, itemSel);
            if (!s) break;
            await tap(s);
            if (sess !== state.session) return;
          }
        };
      })();
    });
  }

  function cancelTask() {
    if (state.task) state.task.cancel();
    $("#task-bar").hidden = true;
    document.body.classList.remove("task-mode");
  }

  /** ブロック（や あきマス）を タップして 1・2・3… と かぞえられるようにする */
  function enableCount(slots) {
    let n = 0;
    const order = [];
    slots.forEach((s) => {
      s.classList.add("countable");
      s._count = () => {
        if (!state.accepting) return;
        Sound.tap();
        if (s.dataset.cn) {
          // かぞえまちがえたら タップで さいしょから
          order.forEach((x) => { Blocks.setCountBadge(x, null); delete x.dataset.cn; });
          order.length = 0;
          n = 0;
          return;
        }
        n++;
        s.dataset.cn = n;
        order.push(s);
        Blocks.setCountBadge(s, n);
      };
      s.addEventListener("click", s._count);
      countSlots.push(s);
    });
  }

  function clearCounting() {
    countSlots.forEach((s) => {
      s.classList.remove("countable");
      if (s._count) { s.removeEventListener("click", s._count); s._count = null; }
      delete s.dataset.cn;
      Blocks.setCountBadge(s, null);
    });
    countSlots = [];
  }

  // ---------- れんしゅうの 進行 ----------
  function startMode(mode) {
    state.session++;
    state.mode = mode;
    state.setSolved = 0;
    state.streak = 0;
    updateStreak();
    // 学習ログ: ここから 1レコード（ガイドつきは 5もんの セット、タイムアタックは 1セッション）。
    // 「じぶんで しきを いれる」は きろく対象外なので begin() が うけつけない
    StudySession.begin(mode, mode === "timed" ? TIMED_COUNT : SET_SIZE);
    document.body.classList.toggle("timed-mode", mode === "timed");
    // じぶんの しきは 1もんずつ。ほしや れんぞくは かぞえない
    document.body.classList.toggle("free-mode", mode === "free");
    document.body.classList.toggle("explain-mode", isExplain());
    $("#explain-bar").hidden = true;

    if (mode === "timed") {
      state.timedIndex = 0;
      state.timedMisses = 0;
      $("#star-row").hidden = true;
      $("#timed-info").hidden = false;
      startTimer();
    } else {
      $("#star-row").hidden = mode === "free";
      $("#timed-info").hidden = true;
      stopTimer();
      if (mode !== "free") renderStars();
    }
    showScreen("play");
    nextProblem();
  }

  function startTimer() {
    state.timedStart = performance.now();
    stopTimer();
    state.timerId = setInterval(() => {
      const s = (performance.now() - state.timedStart) / 1000;
      $("#timed-clock").textContent = s.toFixed(1);
    }, 100);
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function nextProblem() {
    cancelTask();
    clearCounting();
    state.problem = generateProblem(state.mode);
    state.stepIndex = 0;
    state.wrongCount = 0;
    state.firstTry = true;
    StudySession.startProblem(problemId(state.problem), state.problem.type, state.problem.factKey);
    const badge = METHOD_LABELS[state.problem.type];
    $("#method-badge").innerHTML = badge ? `<span>${badge}</span>` : "";
    if (isTimed()) {
      $("#timed-progress").textContent = `${state.timedIndex + 1}/${TIMED_COUNT}`;
    }
    buildEquation(state.problem);
    state.steps = buildSteps(state.problem);
    showStep();
  }

  function currentStep() { return state.steps[state.stepIndex]; }

  async function showStep() {
    const step = currentStep();
    const sess = state.session;
    clearCounting();
    state.buffer = "";
    renderBuffer();
    setFeedback("", "");
    state.accepting = false;
    // さきに ブロックを うごかしてから、めのまえの けっかを 数字で こたえる
    if (step.task) {
      await runTask(step.task);
      if (sess !== state.session) return;
    }
    $("#prompt").textContent = step.prompt;
    step.before?.();
    // かぞえるための タップは せつめいモードでも つかえるように しておく
    state.accepting = true;
    if (isExplain()) showExplainStep(step);
  }

  /**
   * せつめいモード: こたえを 入力させず、
   * 「こたえを 見る」→ みんなで たしかめる →「つぎへ」で すすむ。
   * 電子黒板で 先生が といかけながら すすめる ための ながれ。
   */
  function showExplainStep(step) {
    const bar = $("#explain-bar");
    const btn = $("#btn-explain");
    const sess = state.session;
    state.revealed = false;
    bar.hidden = false;
    btn.textContent = "こたえを 見る";
    btn.onclick = async () => {
      if (sess !== state.session) return;
      if (!state.revealed) {
        state.revealed = true;
        state.buffer = String(step.answer);
        renderBuffer();
        Sound.correct();
        setFeedback(step.recite ? step.recite() : "そのとおり！", "good");
        btn.innerHTML = `つぎへ ${icon("next")}`;
        return;
      }
      btn.onclick = null;
      bar.hidden = true;
      state.accepting = false;
      clearCounting();
      await step.after?.();
      if (sess !== state.session) return;
      state.stepIndex++;
      if (state.stepIndex >= state.steps.length) problemDone();
      else showStep();
    };
  }

  function renderBuffer() {
    const el = $("#answer-display");
    el.textContent = state.buffer === "" ? "?" : state.buffer;
    el.classList.toggle("waiting", state.buffer === "");
  }

  function setFeedback(text, cls) {
    const fb = $("#feedback");
    fb.textContent = text;
    fb.className = cls;
  }

  function onDigit(d) {
    // せつめいモードは 「こたえを 見る」ボタンで すすむので 入力は うけつけない
    if (isExplain() || !state.accepting || state.buffer.length >= 2) return;
    Sound.tap();
    state.buffer += d;
    renderBuffer();
    const expectedLen = String(currentStep().answer).length;
    if (state.buffer.length >= expectedLen) check();
  }

  function onDelete() {
    if (isExplain() || !state.accepting) return;
    Sound.tap();
    state.buffer = state.buffer.slice(0, -1);
    renderBuffer();
  }

  function onOk() {
    if (isExplain() || !state.accepting || state.buffer === "") return;
    check();
  }

  async function check() {
    const step = currentStep();
    const val = Number(state.buffer);
    state.accepting = false;

    if (val === step.answer) {
      StudySession.answered(true);
      vibrate(30);
      if (!isTimed()) {
        Sound.correct();
        setFeedback(pick(PRAISES), "good");
      }
      const sess = state.session;
      await step.after?.();
      if (sess !== state.session) return; // アニメ中に やめた
      state.stepIndex++;
      if (state.stepIndex >= state.steps.length) problemDone();
      else showStep();
      return;
    }

    // まちがい
    StudySession.answered(false, state.buffer);
    Sound.wrong();
    vibrate([60, 40, 60]);
    state.wrongCount++;
    state.firstTry = false;
    state.streak = 0;
    updateStreak();
    if (isTimed()) state.timedMisses++;

    const disp = $("#answer-display");
    disp.classList.remove("shake");
    void disp.offsetWidth;
    disp.classList.add("shake");

    const sess = state.session;
    if (!isTimed() && state.wrongCount >= 3) {
      // 3回 まちがえたら こたえを 見せて すすむ（この もんだいは じぶんで とけていない）
      StudySession.usedAnswer();
      state.buffer = String(step.answer);
      renderBuffer();
      setFeedback(`こたえは ${step.answer} だよ。いっしょに すすもう！`, "bad");
      setTimeout(async () => {
        if (sess !== state.session) return; // すでに やめている
        await step.after?.();
        if (sess !== state.session) return;
        state.stepIndex++;
        if (state.stepIndex >= state.steps.length) problemDone();
        else showStep();
      }, 1400);
    } else {
      const showHint = !isTimed() && state.wrongCount === 2;
      if (showHint) StudySession.usedHint();
      const msg = showHint ? "ヒント：" + step.hint : "おしい！もういちど！";
      setFeedback(msg, "bad");
      state.buffer = "";
      setTimeout(() => {
        if (sess !== state.session) return;
        renderBuffer();
        state.accepting = true;
      }, 350);
    }
  }

  /** きょうかしょの「けいさんの しかた」を こたえあわせの ときに ふりかえる */
  function buildHowto(p) {
    const card = $("#howto-card");
    const lines = [];
    state.steps.forEach((s) => {
      if (s.lead) lines.push(s.lead);
      if (s.recite) lines.push(s.recite());
    });
    if (lines.length === 0) { card.hidden = true; return false; }
    const op = p.op ? (p.op === "+" ? "＋" : "−") : (p.type === "add" || p.type === "dev-add" ? "＋" : "−");
    $("#howto-title").textContent = `${p.a}${op}${p.b}の けいさんの しかた`;
    $("#howto-list").innerHTML = lines.map((t) => `<li>${t}</li>`).join("");
    card.hidden = false;
    return true;
  }

  function problemDone() {
    const p = state.problem;
    eqAnsEl.textContent = p.answer;
    eqAnsEl.classList.add("answered");
    Marks.unfocus();

    if (isTimed()) return timedProblemDone(p);

    // ---- ガイドつきモード ----
    // じぶんで いれた しきは きろく（レベル・にがてカード・学習ログ）に のこさない
    if (!isFree()) {
      const modeKey = p.type;
      if (state.firstTry) {
        state.streak++;
        Store.updateBest(modeKey, state.streak);
        if (state.streak >= 10) notifyBadge(Store.earnBadge("streak10"));
      }
      updateStreak();
      StudySession.setStreak(state.streak);
      StudySession.finishProblem();

      const xp = isDev() ? (state.firstTry ? 15 : 8) : (state.firstTry ? 10 : 5);
      const { events } = Store.recordProblem({
        mode: modeKey, factKey: p.factKey, success: state.firstTry, xp,
      });
      handleEvents(events);

      state.setSolved++;
      renderStars();
      // 学習ログ: 5もん そろった ところで 1レコード。
      // オーバーレイを 見ている あいだに タブを とじても のこるように、ここで 保存する
      if (state.setSolved >= SET_SIZE) StudySession.finish("completed");
    }

    Sound.fanfare();
    $("#correct-text").textContent = state.firstTry ? "せいかい！" : "できたね！";
    const overlay = $("#overlay-correct");
    const withHowto = buildHowto(p);
    overlay.classList.add("show");
    burstConfetti(32);

    // 「けいさんの しかた」が 出たときは 5びょうは かならず 見せる。
    // 5びょう たつと「つぎへ」ボタンが おせるようになる。
    const sess = state.session;
    let advanced = false;
    let timer = 0;
    let tick = 0;
    const go = () => {
      if (advanced) return;
      advanced = true;
      clearTimeout(timer);
      clearInterval(tick);
      overlay.onclick = null;
      overlay.classList.remove("show");
      if (sess !== state.session) return;
      if (isFree()) showFreeDone();
      else if (state.setSolved >= SET_SIZE) showSetComplete();
      else nextProblem();
    };

    if (withHowto) {
      const btn = $("#btn-howto-next");
      const label = $("#howto-next-label");
      const wait = $("#howto-wait");
      const bar = $("#howto-wait-bar");
      let left = HOWTO_READ_SEC;

      btn.disabled = true;
      btn.classList.remove("ready");
      label.textContent = `あと ${left}びょう`;
      btn.onclick = go;

      // まちじかんの バーを もんだいごとに はじめから うごかす
      wait.hidden = false;
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = `howto-wait-grow ${HOWTO_READ_SEC}s linear forwards`;

      tick = setInterval(() => {
        if (sess !== state.session) { clearInterval(tick); return; }
        left--;
        if (left > 0) {
          label.textContent = `あと ${left}びょう`;
          return;
        }
        clearInterval(tick);
        wait.hidden = true;
        btn.disabled = false;
        btn.classList.add("ready");
        label.innerHTML = `つぎへ ${icon("next")}`;
      }, 1000);
    } else {
      timer = setTimeout(go, 1400);
      overlay.onclick = go;
    }
  }

  function timedProblemDone(p) {
    Sound.correct();
    const { events } = Store.recordProblem({
      mode: "timed", factKey: p.factKey, success: state.firstTry, xp: 8,
    });
    handleEvents(events);
    StudySession.finishProblem();
    state.timedIndex++;
    if (state.timedIndex >= TIMED_COUNT) {
      finishTimed();
    } else {
      setFeedback(pick(PRAISES), "good");
      const sess = state.session;
      setTimeout(() => { if (sess === state.session) nextProblem(); }, 350);
    }
  }

  function finishTimed() {
    stopTimer();
    const ms = performance.now() - state.timedStart;
    const sec = ms / 1000;
    const prevBest = Store.data.modes.timed.bestMs;
    const { events } = Store.recordTimed(ms, state.timedMisses);
    handleEvents(events);

    const stars =
      state.timedMisses === 0 && sec <= 60 ? 3 :
      state.timedMisses <= 2 && sec <= 90 ? 2 : 1;

    // 学習ログ: タイムアタックは 1レコード＝1セッション。
    // タイムが 主指標なので さいこう記録との くらべも のこす
    StudySession.finish("completed", {
      ext: {
        stars,
        misses: state.timedMisses,
        bestMs: prevBest ? Math.round(prevBest) : null,
        isBest: !prevBest || ms < prevBest,
        msPerProblem: Math.round(ms / TIMED_COUNT),
      },
    });

    $("#result-time").textContent = sec.toFixed(1) + "びょう";
    $("#result-miss").textContent = state.timedMisses + "かい";
    const best = Store.data.modes.timed.bestMs;
    $("#result-best").textContent = best ? (best / 1000).toFixed(1) + "びょう" : "--";
    $("#result-stars").innerHTML =
      icon("star", "st-on").repeat(stars) + icon("star-o", "st-off").repeat(3 - stars);
    Sound.fanfare();
    $("#overlay-result").classList.add("show");
    burstConfetti(60);
  }

  /** じぶんの しきが とけた あと: もういちど／べつの しき／ホーム */
  function showFreeDone() {
    const p = state.problem;
    const op = p.op === "+" ? "＋" : "−";
    $("#free-done-eq").textContent = `${p.a}${op}${p.b}＝${p.answer}`;
    $("#overlay-free-done").classList.add("show");
  }

  function showSetComplete() {
    notifyBadge(Store.earnBadge("first5"));
    $("#set-stars").innerHTML = icon("star", "st-on").repeat(SET_SIZE);
    const total = Store.totalSolved();
    $("#set-message").textContent = `いままでに ぜんぶで ${total}もん といたよ！`;
    $("#overlay-set").classList.add("show");
    burstConfetti(60);
  }

  function updateStreak() {
    $("#streak-num").textContent = state.streak;
  }

  function renderStars() {
    const row = $("#star-row");
    row.innerHTML = "";
    for (let i = 0; i < SET_SIZE; i++) {
      const s = document.createElement("span");
      s.className = "star" + (i < state.setSolved ? " earned" : "");
      s.innerHTML = icon("star");
      row.appendChild(s);
    }
  }

  // ---------- イベント通知（トースト） ----------
  function handleEvents(events) {
    events.forEach((ev, i) => {
      setTimeout(() => {
        if (ev.type === "mission") {
          Sound.badge();
          toast(`${icon("star", "t-amber")}きょうの ミッション たっせい！`, "toast-mission");
        } else if (ev.type === "levelup") {
          Sound.levelup();
          toast(`${icon("medal", "t-gold")}レベルアップ！ Lv.${ev.level}「${ev.title}」`, "toast-level");
        } else if (ev.type === "badge" && ev.badge) {
          Sound.badge();
          toast(`${icon(ev.badge.icon, "t-purple")}バッジかくとく「${ev.badge.name}」`, "toast-badge");
        }
      }, i * 900);
    });
  }

  function notifyBadge(def) {
    if (def) handleEvents([{ type: "badge", badge: def }]);
  }

  function toast(html, cls) {
    const area = $("#toast-area");
    const t = document.createElement("div");
    t.className = "toast " + (cls || "");
    t.innerHTML = html;
    area.appendChild(t);
    setTimeout(() => t.classList.add("show"), 20);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, 3200);
  }

  // ---------- ホーム（ダッシュボード） ----------
  function renderHome() {
    const info = Store.levelInfo();
    $("#level-num").textContent = info.level;
    $("#level-title").textContent = info.title;
    $("#xp-fill").style.width = Math.round((info.into / info.need) * 100) + "%";
    $("#xp-text").textContent = `つぎのレベルまで あと ${info.need - info.into} XP`;

    const today = Store.data.days[Store.todayKey()] || { solved: 0, mission: false };
    const target = Store.MISSION_TARGET;
    const done = Math.min(today.solved, target);
    const ring = $("#ring-fg");
    const circumference = 2 * Math.PI * 42;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - done / target);
    // 進捗0のときは round linecap の点が残らないよう非表示にする
    ring.style.opacity = done === 0 ? "0" : "1";
    $("#ring-text").textContent = today.mission ? "クリア!" : `${done}/${target}`;
    ring.classList.toggle("done", today.mission);

    $("#day-streak").innerHTML = `${icon("flame")} れんぞく ${Store.dayStreak()}にち`;
  }

  // ---------- きろく画面 ----------
  const MODE_DEFS = [
    { key: "add", name: "たしざん", small: "くりあがり" },
    { key: "genka", name: "ひきざん", small: "10から ひいて たす さくせん" },
    { key: "gengen", name: "ひきざん", small: "ばらから ひいて 10から ひく さくせん" },
    { key: "dev-add", name: "はってん たしざん", small: "2けた＋1けた" },
    { key: "dev-sub", name: "はってん ひきざん", small: "2けた−1けた" },
  ];

  function renderRecords() {
    const list = $("#records-list");
    list.innerHTML = "";
    MODE_DEFS.forEach((def) => {
      const r = Store.data.modes[def.key];
      const card = document.createElement("div");
      card.className = "record-card";
      card.innerHTML =
        `<div class="record-name">${def.name}<small>${def.small}</small></div>` +
        `<div class="record-nums">といた かず <b>${r.solved}</b> もん<br>れんぞく せいかい さいこう <b>${r.best}</b></div>`;
      list.appendChild(card);
    });
    // タイムアタック
    const t = Store.data.modes.timed;
    const card = document.createElement("div");
    card.className = "record-card";
    card.innerHTML =
      `<div class="record-name">${icon("bolt", "ic-timed")} タイムアタック<small>10もん あんざん</small></div>` +
      `<div class="record-nums">ちょうせん <b>${t.plays}</b> かい<br>さいこうタイム <b>${t.bestMs ? (t.bestMs / 1000).toFixed(1) + "びょう" : "--"}</b></div>`;
    list.appendChild(card);
  }

  // ---------- あしあと（学習ログの よみだし表示） ----------
  /*
     study.records.v1 を よみかえして、じぶんの のびを 見せる（§5.5）。
     ・よみだし専用。学習ログへの 書きこみ・削除は しない
     ・正答率は firstTryCorrect / attempted
     ・時刻は 時間帯までに とどめる（§4.1）
  */
  const LOG_RANGE_DAYS = 7;
  const LOG_LIST_MAX = 12;

  function renderStudyLog() {
    const all = StudyStats.load();
    const sum = $("#log-summary");
    const modes = $("#log-modes");
    const list = $("#log-list");
    sum.innerHTML = "";
    modes.innerHTML = "";
    list.innerHTML = "";

    if (all.length === 0) {
      $("#log-range").hidden = true;
      $("#log-list-title").hidden = true;
      sum.innerHTML = `<p class="log-empty">まだ あしあとが ないよ。<br>れんしゅうすると ここに たまります！</p>`;
      return;
    }

    const week = StudyStats.lastDays(all, LOG_RANGE_DAYS);
    const t = StudyStats.total(week.length ? week : all);
    $("#log-range").hidden = false;
    $("#log-list-title").hidden = false;
    $("#log-range").textContent = week.length ? "この 1しゅうかん" : "これまで";
    const rate = StudyStats.firstTryRate(t);

    sum.innerHTML =
      logTile("とりくんだ かい", t.records, "かい") +
      logTile("といた もんだい", t.attempted, "もん") +
      logTile("いっぱつせいかい", rate === null ? "--" : Math.round(rate * 100), rate === null ? "" : "%") +
      logTile("がくしゅうじかん", StudyStats.durationLabel(t.activeMs || t.elapsedMs), "");

    StudyStats.byMode(week.length ? week : all).forEach((m) => {
      const r = StudyStats.firstTryRate(m);
      const pct = r === null ? 0 : Math.round(r * 100);
      const row = document.createElement("div");
      row.className = "log-mode";
      // ぼうの ながさは style属性では なく CSSOM で あてる。
      // CSP の style-src 'self' は「HTML に 書かれた style属性」を とめるため、
      // innerHTML の なかに style="width:..." と 書くと ぼうが のびなくなる。
      // 要素の .style へ 代入する ぶんには とめられない。
      row.innerHTML =
        `<div class="log-mode-name">${m.title}<small>${m.attempted}もん といた</small></div>` +
        `<div class="log-mode-bar"><span></span></div>` +
        `<div class="log-mode-pct">${r === null ? "--" : pct + "%"}</div>`;
      row.querySelector(".log-mode-bar span").style.width = pct + "%";
      modes.appendChild(row);
    });

    StudyStats.recent(all, LOG_LIST_MAX).forEach((r) => {
      const s = r.summary || {};
      const attempted = typeof s.attempted === "number" ? s.attempted : s.count;
      const ftc = typeof s.firstTryCorrect === "number" ? s.firstTryCorrect : 0;
      const row = document.createElement("div");
      row.className = "log-item" + (r.status === "aborted" ? " aborted" : "");
      row.innerHTML =
        `<div class="log-item-when">${StudyStats.dateLabel(r.startedAt)}` +
        `<small>${StudyStats.bandLabel(r.startedAt)}</small></div>` +
        `<div class="log-item-body">` +
          `<b>${(r.unit && r.unit.title) || r.mode}</b>` +
          `<small>いっぱつせいかい ${ftc}／${attempted}もん` +
          `・${StudyStats.durationLabel(r.elapsedMs)}` +
          `${r.status === "aborted" ? "・とちゅうまで" : ""}</small>` +
        `</div>` +
        `<div class="log-item-stars">${logStars(ftc, s.count)}</div>`;
      list.appendChild(row);
    });
  }

  function logTile(label, value, unit) {
    return `<div class="log-tile"><span class="log-tile-label">${label}</span>` +
      `<span class="log-tile-value">${value}<small>${unit}</small></span></div>`;
  }

  /** さいだい5つの ほしで 初回正答を 見せる（もんだい数が おおい ときは わりあいで） */
  function logStars(got, count) {
    const n = Math.max(1, count || 1);
    const on = Math.round((Math.min(got || 0, n) / n) * 5);
    return icon("star", "st-on").repeat(on) + icon("star-o", "st-off").repeat(5 - on);
  }

  function renderMaps() {
    buildMap($("#map-add"), "add");
    buildMap($("#map-sub"), "sub");
  }

  function buildMap(container, type) {
    container.innerHTML = "";
    const rows = type === "add" ? [6, 7, 8, 9] : [11, 12, 13, 14, 15, 16, 17, 18];
    const cols = [2, 3, 4, 5, 6, 7, 8, 9];
    const table = document.createElement("table");
    const head = document.createElement("tr");
    head.innerHTML = `<th>${type === "add" ? "＋" : "−"}</th>` + cols.map((c) => `<th>${c}</th>`).join("");
    table.appendChild(head);
    rows.forEach((a) => {
      const tr = document.createElement("tr");
      let html = `<th>${a}</th>`;
      cols.forEach((b) => {
        const valid = type === "add" ? a + b >= 11 : (b > a - 10 && a - b >= 1);
        if (!valid) { html += '<td class="cell-na"></td>'; return; }
        const key = type === "add" ? `A${a}+${b}` : `S${a}-${b}`;
        html += `<td class="cell cell-${Store.factState(key)}"></td>`;
      });
      tr.innerHTML = html;
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  // ---------- カレンダー ----------
  let calYear, calMonth; // 0はじまりの つき

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }

  function renderCalendar() {
    $("#cal-title").textContent = `${calYear}ねん ${calMonth + 1}がつ`;
    const cal = $("#calendar");
    cal.innerHTML = "";
    ["にち", "げつ", "か", "すい", "もく", "きん", "ど"].forEach((w) => {
      const el = document.createElement("div");
      el.className = "cal-head";
      el.textContent = w;
      cal.appendChild(el);
    });
    const first = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) {
      cal.appendChild(document.createElement("div"));
    }
    const todayStr = Store.todayKey();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const rec = Store.data.days[key];
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (key === todayStr ? " cal-today" : "");
      cell.innerHTML = `<span class="cal-day">${d}</span><span class="cal-stamp">${rec ? (rec.mission ? icon("star", "stamp-star") : icon("check-circle", "stamp-check")) : ""}</span>`;
      cal.appendChild(cell);
    }
  }

  // ---------- バッジ ----------
  function renderBadges() {
    const list = $("#badge-list");
    list.innerHTML = "";
    Store.BADGES.forEach((b) => {
      const got = Store.data.badges[b.id];
      const card = document.createElement("div");
      card.className = "badge-card" + (got ? " earned" : "");
      card.innerHTML =
        `<div class="badge-icon${got ? "" : " locked"}">${icon(got ? b.icon : "help")}</div>` +
        `<div class="badge-text"><b>${b.name}</b><small>${b.desc}</small>${got ? `<small class="badge-date">${got}</small>` : ""}</div>`;
      list.appendChild(card);
    });
  }

  // ---------- キーパッド ----------
  function buildKeypad() {
    const pad = $("#keypad");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];
    keys.forEach((k) => {
      const btn = document.createElement("button");
      if (k === "del") {
        btn.className = "key-del";
        btn.textContent = "けす";
        btn.addEventListener("click", onDelete);
      } else if (k === "ok") {
        btn.className = "key-ok";
        btn.innerHTML = icon("check");
        btn.setAttribute("aria-label", "こたえる");
        btn.addEventListener("click", onOk);
      } else {
        btn.textContent = k;
        btn.addEventListener("click", () => onDigit(k));
      }
      pad.appendChild(btn);
    });
  }

  // ---------- サウンド設定 ----------
  function applySound() {
    const muted = !Store.data.settings.sound;
    Sound.setMuted(muted);
    document.querySelectorAll("#btn-sound, .btn-sound-play").forEach((b) => {
      b.innerHTML = icon(muted ? "volume-off" : "volume");
    });
  }

  function toggleSound() {
    Store.data.settings.sound = !Store.data.settings.sound;
    Store.save();
    applySound();
  }

  // ---------- PWA ----------

  /**
   * インストールの ボタン。
   * 合図（beforeinstallprompt）は install-hook.js が <head> の さきで
   * うけとって ためている。ここでは その ありなしを 見るだけ。
   * 本体は </body> の 直前で よみこまれるため、ここで listener を つけても
   * 合図には まにあわない（つけた ときには もう とんだ あと）。
   *
   * ボタンは 案内できる ときだけ 出す。
   * 出せない ボタンを おいておくと「おしても なにも おきない」と 言われる。
   */
  function setupInstallButton() {
    const btn = $("#btn-install");
    const isStandalone = matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;

    const sync = () => {
      btn.hidden = isStandalone || window.__pwaInstalled || !window.__pwaInstallPrompt;
    };

    window.addEventListener("pwa-install-available", sync);
    window.addEventListener("pwa-installed", () => {
      sync();
      toast(`${icon("download", "t-blue")}インストール ありがとう！`, "toast-badge");
    });

    btn.addEventListener("click", async () => {
      const prompt = window.__pwaInstallPrompt;
      if (!prompt) return;
      prompt.prompt();
      await prompt.userChoice;
      window.__pwaInstallPrompt = null;
      sync();
    });

    sync();   // install-hook.js が すでに うけとって いる ばあいを ひろう
  }

  /**
   * あたらしい ばんの おしらせ。
   *
   * ⚠️ controllerchange は、はじめて ひらいた ときにも とんでくる
   *    （activate の clients.claim() で ページが 管理下に 入るため）。
   *    これを すなおに うけると 初回訪問が かならず 1回 リロードされ、
   *    ならべたばかりの ブロックと うちかけの こたえが きえる。
   *
   * ⚠️「もともと 管理下だったか」で 分ける なおし方は べつの 形で こわれる。
   *    入れた 直後に 更新を おした ばあい、切りかわったのに 読みこみ直されない。
   *    見るべきは「利用者が おしたか どうか」だけ。
   */
  function setupUpdateNotice(registration) {
    const bar = $("#update-bar");
    const btn = $("#btn-update");
    let userAskedUpdate = false;
    let reloading = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!userAskedUpdate || reloading) return;
      reloading = true;
      location.reload();
    });

    const notify = (worker) => {
      bar.hidden = false;
      btn.onclick = () => {
        userAskedUpdate = true;
        btn.disabled = true;
        worker.postMessage({ type: "SKIP_WAITING" });
      };
    };

    registration.addEventListener("updatefound", () => {
      const sw = registration.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        // controller が いる＝初回インストールでは なく 更新。
        // 初回で しらせると「入れた 直後に 更新が あります」と 出て こんらんする。
        if (sw.state === "installed" && navigator.serviceWorker.controller) notify(sw);
      });
    });

    // まえのうちに 入っていた ばあいも ひろう
    if (registration.waiting && navigator.serviceWorker.controller) notify(registration.waiting);
  }

  function setupPwa() {
    setupInstallButton();

    if (!("serviceWorker" in navigator)) return;

    const start = () => {
      navigator.serviceWorker.register("./sw.js")
        .then(setupUpdateNotice)
        .catch(() => { /* オフライン非対応でも うごく */ });
    };

    // ⚠️ ここで load を まつだけに すると、すでに load が おわって いる ばあいに
    //    リスナーが 二度と よばれず、Service Worker が 登録されない。
    //    かならず readyState を 見て 分ける。
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }

  // ---------- 提示モード（電子黒板・一斉授業） ----------
  const PRESENT_KEY = "keisan-block-present";

  function applyPresentation(on) {
    document.body.classList.toggle("presentation", on);
    document.querySelectorAll(".btn-present").forEach((b) => {
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.innerHTML = icon(on ? "present-off" : "present");
      b.setAttribute("aria-label", on ? "大きく表示を やめる" : "大きく表示（電子黒板）");
    });
  }

  function setupPresentation() {
    let on = false;
    try { on = localStorage.getItem(PRESENT_KEY) === "1"; } catch { /* ITP などで 読めない */ }
    applyPresentation(on);

    document.querySelectorAll(".btn-present").forEach((b) => {
      b.addEventListener("click", async () => {
        on = !on;
        applyPresentation(on);
        try { localStorage.setItem(PRESENT_KEY, on ? "1" : "0"); } catch { /* 保存できなくても うごく */ }

        // 電子黒板では 画面いっぱいに したい。
        // ブラウザが ことわる ことも あるので、失敗しても 表示は 大きいままに する。
        try {
          if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
          else if (!on && document.fullscreenElement) await document.exitFullscreen();
        } catch { /* ゆるされない ばあいは そのまま */ }
      });
    });

    // ブラウザがわ（Esc など）で ぜんがめんを ぬけた ときは、表示の 大きさは そのまま。
    // 「大きく表示」は ぜんがめんとは べつの 設定として あつかう。
  }

  // ---------- じぶんで しきを いれる がめん ----------
  const EXPLAIN_KEY = "keisan-block-explain";

  function buildFreeKeypad() {
    const pad = $("#free-keypad");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "clear"];
    keys.forEach((k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      if (k === "del") {
        btn.className = "key-del";
        btn.textContent = "けす";
        btn.addEventListener("click", () => freeDelete());
      } else if (k === "clear") {
        btn.className = "key-clear";
        btn.textContent = "ぜんぶ けす";
        btn.addEventListener("click", () => freeClear());
      } else {
        btn.textContent = k;
        btn.addEventListener("click", () => freeDigit(k));
      }
      pad.appendChild(btn);
    });
  }

  function freeDigit(d) {
    Sound.unlock();
    Sound.tap();
    const f = state.free;
    const cur = f[f.slot];
    if (cur.length >= 2) return;
    f[f.slot] = cur === "0" ? d : cur + d;
    // まえの かずが 2けたに なったら、つぎは うしろの かずへ
    if (f.slot === "a" && f[f.slot].length >= 2 && f.b === "") f.slot = "b";
    renderFree();
  }

  function freeDelete() {
    Sound.tap();
    const f = state.free;
    if (f[f.slot] === "" && f.slot === "b") f.slot = "a";
    f[f.slot] = f[f.slot].slice(0, -1);
    renderFree();
  }

  function freeClear() {
    Sound.tap();
    state.free.a = "";
    state.free.b = "";
    state.free.slot = "a";
    renderFree();
  }

  /** いれた しきが つかえるか しらべる（つかえない ときは やさしく つたえる） */
  function freeValidate() {
    const { a, b, op } = state.free;
    if (a === "" || b === "") return { ok: false, msg: "" };
    const na = Number(a), nb = Number(b);
    if (na > FREE_MAX || nb > FREE_MAX) {
      return { ok: false, msg: `${FREE_MAX}までの かずで いれてね。` };
    }
    if (op === "+" && na + nb > FREE_MAX) {
      return { ok: false, msg: `こたえが ${FREE_MAX}より 大きく なる けいさんは まだ できないよ。` };
    }
    if (op !== "+" && na < nb) {
      return { ok: false, msg: `${na}から ${nb}は ひけないよ。おおきい かずを まえに いれてね。` };
    }
    return { ok: true, msg: "", a: na, b: nb };
  }

  /** げんかほう／げんげんほう どちらでも できる しき（13−9 など）か */
  function freeNeedsMethod(v) {
    if (!v.ok || state.free.op === "+") return false;
    return v.a >= 11 && v.a <= 18 && v.b <= 9 && v.b % 10 > v.a % 10;
  }

  function renderFree() {
    const f = state.free;
    const aEl = $("#free-a"), bEl = $("#free-b");
    aEl.textContent = f.a === "" ? "?" : f.a;
    bEl.textContent = f.b === "" ? "?" : f.b;
    aEl.classList.toggle("selected", f.slot === "a");
    bEl.classList.toggle("selected", f.slot === "b");
    document.querySelectorAll("#screen-free .free-op").forEach((b) => {
      b.classList.toggle("on", b.dataset.op === f.op);
    });

    const v = freeValidate();
    $("#free-msg").textContent = v.msg;
    $("#free-msg").classList.toggle("warn", !!v.msg);
    $("#btn-free-start").disabled = !v.ok;

    const needsMethod = freeNeedsMethod(v);
    $("#free-method").hidden = !needsMethod;
    document.querySelectorAll(".free-method-btn").forEach((b) => {
      b.classList.toggle("on", b.dataset.method === f.method);
    });

    $("#free-explain").checked = f.explain;
  }

  function startFree() {
    const v = freeValidate();
    if (!v.ok) return;
    state.freeProblem = makeFreeProblem(v.a, state.free.op, v.b, state.free.method);
    startMode("free");
  }

  function bindFreeScreen() {
    buildFreeKeypad();

    document.querySelectorAll("#screen-free .free-num").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.tap();
        state.free.slot = btn.dataset.slot;
        renderFree();
      });
    });

    document.querySelectorAll("#screen-free .free-op").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.tap();
        state.free.op = btn.dataset.op;
        if (state.free.b === "") state.free.slot = "b";
        renderFree();
      });
    });

    document.querySelectorAll(".free-method-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.tap();
        state.free.method = btn.dataset.method;
        renderFree();
      });
    });

    $("#free-explain").addEventListener("change", (e) => {
      state.free.explain = e.target.checked;
      try { localStorage.setItem(EXPLAIN_KEY, state.free.explain ? "1" : "0"); } catch (_) { /* つかえなくても うごく */ }
    });

    $("#btn-free-start").addEventListener("click", () => {
      Sound.unlock();
      startFree();
    });

    $("#btn-free-again").addEventListener("click", () => {
      $("#overlay-free-done").classList.remove("show");
      startFree();
    });

    $("#btn-free-new").addEventListener("click", () => {
      $("#overlay-free-done").classList.remove("show");
      state.session++;
      showScreen("free");
    });

    $("#btn-free-home").addEventListener("click", () => {
      $("#overlay-free-done").classList.remove("show");
      state.session++;
      showScreen("home");
    });

    try { state.free.explain = localStorage.getItem(EXPLAIN_KEY) === "1"; } catch (_) { /* 既定は オフ */ }
    renderFree();
  }

  // ---------- イベント ----------
  function bindEvents() {
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.unlock();
        const dest = btn.dataset.goto;
        if (dest === "add") return startMode("add");
        if (dest === "timed") return startMode("timed");
        if (dest === "quit") {
          const wasFree = isFree();
          // 学習ログ: 「やめる」は 中断。とちゅうで やめた ことも たいせつな サイン（§5.4）
          StudySession.finish("aborted");
          state.session++;        // 遅延コールバックを 無効化
          state.accepting = false;
          cancelTask();
          clearCounting();
          Marks.unfocus();
          stopTimer();
          $("#overlay-correct").classList.remove("show");
          $("#overlay-free-done").classList.remove("show");
          $("#explain-bar").hidden = true;
          document.body.classList.remove("timed-mode", "free-mode", "explain-mode");
          // じぶんの しきの ときは、しきを かえやすいように 入力がめんへ もどる
          return showScreen(wasFree ? "free" : "home");
        }
        if (dest === "records") {
          renderRecords(); renderStudyLog(); renderMaps();
          initCalendar(); renderCalendar(); renderBadges();
        }
        showScreen(dest);
      });
    });

    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.unlock();
        startMode(btn.dataset.mode);
      });
    });

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $("#tab-" + btn.dataset.tab).classList.add("active");
      });
    });

    $("#cal-prev").addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    $("#cal-next").addEventListener("click", () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });

    $("#btn-continue").addEventListener("click", () => {
      $("#overlay-set").classList.remove("show");
      state.setSolved = 0;
      renderStars();
      StudySession.begin(state.mode, SET_SIZE);   // つぎの 5もんは あたらしい レコード
      nextProblem();
    });

    $("#btn-set-home").addEventListener("click", () => {
      $("#overlay-set").classList.remove("show");
      showScreen("home");
    });

    $("#btn-retry").addEventListener("click", () => {
      $("#overlay-result").classList.remove("show");
      startMode("timed");
    });

    $("#btn-result-home").addEventListener("click", () => {
      $("#overlay-result").classList.remove("show");
      showScreen("home");
    });

    $("#btn-sound").addEventListener("click", toggleSound);
    document.querySelectorAll(".btn-sound-play").forEach((b) => b.addEventListener("click", toggleSound));

    $("#btn-reset-records").addEventListener("click", () => {
      // けすのは このアプリの きろくだけ。「あしあと」（study.records.v1）は
      // ほかのアプリと 共有していて、まだ 送信していない ログが きえるため けさない（§1.2）
      if (confirm("レベル・にがてカード・カレンダー・バッジを けしますか？\n（「あしあと」は のこります）")) {
        Store.resetAll();
        renderRecords(); renderMaps(); renderCalendar(); renderBadges();
      }
    });

    // キーボードでも 入力できるように（PC・電子黒板・外付けキーボードむけ）
    document.addEventListener("keydown", (e) => {
      if ($("#screen-free").classList.contains("active")) {
        if (e.key >= "0" && e.key <= "9") freeDigit(e.key);
        else if (e.key === "Backspace") { e.preventDefault(); freeDelete(); }
        else if (e.key === "+") { state.free.op = "+"; renderFree(); }
        else if (e.key === "-") { state.free.op = "−"; renderFree(); }
        else if (e.key === "Enter") startFree();
        return;
      }
      if (!$("#screen-play").classList.contains("active")) return;
      if (isExplain()) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#btn-explain").click(); }
        return;
      }
      if (e.key >= "0" && e.key <= "9") onDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); onDelete(); }
      else if (e.key === "Enter") onOk();
    });

    // 5ふん いじょう はなれる／タブが すてられると、そこまでが 中断の きろくに なる（§5.4）。
    // もどってきて つづける ときは、区切りの のこりぶんで あたらしい レコードを はじめる
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) resumeStudyRecord();
    });
    // bfcache から もどった とき（pagehide で 確定した あと 学習が つづく ばあい）
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) resumeStudyRecord();
    });
  }

  /**
   * 中断きろくの あとに れんしゅうを つづける ときの あたらしい レコード。
   * つぎの ばあいは はじめない（§5.4）。
   *   ・きろく対象外の モード（じぶんで しきを いれる）
   *   ・すでに きろくちゅうの レコードが ある
   *   ・けっか表示などの オーバーレイが 出ている（まだ 学習を さいかいしていない）
   */
  function resumeStudyRecord() {
    if (!$("#screen-play").classList.contains("active")) return;
    if (isFree() || StudySession.isActive() || !state.problem) return;
    if (document.querySelector(".overlay.show")) return;
    const planned = isTimed() ? TIMED_COUNT - state.timedIndex : SET_SIZE - state.setSolved;
    if (planned <= 0) return;
    StudySession.begin(state.mode, planned);
    StudySession.startProblem(problemId(state.problem), state.problem.type, state.problem.factKey);
  }

  buildKeypad();
  bindFreeScreen();
  bindEvents();
  applySound();
  setupPresentation();
  setupPwa();
  renderHome();
})();
