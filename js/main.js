/* ============================================================
   さんすうブロック — アプリ本体
   ・ガイドつき れんしゅう（たしざん／減加法／減減法）
   ・あんざんタイムアタック
   ・はってん（2けた±1けた）
   ・ミッション／レベル／バッジ／習熟度マップ
   ============================================================ */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const SET_SIZE = 5;        // ガイドつき 1セットの もんだい数
  const TIMED_COUNT = 10;    // タイムアタックの もんだい数

  const PRAISES = ["せいかい！", "すごい！", "やったね！", "いいね！", "そのちょうし！"];

  const METHOD_LABELS = {
    add: "🍒 10の まとまりを つくろう",
    genka: "🔟 げんかほう：10から ひいて たす",
    gengen: "🍒 げんげんほう：じゅんばんに ひく",
    "dev-add": "🚀 つぎの「なん10」を つくろう",
    "dev-sub": "🚀 げんげんほうで じゅんばんに ひく",
    timed: "",
  };

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
    // タイムアタック
    timedIndex: 0,
    timedMisses: 0,
    timedStart: 0,
    timerId: null,
  };

  function isTimed() { return state.mode === "timed"; }
  function isDev() { return state.mode.startsWith("dev"); }

  // ---------- 画面切りかえ ----------
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#screen-" + id).classList.add("active");
    if (id === "home") renderHome();
  }

  // ---------- ユーティリティ ----------
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* 無視 */ } }
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

  function generateProblem(mode) {
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

    const opText = p.type === "timed" ? p.op : (p.type === "add" || p.type === "dev-add" ? "+" : "−");

    if (p.type === "timed") {
      cherry = null;
      eq.appendChild(eqGroup(eqNum(p.a), null));
      eq.appendChild(eqOp(opText));
      eq.appendChild(eqGroup(eqNum(p.b), null));
      eq.appendChild(eqOp("="));
      eq.appendChild(eqGroup(eqAnsEl, null));
      return;
    }

    cherry = Blocks.makeCherry();
    // さくらんぼの位置: げんかほう→まえの数 / それ以外→うしろの数
    const cherryOnA = p.type === "genka";
    eq.appendChild(eqGroup(eqNum(p.a), cherryOnA ? cherry : null));
    eq.appendChild(eqOp(opText));
    eq.appendChild(eqGroup(eqNum(p.b), cherryOnA ? null : cherry));
    eq.appendChild(eqOp("="));
    eq.appendChild(eqGroup(eqAnsEl, null));
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

    if (p.type === "add") {
      const comp = 10 - p.a;
      const rest = p.b - comp;
      frameSlots = Blocks.renderTenFrame(frameArea, p.a, "c-orange");
      looseSlots = Blocks.renderLoose(looseArea, p.b, "c-blue");
      const empties = frameSlots.filter((s) => !s.querySelector(".block"));
      return [
        {
          prompt: `${p.a}は あと いくつで 10かな？`,
          answer: comp,
          hint: "わくの あいている ところを かぞえてみよう！",
          before() { Blocks.highlight(empties, true); },
          async after() {
            Blocks.highlight(empties, false);
            cherry.setLeft(comp);
          },
        },
        {
          prompt: `${p.b}を ${comp}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${comp}を とると のこりは いくつかな？`,
          async after() {
            cherry.setRight(rest);
            Sound.move();
            const movers = looseSlots.slice(p.b - comp);
            await Promise.all(movers.map((s, i) => Blocks.flyBlock(s, empties[i], "c-blue", i * 120)));
          },
        },
        {
          prompt: `10と ${rest}で いくつかな？`,
          answer: p.answer,
          hint: "わくの 10と ばらの ブロックを あわせて かぞえよう！",
          before() { Blocks.pulseBlocks(frameSlots.concat(looseSlots), true); },
          async after() { Blocks.pulseBlocks(frameSlots.concat(looseSlots), false); },
        },
      ];
    }

    if (p.type === "genka") {
      const ones = p.a - 10;
      const left = 10 - p.b;
      frameSlots = Blocks.renderTenFrame(frameArea, 10, "c-orange");
      looseSlots = Blocks.renderLoose(looseArea, ones, "c-orange");
      return [
        {
          prompt: `${p.a}は 10と いくつかな？`,
          answer: ones,
          hint: "わくの そとの ばらの ブロックを かぞえてみよう！",
          before() { Blocks.pulseBlocks(looseSlots, true); },
          async after() {
            Blocks.pulseBlocks(looseSlots, false);
            cherry.setLeft(10);
            cherry.setRight(ones);
          },
        },
        {
          prompt: `10から ${p.b}を ひくと いくつかな？`,
          answer: left,
          hint: `わくから ブロックを ${p.b}こ とるよ。のこりは いくつかな？`,
          async after() {
            Sound.move();
            const movers = frameSlots.slice(10 - p.b);
            await Promise.all(movers.map((s, i) => Blocks.flyAway(s, i * 90)));
          },
        },
        {
          prompt: `のこった ${left}と ばらの ${ones}を あわせると いくつかな？`,
          answer: p.answer,
          hint: "のこりの ブロックを ぜんぶ かぞえてみよう！",
          before() { Blocks.pulseBlocks(frameSlots.concat(looseSlots), true); },
          async after() { Blocks.pulseBlocks(frameSlots.concat(looseSlots), false); },
        },
      ];
    }

    if (p.type === "gengen") {
      const ones = p.a - 10;
      const rest = p.b - ones;
      frameSlots = Blocks.renderTenFrame(frameArea, 10, "c-orange");
      looseSlots = Blocks.renderLoose(looseArea, ones, "c-orange");
      return [
        {
          prompt: `さきに ばらの ${ones}こを ひくよ。${p.b}を ${ones}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${ones}を とると のこりは いくつかな？`,
          before() { Blocks.pulseBlocks(looseSlots, true); },
          async after() {
            Blocks.pulseBlocks(looseSlots, false);
            cherry.setLeft(ones);
            cherry.setRight(rest);
          },
        },
        {
          prompt: `${p.a}から ${ones}を ひくと いくつかな？`,
          answer: 10,
          hint: "ばらの ブロックを ぜんぶ とると、わくだけに なるね！",
          async after() {
            Sound.move();
            await Promise.all(looseSlots.map((s, i) => Blocks.flyAway(s, i * 90)));
          },
        },
        {
          prompt: `10から ${rest}を ひくと いくつかな？`,
          answer: p.answer,
          hint: `わくから ブロックを ${rest}こ とるよ。のこりは いくつかな？`,
          async after() {
            Sound.move();
            const movers = frameSlots.slice(10 - rest);
            await Promise.all(movers.map((s, i) => Blocks.flyAway(s, i * 90)));
          },
        },
      ];
    }

    if (p.type === "dev-add") {
      // 25+8 → 25は あと5で 30 → 8を 5と3に わける → 30と3で 33
      const comp = 10 - p.ones;
      const rest = p.b - comp;
      const next10 = (p.tens + 1) * 10;
      Blocks.renderRods(rodArea, p.tens);
      frameSlots = Blocks.renderTenFrame(frameArea, p.ones, "c-orange");
      looseSlots = Blocks.renderLoose(looseArea, p.b, "c-blue");
      const empties = frameSlots.filter((s) => !s.querySelector(".block"));
      return [
        {
          prompt: `${p.a}は あと いくつで ${next10}かな？`,
          answer: comp,
          hint: "わくの あいている ところを かぞえてみよう！",
          before() { Blocks.highlight(empties, true); },
          async after() {
            Blocks.highlight(empties, false);
            cherry.setLeft(comp);
          },
        },
        {
          prompt: `${p.b}を ${comp}と いくつに わけるかな？`,
          answer: rest,
          hint: `${p.b}から ${comp}を とると のこりは いくつかな？`,
          async after() {
            cherry.setRight(rest);
            Sound.move();
            const movers = looseSlots.slice(p.b - comp);
            await Promise.all(movers.map((s, i) => Blocks.flyBlock(s, empties[i], "c-blue", i * 100)));
            // 10こ そろった わくが 10のぼうに がったい！
            await Blocks.collapseFrameToRod(frameSlots, rodArea);
            Sound.correct();
          },
        },
        {
          prompt: `${next10}と ${rest}で いくつかな？`,
          answer: p.answer,
          hint: `10のぼうが ${p.tens + 1}ほんと ばらが ${rest}こ だね！`,
        },
      ];
    }

    // dev-sub: 33−6 → 6を 3と3に わける → 33−3=30 → 30−3=27
    const rest = p.b - p.ones;
    Blocks.renderRods(rodArea, p.tens);
    frameSlots = Blocks.renderTenFrame(frameArea, 0, "c-orange");
    frameArea.hidden = true; // ぼうを ばらす ステップまで かくす
    looseSlots = Blocks.renderLoose(looseArea, p.ones, "c-orange");
    return [
      {
        prompt: `さきに ばらの ${p.ones}こを ひくよ。${p.b}を ${p.ones}と いくつに わけるかな？`,
        answer: rest,
        hint: `${p.b}から ${p.ones}を とると のこりは いくつかな？`,
        before() { Blocks.pulseBlocks(looseSlots, true); },
        async after() {
          Blocks.pulseBlocks(looseSlots, false);
          cherry.setLeft(p.ones);
          cherry.setRight(rest);
        },
      },
      {
        prompt: `${p.a}から ${p.ones}を ひくと いくつかな？`,
        answer: p.tens * 10,
        hint: `ばらを ぜんぶ とると 10のぼうだけに なるね！`,
        async after() {
          Sound.move();
          await Promise.all(looseSlots.map((s, i) => Blocks.flyAway(s, i * 90)));
        },
      },
      {
        prompt: `${p.tens * 10}から ${rest}を ひくと いくつかな？`,
        answer: p.answer,
        hint: `10のぼうを 1ほん ばらして、そこから ${rest}こ とろう！`,
        async after() {
          // 10のぼうが ばらけて、そこから rest こ ひく
          $("#frame-area").hidden = false;
          await Blocks.breakRodToFrame($("#rod-area"), frameSlots, "c-orange");
          Sound.move();
          const movers = frameSlots.slice(10 - rest);
          await Promise.all(movers.map((s, i) => Blocks.flyAway(s, i * 90)));
        },
      },
    ];
  }

  // ---------- れんしゅうの 進行 ----------
  function startMode(mode) {
    state.session++;
    state.mode = mode;
    state.setSolved = 0;
    state.streak = 0;
    updateStreak();
    document.body.classList.toggle("timed-mode", mode === "timed");

    if (mode === "timed") {
      state.timedIndex = 0;
      state.timedMisses = 0;
      $("#star-row").hidden = true;
      $("#timed-info").hidden = false;
      startTimer();
    } else {
      $("#star-row").hidden = false;
      $("#timed-info").hidden = true;
      stopTimer();
      renderStars();
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
    state.problem = generateProblem(state.mode);
    state.stepIndex = 0;
    state.wrongCount = 0;
    state.firstTry = true;
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

  function showStep() {
    const step = currentStep();
    state.buffer = "";
    renderBuffer();
    $("#prompt").textContent = step.prompt;
    setFeedback("", "");
    step.before?.();
    state.accepting = true;
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
    if (!state.accepting || state.buffer.length >= 2) return;
    Sound.tap();
    state.buffer += d;
    renderBuffer();
    const expectedLen = String(currentStep().answer).length;
    if (state.buffer.length >= expectedLen) check();
  }

  function onDelete() {
    if (!state.accepting) return;
    Sound.tap();
    state.buffer = state.buffer.slice(0, -1);
    renderBuffer();
  }

  function onOk() {
    if (!state.accepting || state.buffer === "") return;
    check();
  }

  async function check() {
    const step = currentStep();
    const val = Number(state.buffer);
    state.accepting = false;

    if (val === step.answer) {
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
      // 3回 まちがえたら こたえを 見せて すすむ
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
      const msg = isTimed()
        ? "おしい！もういちど！"
        : state.wrongCount === 2 ? "ヒント：" + step.hint : "おしい！もういちど！";
      setFeedback(msg, "bad");
      state.buffer = "";
      setTimeout(() => {
        if (sess !== state.session) return;
        renderBuffer();
        state.accepting = true;
      }, 350);
    }
  }

  function problemDone() {
    const p = state.problem;
    eqAnsEl.textContent = p.answer;
    eqAnsEl.classList.add("answered");

    if (isTimed()) return timedProblemDone(p);

    // ---- ガイドつきモード ----
    const modeKey = p.type;
    if (state.firstTry) {
      state.streak++;
      Store.updateBest(modeKey, state.streak);
      if (state.streak >= 10) notifyBadge(Store.earnBadge("streak10"));
    }
    updateStreak();

    const xp = isDev() ? (state.firstTry ? 15 : 8) : (state.firstTry ? 10 : 5);
    const { events } = Store.recordProblem({
      mode: modeKey, factKey: p.factKey, success: state.firstTry, xp,
    });
    handleEvents(events);

    state.setSolved++;
    renderStars();

    Sound.fanfare();
    $("#correct-text").textContent = state.firstTry ? "せいかい！" : "できたね！";
    const overlay = $("#overlay-correct");
    overlay.classList.add("show");
    const sess = state.session;
    setTimeout(() => {
      overlay.classList.remove("show");
      if (sess !== state.session) return;
      if (state.setSolved >= SET_SIZE) showSetComplete();
      else nextProblem();
    }, 1400);
  }

  function timedProblemDone(p) {
    Sound.correct();
    const { events } = Store.recordProblem({
      mode: "timed", factKey: p.factKey, success: state.firstTry, xp: 8,
    });
    handleEvents(events);
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
    const { events } = Store.recordTimed(ms, state.timedMisses);
    handleEvents(events);

    const stars =
      state.timedMisses === 0 && sec <= 60 ? 3 :
      state.timedMisses <= 2 && sec <= 90 ? 2 : 1;

    $("#result-time").textContent = sec.toFixed(1) + "びょう";
    $("#result-miss").textContent = state.timedMisses + "かい";
    const best = Store.data.modes.timed.bestMs;
    $("#result-best").textContent = best ? (best / 1000).toFixed(1) + "びょう" : "--";
    $("#result-stars").textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    Sound.fanfare();
    $("#overlay-result").classList.add("show");
  }

  function showSetComplete() {
    notifyBadge(Store.earnBadge("first5"));
    $("#set-stars").textContent = "⭐".repeat(SET_SIZE);
    const total = Store.totalSolved();
    $("#set-message").textContent = `いままでに ぜんぶで ${total}もん といたよ！`;
    $("#overlay-set").classList.add("show");
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
      s.textContent = "⭐";
      row.appendChild(s);
    }
  }

  // ---------- イベント通知（トースト） ----------
  function handleEvents(events) {
    events.forEach((ev, i) => {
      setTimeout(() => {
        if (ev.type === "mission") {
          Sound.badge();
          toast("⭐ きょうの ミッション たっせい！", "toast-mission");
        } else if (ev.type === "levelup") {
          Sound.levelup();
          toast(`🎖️ レベルアップ！ Lv.${ev.level}「${ev.title}」`, "toast-level");
        } else if (ev.type === "badge" && ev.badge) {
          Sound.badge();
          toast(`${ev.badge.emoji} バッジかくとく「${ev.badge.name}」`, "toast-badge");
        }
      }, i * 900);
    });
  }

  function notifyBadge(def) {
    if (def) handleEvents([{ type: "badge", badge: def }]);
  }

  function toast(text, cls) {
    const area = $("#toast-area");
    const t = document.createElement("div");
    t.className = "toast " + (cls || "");
    t.textContent = text;
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

    $("#day-streak").textContent = `🔥 れんぞく ${Store.dayStreak()}にち`;
  }

  // ---------- きろく画面 ----------
  const MODE_DEFS = [
    { key: "add", name: "たしざん", small: "くりあがり" },
    { key: "genka", name: "ひきざん（げんかほう）", small: "10から ひいて たす" },
    { key: "gengen", name: "ひきざん（げんげんほう）", small: "じゅんばんに ひく" },
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
      `<div class="record-name">⚡ タイムアタック<small>10もん あんざん</small></div>` +
      `<div class="record-nums">ちょうせん <b>${t.plays}</b> かい<br>さいこうタイム <b>${t.bestMs ? (t.bestMs / 1000).toFixed(1) + "びょう" : "--"}</b></div>`;
    list.appendChild(card);
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
      cell.innerHTML = `<span class="cal-day">${d}</span><span class="cal-stamp">${rec ? (rec.mission ? "⭐" : "✅") : ""}</span>`;
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
        `<div class="badge-emoji">${got ? b.emoji : "❔"}</div>` +
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
        btn.textContent = "✓";
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
      b.textContent = muted ? "🔇" : "🔊";
    });
  }

  function toggleSound() {
    Store.data.settings.sound = !Store.data.settings.sound;
    Store.save();
    applySound();
  }

  // ---------- PWA ----------
  let deferredInstall = null;

  function setupPwa() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* オフライン非対応でも動く */ });
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      $("#btn-install").hidden = false;
    });
    $("#btn-install").addEventListener("click", async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      $("#btn-install").hidden = true;
    });
    window.addEventListener("appinstalled", () => {
      $("#btn-install").hidden = true;
      toast("📲 インストール ありがとう！", "toast-badge");
    });
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
          state.session++;        // 遅延コールバックを 無効化
          state.accepting = false;
          stopTimer();
          document.body.classList.remove("timed-mode");
          return showScreen("home");
        }
        if (dest === "records") {
          renderRecords(); renderMaps(); initCalendar(); renderCalendar(); renderBadges();
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
      if (confirm("きろくを ぜんぶ けしますか？")) {
        Store.resetAll();
        renderRecords(); renderMaps(); renderCalendar(); renderBadges();
      }
    });

    // キーボードでも 入力できるように（PC・外付けキーボードむけ）
    document.addEventListener("keydown", (e) => {
      if (!$("#screen-play").classList.contains("active")) return;
      if (e.key >= "0" && e.key <= "9") onDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); onDelete(); }
      else if (e.key === "Enter") onOk();
    });
  }

  buildKeypad();
  bindEvents();
  applySound();
  setupPwa();
  renderHome();
})();
