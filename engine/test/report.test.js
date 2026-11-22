'use strict';
/** 报告诚实边界：来源和词面匹配不等于当前任务验证。测试不执行服务验证器。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { scan } = require('../src/scanner');
const { buildReport, buildFeedback } = require('../src/report');

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-report-test-'));
  const cards = ['backed_by_context', 'needs_verification', 'assumption'].map((confidence, i) => ({
    id: `FX-00${i + 1}`, title: `候选风险${i + 1}`, description: '报告语义夹具', symptom: '待核症状',
    severity: {S: 6, O: 4, D: 7}, evidence: {source: '原始来源 https://source.example/paper', level: 'case'},
    fix: '先确认适用范围', verifier: '待执行检查，不是执行结果', confidence, pass_k_relevant: i === 0,
    triggers: ['report-fixture'],
    ...(i === 0 ? {endorsement: '免死背书：https://extra.example/incident——范围外多改已亲读核对'} : {})
  }));
  try {
    fs.writeFileSync(path.join(dir, 'fixture.yaml'), yaml.dump({version: '1', domain: 'code', cards}));
    return fn(dir);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

for (const tier of ['quick', 'standard', 'deep']) {
  test(`报告${tier}：三种卡库置信度都只是候选，不发任务验证绿灯`, () => fixture(dir => {
    const r = scan('report-fixture 任务', {cardsDir: dir, tier, source: 'diagnostic'});
    assert.equal(r.matched.length, 3);
    assert.deepEqual(r.verified, []);
    assert.deepEqual(r.unverified, r.matched);
    const out = buildReport(r);
    assert.ok(out.includes('## ✅ 已查证区（0 项）'));
    assert.ok(out.includes('## ❓ 未验证区（3 项）'));
    const verified = out.split('## ✅ 已查证区')[1].split('## ❓ 未验证区')[0];
    assert.equal(verified.includes('### ['), false);
    for (const hit of r.matched) assert.equal(out.split(`### [${hit.card.id}]`).length - 1, 1);
    assert.ok(out.includes('卡库原始来源（本次未核读）'));
    assert.ok(out.includes('https://source.example/paper'));
    assert.ok(out.includes('只说明卡库怎么记的，不代表这次任务查过了'));
    assert.equal(out.includes('## 验证器清单'), tier !== 'quick');
    if (tier !== 'quick') {
      for (const hit of r.matched) assert.ok(out.includes(`[${hit.card.id}] ${hit.card.verifier}`));
    }
    if (tier === 'deep') {
      assert.ok(out.includes('建议（待核）'));
      assert.equal(out.includes('立刻杀'), false);
      assert.ok(out.includes('不是放行或阻断的结论'));
    }
    const fb = buildFeedback(r);
    assert.equal(fb.includes('✅'), false);
    assert.ok(fb.includes('卡库标为"有依据"'));
    assert.equal(fb.split('| ❓ 未验证 |').length - 1, 3);
  }));
}

test('报告：旧verified数组和调用方伪回填不能将词面候选升为已查证', () => fixture(dir => {
  const r = scan('report-fixture 任务', {cardsDir: dir, source: 'diagnostic'});
  r.verified = r.matched;
  r.unverified = [];
  r.verificationResults = [{id: 'FX-001', status: 'verified', result: '自称通过'}];
  const out = buildReport(r);
  assert.ok(out.includes('## ✅ 已查证区（0 项）'));
  assert.ok(out.includes('## ❓ 未验证区（3 项）'));
  assert.equal(out.includes('自称通过'), false);
}));

test('报告：补充背书只显示网址待核线索，不复述历史认证或错误归因', () => fixture(dir => {
  const r = scan('report-fixture 任务', {cardsDir: dir, source: 'diagnostic'});
  let out = buildReport(r);
  assert.ok(out.includes('补充出处线索（本次未核读，相关性待核）：https://extra.example/incident'));
  assert.equal(out.includes('范围外多改已亲读核对'), false);
  assert.equal(out.includes('免死背书'), false);
  r.matched[0].card.endorsement = '没有网址的历史背书';
  out = buildReport(r);
  assert.ok(out.includes('未提取到可追溯网址'));
  r.matched[0].card.endorsement = '';
  out = buildReport(r);
  assert.equal(out.includes('补充出处线索'), false);
}));

test('报告：无命中与卡库故障都不能当已验证安全', () => fixture(dir => {
  const empty = scan('zzzz-unrelated', {cardsDir: dir, source: 'diagnostic'});
  const out = buildReport(empty);
  assert.ok(out.includes('## ✅ 已查证区（0 项）'));
  assert.ok(out.includes('## ❓ 未验证区（0 项）'));
  assert.ok(out.includes('不等于任务没有风险'));
  const missing = buildReport(scan('report-fixture 任务', {cardsDir: path.join(dir, 'missing'), source: 'diagnostic'}));
  assert.ok(missing.includes('卡库读取出问题'));
  assert.ok(missing.includes('不等于"没有坑"'));
}));

test('报告：真实卡原始来源与补充网址同时可追溯，仍不认可相关性', () => {
  const r = scan('顺便把模块重构一下，范围外多改', {domain: 'code', source: 'diagnostic'});
  const card = r.matched.find(s => s.card.id === 'CODE-015');
  assert.ok(card);
  const out = buildReport(r);
  assert.ok(out.includes(card.card.evidence.source));
  assert.ok(out.includes('https://nvd.nist.gov/vuln/detail/CVE-2014-1266'));
  assert.ok(out.includes('本次未核读，相关性待核'));
  assert.equal(out.includes(card.card.endorsement), false);
});
