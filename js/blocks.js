/* ============================================================
   算数ブロックと さくらんぼの 描画・アニメーション
   ・10のまとまり（10のわく）／ばら／10のぼう を ラベルと かずつきで 見せる
   ・こどもが タップして じぶんで うごかす／とる ための しくみ
   ============================================================ */

const Blocks = (() => {
  const FLY_MS = 560;

  // ---------- かたまり（グループ）と かずの ひょうじ ----------

  /** ブロックの かたまりを 「なまえ＋いくつ」の ラベルつきの はこに いれる */
  function makeGroup(container, contentEl, caption, countSel, unit = "こ") {
    const wrap = document.createElement("div");
    wrap.className = "block-group";
    wrap.dataset.countSel = countSel;
    wrap.appendChild(contentEl);
    if (caption) {
      const cap = document.createElement("div");
      cap.className = "group-caption";
      cap.innerHTML = `${caption} <b class="cap-count">0</b>${unit}`;
      wrap.appendChild(cap);
    }
    container.appendChild(wrap);
    refreshCounts();
    return wrap;
  }

  /**
   * それぞれの かたまりに いま いくつ あるかを 数字で 出しなおす。
   * 10こ そろったら みどりに ひからせて「10のまとまり」を つよく 見せる。
   */
  function refreshCounts() {
    document.querySelectorAll("#block-stage .block-group").forEach((g) => {
      const n = g.dataset.countSel ? g.querySelectorAll(g.dataset.countSel).length : 0;
      const frame = g.querySelector(".ten-frame");
      if (frame) frame.classList.toggle("full", n >= 10);
      const el = g.querySelector(".cap-count");
      if (!el || el.textContent === String(n)) return;
      el.textContent = n;
      el.classList.remove("bump");
      void el.offsetWidth; // アニメを 再スタートさせる
      el.classList.add("bump");
    });
  }

  /** ブロックが ふえたり へったり したら かずの ひょうじを 自動で 合わせる */
  function watchStage() {
    const stage = document.getElementById("block-stage");
    if (!stage) return;
    new MutationObserver(refreshCounts).observe(stage, { childList: true, subtree: true });
  }

  // ---------- 10のまとまり（10のわく） ----------

  /** 10のまとまりの わく（2だん×5こ）を描画し、count こブロックを入れる */
  function renderTenFrame(container, count, colorClass, caption) {
    container.innerHTML = "";
    const frame = document.createElement("div");
    frame.className = "ten-frame";
    const slots = [];
    for (let i = 0; i < 10; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      if (i < count) slot.appendChild(makeBlock(colorClass));
      frame.appendChild(slot);
      slots.push(slot);
    }
    makeGroup(container, frame, caption, ".block");
    return slots;
  }

  /** 10こ そろった しゅんかんを 「10の まとまり！」と 見せて つよく のこす */
  function flashFrame(container) {
    return new Promise((resolve) => {
      const frame = container.querySelector(".ten-frame");
      if (!frame) { resolve(); return; }
      const tag = document.createElement("div");
      tag.className = "frame-tag";
      tag.textContent = "10の まとまり できた！";
      frame.appendChild(tag);
      setTimeout(() => { tag.remove(); resolve(); }, 1000);
    });
  }

  // ---------- ばらのブロック ----------

  /** ばらの かたまりを 1つ つくる（5こずつの だん） */
  function makeLooseGroup(row, count, colorClass) {
    const group = document.createElement("div");
    group.className = "loose-group";
    const cols = Math.min(5, Math.max(count, 1));
    group.style.gridTemplateColumns = `repeat(${cols}, var(--slot-size))`;
    const slots = [];
    for (let i = 0; i < count; i++) {
      const slot = document.createElement("div");
      slot.className = "slot loose-slot";
      slot.appendChild(makeBlock(colorClass));
      group.appendChild(slot);
      slots.push(slot);
    }
    row.appendChild(group);
    return slots;
  }

  function renderLoose(container, count, colorClass, caption) {
    container.innerHTML = "";
    const row = document.createElement("div");
    row.className = "loose-row";
    const slots = makeLooseGroup(row, count, colorClass);
    makeGroup(container, row, caption, ".block");
    return slots;
  }

  /**
   * ばらを さくらんぼの とおりに 2つの かたまりに 分けなおす。
   * 「7を 2と 5に わける」が ブロックでも 目に見えるようになる。
   */
  function splitLoose(container, leftCount, rightCount, colorClass) {
    const row = container.querySelector(".loose-row");
    row.innerHTML = "";
    row.classList.add("split");
    const left = makeLooseGroup(row, leftCount, colorClass);
    const divider = document.createElement("span");
    divider.className = "loose-divider";
    row.appendChild(divider);
    const right = makeLooseGroup(row, rightCount, colorClass);
    left.forEach((s) => s.classList.add("part-a"));
    right.forEach((s) => s.classList.add("part-b"));
    row.querySelectorAll(".block").forEach((b) => b.classList.add("pop"));
    return { left, right, all: left.concat(right) };
  }

  /** からっぽに なった かたまりと しきりを かたづけて 見やすくする */
  function tidyLoose(container) {
    const row = container.querySelector(".loose-row");
    if (!row) return;
    row.querySelectorAll(".loose-group").forEach((g) => {
      if (!g.querySelector(".block")) g.remove();
    });
    if (row.querySelectorAll(".loose-group").length < 2) {
      row.querySelectorAll(".loose-divider").forEach((d) => d.remove());
    }
  }

  function makeBlock(colorClass) {
    const b = document.createElement("div");
    b.className = "block " + colorClass;
    return b;
  }

  // ---------- うごき ----------

  /** fromSlot のブロックを toSlot へ とばす */
  function flyBlock(fromSlot, toSlot, colorClass, delay = 0) {
    return new Promise((resolve) => {
      const fromBlock = fromSlot.querySelector(".block");
      if (!fromBlock || !toSlot) { resolve(); return; }
      const fr = fromBlock.getBoundingClientRect();
      const clone = fromBlock.cloneNode(true);
      clone.classList.add("flying");
      clone.style.left = fr.left + "px";
      clone.style.top = fr.top + "px";
      document.body.appendChild(clone);
      fromBlock.remove();
      setTimeout(() => {
        const tr = toSlot.getBoundingClientRect();
        const dx = tr.left + (tr.width - fr.width) / 2 - fr.left;
        const dy = tr.top + (tr.height - fr.height) / 2 - fr.top;
        clone.style.transform = `translate(${dx}px, ${dy}px)`;
        setTimeout(() => {
          clone.remove();
          const b = makeBlock(colorClass);
          b.classList.add("pop");
          toSlot.appendChild(b);
          resolve();
        }, FLY_MS + 60);
      }, 30 + delay);
    });
  }

  /** slot のブロックを けす（上へ とんでいく） */
  function flyAway(slot, delay = 0) {
    return new Promise((resolve) => {
      const b = slot.querySelector(".block");
      if (!b) { resolve(); return; }
      setTimeout(() => {
        b.classList.add("fly-away");
        setTimeout(() => { b.remove(); resolve(); }, FLY_MS + 40);
      }, delay);
    });
  }

  /** スロットの点滅ハイライトを つける／けす */
  function highlight(slots, on) {
    slots.forEach((s) => s.classList.toggle("hl", on));
  }

  /** ブロックを ドキドキさせる */
  function pulseBlocks(slots, on) {
    slots.forEach((s) => {
      const b = s.querySelector(".block");
      if (b) b.classList.toggle("pulse", on);
    });
  }

  // ---------- タップして そうさする ----------

  /** スロットを タップできる じょうたいに する */
  function enableTap(slots, handler) {
    slots.forEach((s) => {
      s.classList.add("tappable");
      s._tap = () => handler(s);
      s.addEventListener("click", s._tap);
    });
  }

  function disableTap(slots) {
    slots.forEach((s) => {
      s.classList.remove("tappable", "hint");
      if (s._tap) { s.removeEventListener("click", s._tap); s._tap = null; }
    });
  }

  /** つぎに そうさする 1こを えらぶ（まとまりから とるときは うしろから） */
  function nextTarget(slots, fromEnd, itemSel = ".block") {
    const filled = slots.filter((s) => s.querySelector(itemSel));
    return fromEnd ? filled[filled.length - 1] : filled[0];
  }

  /** まだ そうさして いない スロットを ゆらして 気づかせる */
  function hintNext(slots, on, fromEnd, itemSel = ".block") {
    slots.forEach((s) => s.classList.remove("hint"));
    if (!on) return;
    const next = nextTarget(slots, fromEnd, itemSel);
    if (next) next.classList.add("hint");
  }

  /** 「1・2・3…」と かぞえた 数字を ブロック（または あきマス）に つける */
  function setCountBadge(slot, n) {
    if (n == null) {
      slot.querySelectorAll(".count-badge").forEach((x) => x.remove());
      return;
    }
    const host = slot.querySelector(".block") || slot;
    let b = slot.querySelector(".count-badge");
    if (!b || b.parentElement !== host) {
      slot.querySelectorAll(".count-badge").forEach((x) => x.remove());
      b = document.createElement("span");
      b.className = "count-badge";
      host.appendChild(b);
    }
    b.textContent = n;
    b.classList.remove("pop");
    void b.offsetWidth;
    b.classList.add("pop");
  }

  // ---------- 10のぼう（はってんモード） ----------

  /** 10のぼうを count ほん ならべる */
  function renderRods(container, count, caption) {
    container.innerHTML = "";
    if (count <= 0) return [];
    const group = document.createElement("div");
    group.className = "rod-group";
    const rods = [];
    for (let i = 0; i < count; i++) {
      const rod = makeRod();
      group.appendChild(rod);
      rods.push(rod);
    }
    makeGroup(container, group, caption, ".ten-rod", "ほん");
    return rods;
  }

  function makeRod() {
    const rod = document.createElement("div");
    rod.className = "ten-rod";
    rod.innerHTML = '<span class="rod-label">10</span>';
    return rod;
  }

  /**
   * タップして うごかせる 10のぼうの かたまり。
   * ぼうを 1本ずつ わくに いれて おくことで、ブロックと おなじように さわれる。
   * opts.append を true に すると、いまの かたまりの となりに おきたす。
   */
  function addRodGroup(container, count, caption, opts = {}) {
    if (!opts.append) container.innerHTML = "";
    const group = document.createElement("div");
    group.className = "rod-group";
    const slots = [];
    for (let i = 0; i < count; i++) {
      const slot = document.createElement("div");
      slot.className = "rod-slot";
      slot.appendChild(makeRod());
      group.appendChild(slot);
      slots.push(slot);
    }
    makeGroup(container, group, caption, ".ten-rod", "ほん");
    return { group, slots };
  }

  /** ぼうを 1本 となりの かたまりへ とばして いれる */
  function moveRod(fromSlot, toGroup) {
    return new Promise((resolve) => {
      const rod = fromSlot.querySelector(".ten-rod");
      if (!rod || !toGroup) { resolve(); return; }
      const fr = rod.getBoundingClientRect();
      const clone = rod.cloneNode(true);
      clone.classList.add("flying");
      clone.style.left = fr.left + "px";
      clone.style.top = fr.top + "px";
      document.body.appendChild(clone);
      rod.remove();
      // いきさきに さきに おいて、そこへ とばす
      const placed = makeRod();
      placed.style.visibility = "hidden";
      toGroup.appendChild(placed);
      requestAnimationFrame(() => {
        const tr = placed.getBoundingClientRect();
        clone.style.transform = `translate(${tr.left - fr.left}px, ${tr.top - fr.top}px)`;
        setTimeout(() => {
          clone.remove();
          placed.style.visibility = "";
          placed.classList.add("pop");
          refreshCounts();
          resolve();
        }, FLY_MS + 60);
      });
    });
  }

  /** ぼうを 1本 とりのぞく（上へ とんでいく） */
  function flyRodAway(slot, delay = 0) {
    return new Promise((resolve) => {
      const rod = slot.querySelector(".ten-rod");
      if (!rod) { resolve(); return; }
      setTimeout(() => {
        rod.classList.add("fly-away");
        setTimeout(() => { rod.remove(); refreshCounts(); resolve(); }, FLY_MS + 40);
      }, delay);
    });
  }

  /** まとまりの 10こが 1本の ぼうに がったいする */
  function collapseFrameToRod(frameSlots, rodContainer) {
    return new Promise((resolve) => {
      frameSlots.forEach((s, i) => {
        const b = s.querySelector(".block");
        if (b) setTimeout(() => b.classList.add("absorb"), i * 40);
      });
      setTimeout(() => {
        frameSlots.forEach((s) => { const b = s.querySelector(".block"); if (b) b.remove(); });
        let group = rodContainer.querySelector(".rod-group");
        if (!group) {
          group = document.createElement("div");
          group.className = "rod-group";
          rodContainer.appendChild(group);
        }
        const rod = makeRod();
        rod.classList.add("pop");
        group.appendChild(rod);
        resolve(rod);
      }, 10 * 40 + 350);
    });
  }

  /** 1本の ぼうが 10この ブロックに ばらけて まとまりに もどる */
  function breakRodToFrame(rodContainer, frameSlots, colorClass) {
    return new Promise((resolve) => {
      const rods = rodContainer.querySelectorAll(".ten-rod");
      const rod = rods[rods.length - 1];
      if (rod) {
        rod.classList.add("absorb");
        setTimeout(() => rod.remove(), 380);
      }
      setTimeout(() => {
        frameSlots.forEach((s, i) => {
          setTimeout(() => {
            const b = makeBlock(colorClass);
            b.classList.add("pop");
            s.appendChild(b);
          }, i * 45);
        });
        setTimeout(resolve, 10 * 45 + 320);
      }, 320);
    });
  }

  // ---------- さくらんぼ ----------

  /** さくらんぼ（2つの まる） */
  function makeCherry() {
    const root = document.createElement("div");
    root.className = "cherry";
    root.innerHTML =
      '<svg class="cherry-stems" viewBox="0 0 120 26" aria-hidden="true">' +
      '<line x1="60" y1="2" x2="25" y2="24"></line>' +
      '<line x1="60" y1="2" x2="95" y2="24"></line>' +
      "</svg>" +
      '<div class="cherry-pair">' +
      '<div class="cherry-circle">?</div>' +
      '<div class="cherry-circle">?</div>' +
      "</div>";
    const [c1, c2] = root.querySelectorAll(".cherry-circle");
    const fill = (el, v) => {
      el.textContent = v;
      el.classList.add("filled");
      el.classList.remove("pop");
      void el.offsetWidth; // アニメを 再スタートさせる
      el.classList.add("pop");
    };
    return {
      root,
      leftEl: c1,   // しるし（わ・ななめ線・のこりの かず）を つける ため
      rightEl: c2,
      setLeft(v) { fill(c1, v); },
      setRight(v) { fill(c2, v); },
    };
  }

  watchStage();

  return {
    renderTenFrame, renderLoose, splitLoose, tidyLoose, flashFrame,
    flyBlock, flyAway, highlight, pulseBlocks, refreshCounts,
    enableTap, disableTap, hintNext, nextTarget, setCountBadge,
    makeCherry, renderRods, collapseFrameToRod, breakRodToFrame,
    addRodGroup, moveRod, flyRodAway,
  };
})();
