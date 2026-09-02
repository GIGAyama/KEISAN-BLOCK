/* さんすうブロック — 使い方マニュアル（docs/manual/）の 画面写真を 撮り直す シナリオ。
 *
 *   python3 -m http.server 8000            # べつの まどで
 *   npm i --no-save playwright
 *   node .claude/skills/note-article/scripts/capture.mjs docs/manual/shots.mjs \
 *        --base http://127.0.0.1:8000/ --out docs/manual/images --strict
 *
 * ⚠️ ファイル名（01-home.png …）を 変えないこと。manual.md の 参照が 切れる。
 * ⚠️ 出る しきは Math.random() を 固定して 決め打ちにしてある。
 *    本文に 書いた 8＋7 / 13−9 / 22＋9 / 33−5 は、この 固定値から 出たもの。
 *    seed の 値を 変えると、本文と 写真が 食いちがう。
 * ⚠️ フッターの「つかいかた」の リンクは、<slug>.giga-school.com で ひらいた
 *    ときだけ 出る（web/giga-app-links.js がホスト名から slug を取るため）。
 *    05-home-footer.png を 撮り直す ときは、index.html の
 *    <span data-giga-links> に data-slug="keisan-block" を 一時的に 足した
 *    写しを 配って 撮ること。リポジトリの index.html には 足さない。
 */
export const viewport = { width: 390, height: 940 };

/* ---------------- 小道具 ---------------- */

/** Math.random を いつも同じ値に固定して、出る しきを 決め打ちにする */
const seed = (p, v) => p.eval((x) => { Math.random = () => x; return true; }, v);

/** 決まった順で ばらける 乱数（きろくの画面を それらしくするため） */
const seedVaried = (p, s) => p.eval((s0) => {
  let x = s0;
  Math.random = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  return true;
}, s);

const taskOpen = (p) => p.eval(() => !document.querySelector('#task-bar').hidden);
const overlayOpen = (p) => p.eval(() => !!document.querySelector('.overlay.show'));
const promptText = (p) => p.eval(() => document.querySelector('#prompt').textContent);
const eqText = (p) => p.eval(() => document.querySelector('#equation').textContent);

/** いま タップできる ブロックを 1こ おす（うしろから） */
const tapBlock = (p) => p.eval(() => {
  const s = [...document.querySelectorAll('.tappable')]
    .filter((e) => e.querySelector('.block, .ten-rod'));
  if (!s.length) return 0;
  s[s.length - 1].click();
  return s.length;
});

/** ブロックそうさが おわるまで タップし続ける */
const doTask = async (p, max = 40) => {
  for (let i = 0; i < max; i++) {
    if (!(await taskOpen(p))) return i;
    if (!(await tapBlock(p))) { await p.sleep(400); continue; }
    await p.sleep(650);
  }
  return max;
};

/** かぞえる ためのタップ（.countable）を n こ おす */
const tapCount = async (p, n) => {
  for (let i = 0; i < n; i++) {
    await p.eval((k) => { const s = [...document.querySelectorAll('.countable')]; if (s[k]) s[k].click(); }, i);
    await p.sleep(220);
  }
};

/** いま きかれている ことから、こたえを 出す（きかれるまで まつ） */
const parseAsk = (t, e) => {
  const num = (s) => Number(s);
  let m;
  if ((m = t.match(/(\d+)は あと いくつで (\d+)かな？/))) return num(m[2]) - num(m[1]);
  if ((m = t.match(/(\d+)を (\d+)と いくつに わけるかな？/))) return num(m[1]) - num(m[2]);
  if ((m = t.match(/(\d+)に (\d+)を たすと いくつかな？/))) return num(m[1]) + num(m[2]);
  if ((m = t.match(/(\d+)から (\d+)を ひくと いくつかな？/))) return num(m[1]) - num(m[2]);
  if ((m = t.match(/(\d+)と (\d+)で いくつかな？/))) return num(m[1]) + num(m[2]);
  if (/こたえは いくつかな？/.test(t)) {
    const mm = String(e).replace(/\s+/g, '').match(/(\d+)([＋−+\-])(\d+)/);
    if (mm) return mm[2] === '＋' || mm[2] === '+' ? num(mm[1]) + num(mm[3]) : num(mm[1]) - num(mm[3]);
  }
  return null;
};

/** 画面が「こたえて」と 言うまで まつ。演出の あいだは prompt が まだ 変わらない */
const wanted = async (p, timeoutMs = 15000) => {
  const start = Date.now();
  let t = '';
  while (Date.now() - start < timeoutMs) {
    t = await promptText(p);
    const v = parseAsk(t, await eqText(p));
    if (v !== null) return v;
    if (await taskOpen(p)) await doTask(p);
    else await p.sleep(300);
  }
  throw new Error('こたえが 分からない prompt: ' + t + ' / eq=' + (await eqText(p)));
};

/** キーパッドで こたえる */
const answer = async (p, v) => {
  for (const d of String(v)) { await p.click(d, { exact: true }); await p.sleep(160); }
  await p.sleep(850);
};

/** 1もん とききる。hooks で とちゅうの 画面を 撮る */
const solveOne = async (p, hooks = {}) => {
  for (let i = 0; i < 12; i++) {
    if (await overlayOpen(p)) return;
    if (await taskOpen(p)) {
      if (hooks.onTask) await hooks.onTask(i);
      await doTask(p);
    }
    if (await overlayOpen(p)) return;
    const v = await wanted(p);
    if (hooks.onStep) await hooks.onStep(i, v);
    await answer(p, v);
  }
};

/** せいかいの おしらせを とじる（「けいさんの しかた」は 5びょう まつ） */
const closeCorrect = async (p) => {
  const hasHowto = await p.eval(() => !document.querySelector('#howto-card').hidden
    && document.querySelector('#overlay-correct').classList.contains('show'));
  if (hasHowto) {
    await p.sleep(5800);
    await p.eval(() => document.querySelector('#btn-howto-next').click());
  }
  await p.sleep(1800);
};

/** セットの おしらせが 出るまで とき続ける */
const solveUntilSet = async (p, max = 8) => {
  for (let i = 0; i < max; i++) {
    if (await p.eval(() => document.querySelector('#overlay-set').classList.contains('show'))) return;
    if (await p.eval(() => document.querySelector('#overlay-result').classList.contains('show'))) return;
    await solveOne(p);
    await closeCorrect(p);
  }
};

/* ---------------- ほんばん ---------------- */

export default async ({ open, log }) => {
  const p = await open('keisan');

  /* ===== ホーム ===== */
  await p.shot('01-home', { expect: 'たしざん' });

  await p.resize(390, 330);
  await p.scrollTo('きょうの ミッション');
  await p.shot('03-home-level');

  await p.resize(390, 430);
  await p.scrollTo('タイムアタック');
  await p.shot('04-home-modes');

  await p.resize(390, 210);
  await p.scrollTo('さんすうブロック');
  await p.shot('02-home-header');

  await p.resize(820, 220);
  await p.scrollTo('© 2026', { optional: true });
  await p.shot('05-home-footer');
  log('footer html:', await p.eval(() => {
    const h = document.querySelector('[data-giga-links] *');
    return h && h.shadowRoot ? h.shadowRoot.textContent.replace(/\s+/g, ' ').trim() : '（部品が出ていない）';
  }));

  /* ===== たしざん（8＋7） ===== */
  await p.resize(390, 940);
  await seed(p, 0.6);                       // ADD_FACTS[15] = 8＋7
  await p.clickTo('たしざん', 'あと いくつで 10');
  await p.sleep(900);
  await p.shot('06-play-screen');

  await p.resize(390, 380);
  await p.scrollTo('10の まとまり');
  await p.shot('07-play-blocks');
  await p.resize(390, 940);

  // てじゅん1: かぞえる → こたえる
  await tapCount(p, 2);
  await p.shot('08-count-tap');
  await answer(p, await wanted(p));

  // てじゅん2: さくらんぼで わける
  await p.shot('11-add-step2');
  await answer(p, await wanted(p));
  await p.sleep(900);

  // てじゅん3: ブロックを うごかす
  await p.shot('09-task-move');
  await p.resize(390, 300);
  await p.scrollTo('じどうで うごかす');
  await p.shot('10-task-auto');
  await p.resize(390, 940);
  await doTask(p);
  await p.sleep(800);
  await p.shot('12-add-step3');
  await answer(p, await wanted(p));

  // てじゅん4
  await p.shot('13-add-step4');
  await answer(p, await wanted(p));
  await p.sleep(1200);
  await p.shot('23-howto');
  await closeCorrect(p);

  /* ===== まちがえた とき ===== */
  await p.sleep(600);
  const right = await wanted(p);
  const wrong = right === 9 ? 8 : 9;
  await p.click(String(wrong), { exact: true });
  await p.sleep(700);
  await p.shot('20-wrong');
  await p.sleep(500);
  await p.click(String(wrong), { exact: true });
  await p.sleep(700);
  await p.shot('21-hint');
  await p.sleep(500);
  await p.click(String(wrong), { exact: true });
  await p.sleep(600);
  await p.shot('22-answer');
  await p.sleep(2200);
  await solveOne(p);
  await closeCorrect(p);

  /* ===== 5もん クリア ===== */
  await solveUntilSet(p);
  await p.shot('24-set-clear', { expect: 'クリア' });
  await p.click('ホームへ');
  await p.sleep(900);

  /* ===== ひきざん ===== */
  await p.clickTo('ひきざん', 'さくせんを えらぼう');
  await p.shot('14-sub-select');

  await seed(p, 0.57);                      // SUB_FACTS[20] = 13−9
  await p.click('10から ひいて たす さくせん');
  await p.sleep(1200);
  await p.shot('15-genka-step1');
  await answer(p, await wanted(p));
  await p.sleep(900);
  await p.shot('16-genka-take');
  await doTask(p);
  await p.sleep(800);
  await p.shot('17-genka-step2');
  await p.click('やめる');
  await p.sleep(900);

  await p.clickTo('ひきざん', 'さくせんを えらぼう');
  await p.click('ばらから ひいて 10から ひく さくせん');
  await p.sleep(1200);
  await p.shot('18-gengen-step1');
  await answer(p, await wanted(p));
  await p.sleep(900);
  await doTask(p);
  await p.sleep(900);
  await p.shot('19-gengen-step2');
  await p.click('やめる');
  await p.sleep(900);

  /* ===== タイムアタック ===== */
  await seedVaried(p, 20260902);
  await p.click('タイムアタック');
  await p.sleep(1200);
  await p.shot('25-timed');
  for (let i = 0; i < 12; i++) {
    if (await p.eval(() => document.querySelector('#overlay-result').classList.contains('show'))) break;
    await answer(p, await wanted(p));
    await p.sleep(450);
  }
  await p.sleep(900);
  await p.shot('26-timed-result', { expect: 'タイム' });
  await p.click('ホームへ');
  await p.sleep(900);

  /* ===== はってん ===== */
  await p.clickTo('はってん', 'はってんもんだい');
  await p.shot('27-dev-select');

  await seed(p, 0.1);                       // 22＋9
  await p.click('たしざん');
  await p.sleep(1200);
  await p.shot('28-dev-add');
  await solveOne(p);
  await closeCorrect(p);
  await p.click('やめる');
  await p.sleep(900);

  await p.clickTo('はってん', 'はってんもんだい');
  await seed(p, 0.3);                       // 33−5
  await p.click('ひきざん');
  await p.sleep(1200);
  await solveOne(p, {
    onTask: async (i) => { if (i === 2) { await p.sleep(1800); await p.shot('29-dev-sub'); } },
  });
  await closeCorrect(p);
  await p.click('やめる');
  await p.sleep(900);

  /* ===== じぶんで しきを いれる ===== */
  await p.clickTo('じぶんで しきを いれる', 'わからない もんだい');
  await p.shot('30-free-empty');

  for (const d of ['3']) await p.click(d, { exact: true });
  await p.click('−', { exact: true });
  for (const d of ['5', '2']) await p.click(d, { exact: true });
  await p.sleep(600);
  await p.shot('31-free-warn');

  await p.click('ぜんぶ けす');
  await p.sleep(400);
  for (const d of ['1', '3']) await p.click(d, { exact: true });
  await p.click('−', { exact: true });
  await p.click('9', { exact: true });
  await p.sleep(700);
  await p.shot('32-free-method');

  await p.eval(() => { const c = document.querySelector('#free-explain'); c.click(); });
  await p.sleep(500);
  await p.shot('33-free-explain-switch');

  await p.click('はじめる');
  await p.sleep(1400);
  await p.shot('34-free-explain-play');
  // せつめいモードでも、ブロックを うごかす ところは 手で さわる
  for (let i = 0; i < 30; i++) {
    if (await p.eval(() => document.querySelector('#overlay-free-done').classList.contains('show'))) break;
    // さいごの てじゅんの あとは「けいさんの しかた」が 出る。5びょう まって とじる
    if (await p.eval(() => document.querySelector('#overlay-correct').classList.contains('show'))) {
      await closeCorrect(p);
      continue;
    }
    if (await taskOpen(p)) { await doTask(p); await p.sleep(600); continue; }
    if (await p.eval(() => document.querySelector('#explain-bar').hidden)) { await p.sleep(400); continue; }
    await p.eval(() => document.querySelector('#btn-explain').click());
    await p.sleep(800);
  }
  await p.sleep(700);
  await p.shot('35-free-done', { expect: 'べつの しきを いれる' });
  await p.click('ホームへ');
  await p.sleep(900);

  /* ===== きろく ===== */
  await p.clickTo('きろく', 'がんばりの きろく');
  await p.sleep(700);
  await p.shot('36-records-stats');
  await p.click('あしあと');
  await p.sleep(700);
  await p.shot('37-records-log');
  await p.click('マップ');
  await p.sleep(700);
  await p.shot('38-records-map');
  await p.click('カレンダー');
  await p.sleep(700);
  await p.shot('39-records-calendar');
  await p.click('バッジ');
  await p.sleep(700);
  await p.shot('40-records-badges');

  await p.click('せいせき');
  await p.sleep(600);
  await p.resize(390, 260);
  await p.scrollTo('きろくを ぜんぶ けす');
  await p.shot('41-records-reset');
  await p.resize(390, 940);
  await p.click('もどる');
  await p.sleep(900);

  /* ===== 大きく表示（電子黒板） ===== */
  await p.click('大きく表示（電子黒板）');
  await p.sleep(1200);
  await p.shot('42-present');
  log('present buttons:', await p.buttons());

  /* ===== インターネットに つながっていない とき ===== */
  const q = await open('offline', { url: 'http://127.0.0.1:4180/offline.html' });
  await q.shot('43-offline');
};
