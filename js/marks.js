/* ============================================================
   しきに つける「しるし」
   きょうかしょで えんぴつを つかって かきこむ しるしを
   そのまま がめんの しきの うえに 見せる。

   ・loop   … 10を つくる かずどうしを ○（わ）で かこむ（「10」の ふだつき）
   ・tie    … あわせる 2つの かずを した がわの カーブで むすぶ
   ・strike … つかいおわった かずに ななめの せんを ひく
   ・under  … ひきざんの のこりを その下に 小さく かきこむ
   ・tint   … いま つかっている かずを オレンジに する
   ・focus  … これから あわせる かずを ゆらして 見せる

   わは 2つの かずの まんなかを むすぶ ななめの じくで かくので、
   「9」と さくらんぼの「1」のように たてに ずれた ばあいでも
   きょうかしょと おなじ かたむいた わに なる。
   さくらんぼの 2つの まるは となりあって いて わでは わけられないので、
   「のこりの かず と みぎの まる」だけは tie（カーブ）で むすぶ。
   ============================================================ */

const Marks = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const PAD = 7;         // わの ふくらみ（px）
  const SNUG = 0.86;     // かずの まわりの よはくを つめる わりあい
  const DRAW_MS = 700;   // わを かきおわるまでの じかん

  let host = null;    // #equation
  let layer = null;   // しるしを のせる とうめいな いた
  let svg = null;
  let loops = [];     // かきなおしの ための わの ていぎ
  let focused = [];
  let observing = false;

  // ---------- じゅんび ----------

  /** もんだいが かわる たびに よぶ（しるしを ぜんぶ まっさらに する） */
  function reset(container) {
    host = container || host;
    if (!host) return;
    host.querySelectorAll(".mark-layer").forEach((l) => l.remove());
    loops = [];
    focused = [];
    host.classList.remove("has-under");

    layer = document.createElement("div");
    layer.className = "mark-layer";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "mark-svg");
    layer.appendChild(svg);
    host.appendChild(layer);

    // がめんの おおきさが かわっても わの いちが ずれないように する
    if (!observing && window.ResizeObserver) {
      new ResizeObserver(() => redraw()).observe(host);
      observing = true;
    }
  }

  // ---------- わ（○で かこむ） ----------

  /**
   * ならんだ かずを ひとつの わで かこむ。
   * opts.label を わたすと わの よこに 「10」などの ふだを つける。
   * もどりち: { label, ell }（あとから focus する ために つかう）
   */
  function loop(els, opts = {}) {
    const targets = (els || []).filter(Boolean);
    if (!layer || targets.length === 0) return null;

    // まるい はしの ながまる（きょうかしょの えんぴつの わと おなじ かたち）
    const ell = document.createElementNS(NS, "rect");
    ell.setAttribute("class", "mark-loop" + (opts.tone ? " tone-" + opts.tone : ""));
    svg.appendChild(ell);

    let label = null;
    if (opts.label != null) {
      label = document.createElement("div");
      label.className = "mark-label";
      label.textContent = opts.label;
      layer.appendChild(label);
    }

    const item = { targets, ell, label, snug: opts.snug || SNUG, drawn: false };
    loops.push(item);
    place(item, true);
    return { label, ell };
  }

  /**
   * 2つの かずを した がわの カーブで むすぶ。
   * さくらんぼの まるが となりあって いて わでは かこめない ところ
   * （けした 10の 下の のこりと、みぎの まる）に つかう。
   */
  function tie(a, b) {
    if (!layer || !a || !b) return null;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("class", "mark-tie");
    svg.appendChild(path);
    const item = { tie: true, targets: [a, b], ell: path, label: null, snug: SNUG, drawn: false };
    loops.push(item);
    place(item, true);
    return { path };
  }

  /** むすびの カーブ（ひだりの かずの みぎよこ → みぎの かずの した） */
  function placeTie(item, origin) {
    const [ra, rb] = item.targets.map((t) => t.getBoundingClientRect());
    const p1 = { x: ra.right - origin.left + 2, y: (ra.top + ra.bottom) / 2 - origin.top };
    const p2 = { x: (rb.left + rb.right) / 2 - origin.left, y: rb.bottom - origin.top + 2 };
    const dip = Math.max(p1.y, p2.y) + 22;
    item.ell.setAttribute("d", `M ${p1.x} ${p1.y} C ${p1.x + 10} ${dip}, ${p2.x - 10} ${dip}, ${p2.x} ${p2.y}`);
    return item.ell.getTotalLength();
  }

  /** かこむ かずの まんなかを むすぶ じくで、かたむいた ながまるを もとめる */
  function geometry(targets, origin, snug) {
    const rects = targets.map((t) => t.getBoundingClientRect());
    if (rects.some((r) => r.width === 0 && r.height === 0)) return null;

    // 文字の まわりの よはくの ぶんは すこし うちがわに つめる
    const boxes = rects.map((r) => ({
      x: r.left + r.width / 2 - origin.left,
      y: r.top + r.height / 2 - origin.top,
      hw: (r.width / 2) * snug,
      hh: (r.height / 2) * snug,
    }));
    const first = boxes[0];
    const last = boxes[boxes.length - 1];
    const cx = (first.x + last.x) / 2;
    const cy = (first.y + last.y) / 2;
    const ang = boxes.length > 1 ? Math.atan2(last.y - first.y, last.x - first.x) : 0;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);

    // じくの むき（ながさ）と それに ちょくかくな むき（はば）の おおきさ
    let halfLen = 0;
    let halfWid = 0;
    boxes.forEach((b) => {
      const du = (b.x - cx) * cos + (b.y - cy) * sin;
      const dv = -(b.x - cx) * sin + (b.y - cy) * cos;
      const eu = Math.abs(b.hw * cos) + Math.abs(b.hh * sin);
      const ev = Math.abs(b.hw * sin) + Math.abs(b.hh * cos);
      halfLen = Math.max(halfLen, Math.abs(du) + eu);
      halfWid = Math.max(halfWid, Math.abs(dv) + ev);
    });

    const w = 2 * (halfWid + PAD);
    return {
      cx, cy, ang, last,
      len: Math.max(2 * (halfLen + PAD), w),
      wid: w,
      deg: (ang * 180) / Math.PI,
    };
  }

  /** ながまるの まわりの ながさ */
  function perimeter(len, wid) {
    return 2 * (len - wid) + Math.PI * wid;
  }

  function place(item, animate) {
    if (!layer || !layer.isConnected) return;
    const origin = layer.getBoundingClientRect();
    const { ell } = item;
    let len;
    let g = null;

    if (item.tie) {
      len = placeTie(item, origin);
    } else {
      g = geometry(item.targets, origin, item.snug);
      if (!g) return;
      ell.setAttribute("x", g.cx - g.len / 2);
      ell.setAttribute("y", g.cy - g.wid / 2);
      ell.setAttribute("width", g.len);
      ell.setAttribute("height", g.wid);
      ell.setAttribute("rx", g.wid / 2);
      ell.setAttribute("ry", g.wid / 2);
      ell.setAttribute("transform", `rotate(${g.deg} ${g.cx} ${g.cy})`);
      len = perimeter(g.len, g.wid);
    }
    ell.style.strokeDasharray = len;
    if (animate && !item.drawn) {
      // えんぴつで ぐるっと かいていく ように 見せる
      item.drawn = true;
      ell.style.transition = "none";
      ell.style.strokeDashoffset = len;
      requestAnimationFrame(() => {
        ell.style.transition = `stroke-dashoffset ${DRAW_MS}ms ease-out`;
        ell.style.strokeDashoffset = 0;
      });
    } else {
      ell.style.strokeDashoffset = 0;
    }

    if (item.label && g) placeLabel(item.label, g, origin);
  }

  /**
   * ふだ（「10」など）は わの おわりがわ（さくらんぼの まる）の ひだりよこ。
   * きょうかしょでも 「10」は わの したの ほうの よこに かいてある。
   */
  function placeLabel(label, g, origin) {
    const gap = 14;
    const w = label.offsetWidth || 28;
    const x = g.last.x - g.wid / 2 - gap;
    label.style.top = g.last.y + "px";
    if (x - w < -Math.max(origin.left - 6, 0)) {
      label.style.left = g.last.x + g.wid / 2 + gap + "px";
      label.style.transform = "translateY(-50%)";
    } else {
      label.style.left = x + "px";
      label.style.transform = "translate(-100%, -50%)";
    }
  }

  function redraw() {
    loops.forEach((item) => place(item, false));
  }

  // ---------- かずに じかに つける しるし ----------

  /** つかいおわった かずに ななめの せんを ひく（10から 9を ひいた あとの 10 など） */
  function strike(el) {
    if (!el || el.querySelector(".mk-strike")) return null;
    const s = document.createElement("span");
    s.className = "mk-strike";
    el.appendChild(s);
    return s;
  }

  /** ひいた のこりを その かずの 下に 小さく かきこむ */
  function under(el, text) {
    if (!el) return null;
    el.querySelectorAll(".mk-under").forEach((x) => x.remove());
    const u = document.createElement("span");
    u.className = "mk-under";
    u.textContent = text;
    el.appendChild(u);
    if (host) host.classList.add("has-under");
    return u;
  }

  /** いま つかっている かずを オレンジに する */
  function tint(el) { if (el) el.classList.add("mk-used"); }

  /** これから あわせる（ひく）かずを ゆらして 見せる */
  function focus(els) {
    unfocus();
    focused = (els || []).filter(Boolean);
    focused.forEach((e) => e.classList.add("mk-focus"));
  }

  function unfocus() {
    focused.forEach((e) => e.classList.remove("mk-focus"));
    focused = [];
  }

  return { reset, loop, tie, strike, under, tint, focus, unfocus, redraw };
})();
