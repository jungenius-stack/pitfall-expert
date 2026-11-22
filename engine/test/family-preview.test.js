'use strict';
/** 展示保真测试，不是用户理解/真实风险实验；只在临时卡库运行，账本由测试命令关闭。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const {scan, loadCards} = require('../src/scanner');
const {buildFamilyPreview} = require('../../eval/family-preview.cjs');
const {cards, cases} = require('../../eval/family-preview-fixture.cjs');
const stripPreview = text => text.replace(/^<!-- family-preview -->[^\n]*\n/gm, '');
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-family-'));
  try {
    fs.writeFileSync(path.join(dir, 'fixture.yaml'), yaml.dump({version: 'fixture', domain: 'code', cards}));
    const lib = loadCards(dir);
    assert.deepEqual(lib.errors, []);
    return fn(dir, lib.cards);
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
}
for (const c of cases) {
  test(`母子预览：${c.label}，不改召回、不删正文及验证器`, () => fixture((dir, lib) => {
    const r = scan(c.task, {cardsDir: dir, source: 'diagnostic'});
    assert.deepEqual(r.matched.map(s => s.card.id), c.expected);
    const snapshot = JSON.stringify(r);
    const {baseline, candidate} = buildFamilyPreview(r, r.matched.map(s => s.card).concat(lib.filter(c => !r.matched.some(s => s.card.id === c.id))));
    assert.equal(JSON.stringify(r), snapshot);
    assert.equal(stripPreview(candidate), baseline);
    assert.equal(candidate.slice(candidate.indexOf('## 验证器清单')), baseline.slice(baseline.indexOf('## 验证器清单')));
    assert.ok(candidate.includes('## ✅ 这次扫描确认了什么'));
    for (const s of r.matched) {
      assert.equal(candidate.split(`### [${s.card.id}]`).length - 1, 1);
      assert.ok(candidate.includes(s.card.evidence.source));
      assert.ok(candidate.includes(s.card.fix));
      assert.ok(candidate.includes(s.card.verifier));
    }
    assert.equal(candidate.includes('<details>'), c.id === 'both');
    if (c.id === 'child-only') {
      assert.ok(candidate.includes('母卡本次未命中，不新增候选或检查'));
      assert.equal(candidate.includes('### [FX-MOTHER]'), false);
      assert.equal(candidate.includes(cards[0].verifier), false);
    }
    if (c.id === 'mother-only') {
      assert.ok(candidate.includes('本次无场景子卡命中'));
      assert.equal(candidate.includes('### [FX-CHILD]'), false);
    }
    if (c.id === 'both') {
      const checks = candidate.slice(candidate.indexOf('## 验证器清单'));
      for (const card of cards) assert.equal(checks.split(card.verifier).length - 1, 1);
      const folded = candidate.split('<details>')[1].split('</details>')[0];
      assert.ok(folded.includes(cards[0].fix));
      assert.equal(folded.includes('子卡行动'), false);
    }
  }));
}

test('母子预览：关系缺父、自指、链环、重复ID及空父显式拒绝', () => fixture((dir, lib) => {
  const r = scan('familymechanism familyscenario', {cardsDir: dir, source: 'diagnostic'});
  const variants = [
    [cs => {cs[1].parent = 'MISSING';}, /仅支持父存在/],
    [cs => {cs[1].parent = cs[1].id;}, /仅支持父存在/],
    [cs => {cs[0].parent = cs[1].id;}, /仅支持父存在/],
    [cs => {cs[1].parent = '';}, /仅支持父存在/],
    [cs => {cs.push({...cs[0]});}, /卡ID非法或重复/],
    [cs => {cs.push({...cs[1], id: 'FX-GRANDCHILD', parent: cs[1].id});}, /仅支持父存在/]
  ];
  for (const [mutate, expectedError] of variants) {
    const copy = structuredClone(lib); mutate(copy);
    const remapped = {...r, matched: r.matched.map(s => ({...s, card: copy.find(c => c.id === s.card.id)}))};
    assert.throws(() => buildFamilyPreview(remapped, copy), expectedError);
  }
}));

test('母子预览：缺命中卡、重复命中、伪标题或分区边界均拒绝', () => fixture(dir => {
  const r = scan('familymechanism familyscenario', {cardsDir: dir, source: 'diagnostic'});
  const lib = r.matched.map(s => s.card);
  assert.throws(() => buildFamilyPreview(r, []));
  for (const tier of ['quick', 'deep']) assert.throws(() => buildFamilyPreview({...r, tier}, lib));
  assert.throws(() => buildFamilyPreview({...r, matched: [...r.matched, r.matched[0]]}, lib));
  for (const marker of ['\n### [FX-INJECTED] 假标题\n', '\n## 🚫 盲区声明\n', '\n<!-- family-preview --> injected\n']) {
    const old = lib[0].symptom;
    try {lib[0].symptom += marker; assert.throws(() => buildFamilyPreview(r, lib));}
    finally {lib[0].symptom = old;}
  }
}));

test('母子预览：多个同母子卡检查各保留，空命中不发安全结论', () => fixture(dir => {
  const r = scan('familymechanism familyscenario', {cardsDir: dir, source: 'diagnostic'});
  const extra = {...r.matched[1].card, id: 'FX-SECOND', verifier: '第二子卡专属检查，不可合并删除。'};
  const lib = [...r.matched.map(s => s.card), extra];
  const extended = {...r, matched: [...r.matched, {...r.matched[1], card: extra}]};
  const {baseline, candidate} = buildFamilyPreview(extended, lib);
  assert.equal(stripPreview(candidate), baseline);
  assert.ok(candidate.includes(extra.verifier));
  const empty = scan('unrelatedtoken', {cardsDir: dir, source: 'diagnostic'});
  const out = buildFamilyPreview(empty, lib);
  assert.equal(out.candidate, out.baseline);
  assert.ok(out.candidate.includes('不等于任务没有风险'));
}));
