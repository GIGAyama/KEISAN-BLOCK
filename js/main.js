/* ============================================================
   さんすうブロック — アプリ本体
   くりあがりの たしざん（さくらんぼ計算）
   くりさがりの ひきざん（減加法・減減法）
   ============================================================ */

(() => {
  const $ = (sel) => document.querySelector(sel);

  const SET_SIZE = 5; // 1セットの もんだい数

  const PRAISES = ["せいかい！", "すごい！", "やったね！", "いいね！", "そのちょうし！"];

  const METHOD_LABELS = {
    add: "🍒 10の まとまりを つくろう",
    genka: "🔟 げんかほう：10から ひいて たす",
    gengen: "🍒 げんげんほう：じゅんばんに ひく",
  };

  const RECORD_DEFS = [
    { key: "add", name: "たしざん", small: "くりあがり" },
    { key: "genka", name: "ひきざん（げんかほう）", small: "10から ひいて たす" },
    { key: "gengen", name: "ひきざん（げんげんほう）", small: "じゅんばんに ひく" },
  ];

  // ---------- 記録 (localStorage) ----------
  const STORE_KEY = "keisan-block-records-v1";

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* こわれていたら 作りなおす */ }
    return { add: { solved: 0, best: 0 }, genka: { solved: 0, best: 0 }, gengen: { solved: 0, best: 0 } };
  }

  function saveRecords() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(records)); } catch (e) { /* 保存できなくても 続行 */ }
  }

  let records = loadRecords();

  // ---------- 状態 ----------
  const state = {
    mode: "add",        // add | genka | gengen | mix
    problem: null,      // いまの もんだい
    steps: [],
    stepIndex: 0,
    buffer: "",
    wrongCount: 0,
    accepting: false,
    firstTry: true,
    setSolved: 0,
    streak: 0,
    lastKey: "",        // 同じ もんだいの 連続を さける
  };

  // ---------- 画面切りかえ ----------
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#screen-" + id).classList.add("active");
  }

  // ---------- もんだいの 生成 ----------
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function generateProblem(mode) {
    for (let tries = 0; tries < 30; tries++) {
      let p;
      if (mode === "add") {
        // a+b (a:6〜9, 合計11以上) — 先の かずで 10を つくる
        const a = randInt(6, 9);
        const b = randInt(11 - a, 9);
        p = { type: "add", a, b, answer: a + b };
      } else {
        // a-b (a:11〜18, くりさがり必須)
        const a = randInt(11, 18);
        const ones = a - 10;
        const b = randInt(ones + 1, 9);
        const method = mode === "mix" ? (Math.random() < 0.5 ? "genka" : "gengen") : mode;
        p = { type: method, a, b, answer: a - b };
      }
      const key = `${p.type}:${p.a}:${p.b}`;
      if (key !== state.lastKey) {
        state.lastKey = key;
        return p;
      }
    }
    return generateProblem(mode); // ほぼ 到達しない
  }

  // ---------- もんだいの 描画と ステップ作成 ----------
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
    cherry = Blocks.makeCherry();
    eqAnsEl = document.createElement("span");
    eqAnsEl.className = "eq-ans";
    eqAnsEl.textContent = "?";

    const aEl = eqNum(p.a);
    const bEl = eqNum(p.b);
    // さくらんぼの 位置: たしざん・げんげんほう→うしろの数 / げんかほう→まえの数
    const cherryOnA = p.type === "genka";
    eq.appendChild(eqGroup(aEl, cherryOnA ? cherry : null));
    eq.appendChild(eqOp(p.type === "add" ? "+" : "−"));
    eq.appendChild(eqGroup(bEl, cherryOnA ? null : cherry));
    eq.appendChild(eqOp("="));
    eq.appendChild(eqGroup(eqAnsEl, null));
  }

  function buildSteps(p) {
    const frameArea = $("#frame-area");
    const looseArea = $("#loose-area");

    if (p.type === "add") {
      const comp = 10 - p.a;        // 10に するのに ひつような数
      const rest = p.b - comp;      // のこり
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
            // うしろから comp こ、わくへ とばす
            const movers = looseSlots.slice(p.b - comp);
            await Promise.all(
              movers.map((s, i) => Blocks.flyBlock(s, empties[i], "c-blue", i * 120))
            );
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

    const ones = p.a - 10; // ばらの数

    if (p.type === "genka") {
      frameSlots = Blocks.renderTenFrame(frameArea, 10, "c-orange");
      looseSlots = Blocks.renderLoose(looseArea, ones, "c-orange");
      const left = 10 - p.b;
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
            // わくの うしろから b こ とばす
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

    // げんげんほう
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

  // ---------- れんしゅうの 進行 ----------
  function startMode(mode) {
    state.mode = mode;
    state.setSolved = 0;
    state.streak = 0;
    updateStreak();
    renderStars();
    showScreen("play");
    nextProblem();
  }

  function nextProblem() {
    state.problem = generateProblem(state.mode);
    state.stepIndex = 0;
    state.wrongCount = 0;
    state.firstTry = true;
    $("#method-badge").innerHTML = `<span>${METHOD_LABELS[state.problem.type]}</span>`;
    buildEquation(state.problem);
    state.steps = buildSteps(state.problem);
    showStep();
  }

  function currentStep() {
    return state.steps[state.stepIndex];
  }

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
      Sound.correct();
      setFeedback(PRAISES[randInt(0, PRAISES.length - 1)], "good");
      await step.after?.();
      state.stepIndex++;
      if (state.stepIndex >= state.steps.length) {
        problemDone();
      } else {
        showStep();
      }
      return;
    }

    // まちがい
    Sound.wrong();
    state.wrongCount++;
    state.firstTry = false;
    state.streak = 0;
    updateStreak();
    const disp = $("#answer-display");
    disp.classList.remove("shake");
    void disp.offsetWidth;
    disp.classList.add("shake");

    if (state.wrongCount >= 3) {
      // 3回 まちがえたら こたえを 見せて すすむ
      state.buffer = String(step.answer);
      renderBuffer();
      setFeedback(`こたえは ${step.answer} だよ。いっしょに すすもう！`, "bad");
      setTimeout(async () => {
        await step.after?.();
        state.stepIndex++;
        if (state.stepIndex >= state.steps.length) problemDone();
        else showStep();
      }, 1400);
    } else {
      setFeedback(state.wrongCount === 2 ? "ヒント：" + step.hint : "おしい！もういちど！", "bad");
      state.buffer = "";
      setTimeout(() => {
        renderBuffer();
        state.accepting = true;
      }, 350);
    }
  }

  function problemDone() {
    const p = state.problem;
    eqAnsEl.textContent = p.answer;
    eqAnsEl.classList.add("answered");

    // 記録
    const rec = records[p.type];
    rec.solved++;
    if (state.firstTry) {
      state.streak++;
      if (state.streak > rec.best) rec.best = state.streak;
    }
    saveRecords();
    updateStreak();

    state.setSolved++;
    renderStars();

    // せいかいの えんしゅつ
    Sound.fanfare();
    $("#correct-text").textContent = state.firstTry ? "せいかい！" : "できたね！";
    const overlay = $("#overlay-correct");
    overlay.classList.add("show");
    setTimeout(() => {
      overlay.classList.remove("show");
      if (state.setSolved >= SET_SIZE) showSetComplete();
      else nextProblem();
    }, 1400);
  }

  function showSetComplete() {
    $("#set-stars").textContent = "⭐".repeat(SET_SIZE);
    const total = records.add.solved + records.genka.solved + records.gengen.solved;
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

  // ---------- きろく画面 ----------
  function renderRecords() {
    const list = $("#records-list");
    list.innerHTML = "";
    RECORD_DEFS.forEach((def) => {
      const r = records[def.key];
      const card = document.createElement("div");
      card.className = "record-card";
      card.innerHTML =
        `<div class="record-name">${def.name}<small>${def.small}</small></div>` +
        `<div class="record-nums">といた かず <b>${r.solved}</b> もん<br>れんぞく せいかい さいこう <b>${r.best}</b></div>`;
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

  // ---------- イベント ----------
  function bindEvents() {
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.unlock();
        const dest = btn.dataset.goto;
        if (dest === "add") return startMode("add");
        if (dest === "quit") return showScreen("home");
        if (dest === "records") renderRecords();
        showScreen(dest);
      });
    });

    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Sound.unlock();
        startMode(btn.dataset.mode);
      });
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

    $("#btn-sound").addEventListener("click", () => {
      Sound.setMuted(!Sound.isMuted());
      $("#btn-sound").textContent = Sound.isMuted() ? "🔇" : "🔊";
    });

    $("#btn-reset-records").addEventListener("click", () => {
      if (confirm("きろくを ぜんぶ けしますか？")) {
        records = { add: { solved: 0, best: 0 }, genka: { solved: 0, best: 0 }, gengen: { solved: 0, best: 0 } };
        saveRecords();
        renderRecords();
      }
    });

    // キーボードでも 入力できるように（PCむけ）
    document.addEventListener("keydown", (e) => {
      if (!$("#screen-play").classList.contains("active")) return;
      if (e.key >= "0" && e.key <= "9") onDigit(e.key);
      else if (e.key === "Backspace") onDelete();
      else if (e.key === "Enter") onOk();
    });
  }

  buildKeypad();
  bindEvents();
})();
