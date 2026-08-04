/**
 * 中核ロジックの テスト。
 *
 *   node --test 'tests/*.test.mjs'
 *
 * ここで まもりたいのは 2つ。
 *   ① study.records.v1 は 複数アプリ共通の キーである。
 *      このアプリの つごうで けしたり、こわしたり しては ならない。
 *   ② 学習ログに 個人情報を 入れない。
 *
 * js/ の ファイルは ビルドせず <script> で よみこむ 形（IIFE）なので、
 * ここでは vm で 走らせて、globalThis に 出てくる ものを 見る。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');

/** ブラウザの まねごと。localStorage は ただの Map。 */
function makeSandbox(initialStore = {}) {
    const store = new Map(Object.entries(initialStore));
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (i) => [...store.keys()][i] ?? null,
    };
    const sandbox = {
        localStorage,
        crypto: { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
        console: { warn() {}, error() {}, log() {} },
        Date, Math, JSON, Array, Object, String, Number, Boolean, isNaN, parseInt, parseFloat,
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    return { sandbox, store };
}

function load(sandbox, ...files) {
    for (const f of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
    }
}

/**
 * 読み出しかたを 2とおり 用意する。
 *   studyLog.js  … global.StudyLog = {...} なので sandbox の プロパティに 出る
 *   studyStats.js … トップレベルの const なので プロパティには 出ない
 *                   （ブラウザの <script> でも window の プロパティには ならない。
 *                     あとから 走る スクリプトからは 名前で 見える）
 */
const pick = (sandbox, name) => vm.runInContext(name, sandbox);

const validRecord = () => ({
    appId: 'keisan-block',
    startedAt: '2026-08-04T09:00:00.000Z',
    elapsedMs: 300000,
    unit: { id: 'add-carry', title: 'たしざん（くりあがり）' },
    mode: 'add',
    summary: { count: 10, attempted: 10, correct: 9, firstTryCorrect: 7 },
    items: [],
});

test('学習ログを 保存できる', () => {
    const { sandbox, store } = makeSandbox();
    load(sandbox, 'js/studyLog.js');
    const id = sandbox.StudyLog.saveStudyRecord(validRecord());
    assert.ok(id, '保存できていない');
    const log = JSON.parse(store.get('study.records.v1'));
    assert.equal(log.length, 1);
    assert.equal(log[0].schema, 'study.v1');
});

test('ほかのアプリの ログを けさない・こわさない', () => {
    // 別アプリが 先に 書いた レコードが 1件 ある状態から はじめる
    const other = [{ schema: 'study.v1', id: 'other-1', appId: 'haiku-meeting', elapsedMs: 1000 }];
    const { sandbox, store } = makeSandbox({
        'study.records.v1': JSON.stringify(other),
        'townmap-mikke-v1': '{"keep":true}',
    });
    load(sandbox, 'js/studyLog.js');
    sandbox.StudyLog.saveStudyRecord(validRecord());

    const log = JSON.parse(store.get('study.records.v1'));
    assert.equal(log.length, 2, '追記ではなく 上書きしている');
    assert.equal(log[0].id, 'other-1', 'ほかのアプリの レコードが 消えている');
    assert.equal(store.get('townmap-mikke-v1'), '{"keep":true}', 'ほかのアプリの キーを さわっている');
});

test('学習ログに 個人情報を 入れない', () => {
    const { sandbox, store } = makeSandbox();
    load(sandbox, 'js/studyLog.js');
    sandbox.StudyLog.saveStudyRecord(validRecord());
    const text = store.get('study.records.v1');
    for (const word of ['@', 'name', 'メール', '出席番号']) {
        assert.ok(!text.includes(word), `学習ログに ${word} が 入っている`);
    }
});

test('こわれた ログでも 1件も 保存できなくならない', () => {
    // 一度 こわれた 端末が、以降ずっと 保存できない ままに なっては こまる
    const { sandbox, store } = makeSandbox({ 'study.records.v1': '{ これは JSON では ない' });
    load(sandbox, 'js/studyLog.js');
    const id = sandbox.StudyLog.saveStudyRecord(validRecord());
    assert.ok(id, 'こわれた ログから 立ち直れていない');
    assert.equal(JSON.parse(store.get('study.records.v1')).length, 1);
});

test('required な こうもくが 欠けた レコードは 受けつけない', () => {
    const { sandbox, store } = makeSandbox();
    load(sandbox, 'js/studyLog.js');
    const bad = [
        { ...validRecord(), appId: undefined },
        { ...validRecord(), unit: undefined },
        { ...validRecord(), elapsedMs: -1 },
        { ...validRecord(), elapsedMs: 'ながい' },
        { ...validRecord(), summary: undefined },
    ];
    for (const rec of bad) assert.equal(sandbox.StudyLog.saveStudyRecord(rec), null);
    assert.equal(store.has('study.records.v1'), false, '不正なのに 保存されている');
});

test('あしあとの 集計（いっぱつせいかい率）', () => {
    const { sandbox } = makeSandbox({
        'study.records.v1': JSON.stringify([
            { schema: 'study.v1', appId: 'keisan-block', startedAt: '2026-08-04T00:00:00.000Z',
              elapsedMs: 1000, mode: 'add', unit: { id: 'a', title: 'たしざん' },
              summary: { count: 10, attempted: 10, firstTryCorrect: 7 } },
            { schema: 'study.v1', appId: 'keisan-block', startedAt: '2026-08-03T00:00:00.000Z',
              elapsedMs: 1000, mode: 'add', unit: { id: 'a', title: 'たしざん' },
              summary: { count: 10, attempted: 10, firstTryCorrect: 3 } },
        ]),
    });
    load(sandbox, 'js/studyStats.js');
    const all = pick(sandbox, 'StudyStats').load();
    assert.equal(all.length, 2);
    const t = pick(sandbox, 'StudyStats').total(all);
    assert.equal(t.attempted, 20);
    assert.equal(pick(sandbox, 'StudyStats').firstTryRate(t), 0.5);
});

test('ほかのアプリの レコードを 自分の 集計に 入れない', () => {
    const { sandbox } = makeSandbox({
        'study.records.v1': JSON.stringify([
            { schema: 'study.v1', appId: 'keisan-block', startedAt: '2026-08-04T00:00:00.000Z',
              elapsedMs: 1000, mode: 'add', unit: { id: 'a', title: 'たしざん' },
              summary: { count: 4, attempted: 4, firstTryCorrect: 4 } },
            { schema: 'study.v1', appId: 'haiku-meeting', startedAt: '2026-08-04T00:00:00.000Z',
              elapsedMs: 1000, mode: 'haiku', unit: { id: 'h', title: 'はいく' },
              summary: { count: 99, attempted: 99, firstTryCorrect: 0 } },
        ]),
    });
    load(sandbox, 'js/studyStats.js');
    const t = pick(sandbox, 'StudyStats').total(pick(sandbox, 'StudyStats').load());
    assert.equal(t.attempted, 4, 'ほかのアプリの ぶんまで かぞえている');
});
