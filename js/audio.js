/* ============================================================
   おとの えんしゅつ (WebAudio)
   音声ファイルなしで かんたんな効果音を鳴らす
   ============================================================ */

const Sound = (() => {
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type = "sine", gain = 0.18) {
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.05);
  }

  return {
    unlock() { ensureCtx(); },
    tap() { tone(880, 0, 0.08, "square", 0.06); },
    correct() { tone(660, 0, 0.12); tone(880, 0.1, 0.2); },
    wrong() { tone(220, 0, 0.25, "sawtooth", 0.08); },
    move() { tone(520, 0, 0.1, "triangle", 0.1); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.22));
    },
    levelup() {
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.1, 0.25));
    },
    badge() {
      tone(784, 0, 0.15); tone(988, 0.12, 0.15); tone(1319, 0.24, 0.3);
    },
    setMuted(v) { muted = v; },
    isMuted() { return muted; },
  };
})();
