/* ============================================================
   算数ブロックと さくらんぼの 描画・アニメーション
   ============================================================ */

const Blocks = (() => {
  const FLY_MS = 560;

  /** 10のわく（2だん×5こ）を描画し、count こブロックを入れる */
  function renderTenFrame(container, count, colorClass) {
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
    container.appendChild(frame);
    return slots;
  }

  /** ばらのブロック（5こずつの だん） */
  function renderLoose(container, count, colorClass) {
    container.innerHTML = "";
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
    container.appendChild(group);
    return slots;
  }

  function makeBlock(colorClass) {
    const b = document.createElement("div");
    b.className = "block " + colorClass;
    return b;
  }

  /** fromSlot のブロックを toSlot へ とばす */
  function flyBlock(fromSlot, toSlot, colorClass, delay = 0) {
    return new Promise((resolve) => {
      const fromBlock = fromSlot.querySelector(".block");
      if (!fromBlock) { resolve(); return; }
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

  /** さくらんぼ（2つの まる） */
  function makeCherry() {
    const root = document.createElement("div");
    root.className = "cherry";
    root.innerHTML =
      '<svg class="cherry-stems" viewBox="0 0 120 26" aria-hidden="true">' +
      '<line x1="60" y1="2" x2="32" y2="24"></line>' +
      '<line x1="60" y1="2" x2="88" y2="24"></line>' +
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
      setLeft(v) { fill(c1, v); },
      setRight(v) { fill(c2, v); },
    };
  }

  return { renderTenFrame, renderLoose, flyBlock, flyAway, highlight, pulseBlocks, makeCherry };
})();
