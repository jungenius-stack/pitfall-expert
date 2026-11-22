'use strict';
/**
 * 报告可读性回归：防止内部黑话回流到用户可见报告。
 * 只查"报告正文"（标题区、候选卡片、三区说明、验证器清单、深审表），
 * 不查卡库内容——卡里的术语是卡作者的话，不是引擎对用户说的话。
 * 这不是文风偏好测试，而是"用户看不懂就绕开工具"的可读性防线。
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const {scan} = require('../src/scanner');
const {buildReport, buildFeedback} = require('../src/report');

// 用户明确抱怨过的黑话 + 引擎内部术语。命中任意一个即失败。
const JARGON = [
  '词面召回', '词面候选', '词面评分', '词面规则',
  '卡库证据标签', '卡库置信度',
  'backed_by_context', 'needs_verification',
  '信源故障',
  'pass^k', 'RPN',
  '元坑⑧', '方法论 3.7', '方法论 6.4'
];

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-plain-'));
  const cards = [{
    id: 'FX-001', title: '可读性夹具', description: '用于检查报告用词',
    symptom: '待核症状', severity: {S: 5, O: 5, D: 5},
    evidence: {source: '夹具来源', level: 'case'},
    fix: '先确认范围', verifier: '待执行检查，不是结果',
    confidence: 'backed_by_context', pass_k_relevant: true,
    triggers: ['plain-fixture']
  }];
  try {
    fs.writeFileSync(path.join(dir, 'fixture.yaml'), yaml.dump({version: '1', domain: 'code', cards}));
    return fn(dir);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

function findJargon(text) {
  return JARGON.filter(w => text.includes(w));
}

for (const tier of ['quick', 'standard', 'deep']) {
  test(`报告${tier}：不出现内部黑话，用户能读懂`, () => fixture(dir => {
    const r = scan('plain-fixture 任务', {cardsDir: dir, tier, source: 'diagnostic'});
    assert.equal(r.matched.length, 1);
    const out = buildReport(r);
    // 夹具卡自身文本里没有黑话，因此整份报告都应干净。
    assert.deepEqual(findJargon(out), [], `报告${tier}出现黑话`);
    // 必须保留可读的三区与边界声明，不能为了去黑话删掉诚实边界。
    assert.ok(out.includes('## ✅ 已查证区（0 项）'));
    assert.ok(out.includes('这次查了没有'));
    // 空 ✅ 区必须带"不能据此认为安全"的否定语义，不绑定具体句式。
    assert.ok(/不等于|不代表|不能凭|别凭/.test(out), '报告须否定"无命中即安全"');
  }));
}

test('报告：空命中与信源故障也用日常说法', () => fixture(dir => {
  const empty = buildReport(scan('zzzz-完全无关', {cardsDir: dir, source: 'diagnostic'}));
  assert.deepEqual(findJargon(empty), []);
  const broken = buildReport(scan('plain-fixture 任务', {cardsDir: path.join(dir, 'nope'), source: 'diagnostic'}));
  assert.deepEqual(findJargon(broken), []);
  assert.ok(broken.includes('卡库读取出问题'));
  assert.ok(broken.includes('不等于'));
}));

test('反馈包：表格表头与边界说明不含黑话', () => fixture(dir => {
  const fb = buildFeedback(scan('plain-fixture 任务', {cardsDir: dir, source: 'diagnostic'}));
  assert.deepEqual(findJargon(fb), []);
  assert.ok(fb.includes('卡库把握程度'));
  assert.ok(fb.includes('本任务状态'));
}));

test('去黑话不牺牲诚实：来源仍标未核读、✅ 仍为空、不承诺安全', () => fixture(dir => {
  const out = buildReport(scan('plain-fixture 任务', {cardsDir: dir, source: 'diagnostic'}));
  assert.ok(out.includes('本次未核读') || out.includes('未核读'));
  assert.ok(out.includes('## ✅ 已查证区（0 项）'));
  assert.equal(out.includes('已验证通过'), false);
  assert.equal(out.includes('没有问题'), false);
  assert.equal(out.includes('可以放行'), false);
}));
