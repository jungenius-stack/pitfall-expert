'use strict';
/** 卡面证据与判据回归：仅核本地文字/构造反例，不冒称重读外部来源或执行卡内验证器。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadCards, scan} = require('../src/scanner');
const lib = loadCards();
const card = id => lib.cards.find(c => c.id === id);

test('旧卡纠偏：五卡保留，评级/置信度/复跑标记不借机升降', () => {
  assert.deepEqual(lib.errors, []);
  assert.equal(lib.cards.length, 125);
  for (const id of ['RD-019', 'CODE-015', 'CODE-038', 'SCI-004', 'SCI-005']) {
    const c = card(id);
    assert.ok(c, id);
    assert.equal(c.evidence.level, 'case');
    assert.equal(c.confidence, 'backed_by_context');
    assert.equal(c.pass_k_relevant, ['RD-019', 'SCI-004'].includes(id));
    assert.ok(c.endorsement.includes('本次未重核'));
  }
});

test('旧卡纠偏：泛泛参谋不额外召回预验尸卡，专属触发仍保留', () => {
  const generic = scan('这个方案值不值得做，帮我参谋一下', {source: 'diagnostic'});
  assert.equal(generic.matched.some(s => s.card.id === 'RD-019'), false);
  const targeted = scan('围绕已有草案做 pre-mortem 事前验尸', {source: 'diagnostic'});
  assert.ok(targeted.matched.some(s => s.card.id === 'RD-019'));
});

test('RD-019：草案可先存在，具体风险能改计划；通用风险不自动作废', () => {
  const c = card('RD-019');
  assert.equal(c.title.includes('时间点铁律'), false);
  assert.equal(c.description.includes('风险枚举必须在计划生成之前'), false);
  assert.ok(c.description.includes('拟议计划'));
  assert.ok(c.description.includes('不代表所有预验尸的必要顺序'));
  assert.ok(c.fix.includes('已有草案'));
  assert.equal(c.fix.includes('之后才允许生成计划'), false);
  assert.ok(c.verifier.includes('不能单凭通用条目判无效'));
  assert.equal(c.verifier.includes('装饰条目占比 >0'), false);
  assert.ok(c.endorsement.includes('摘要/首段'));
});

test('CODE-015：漏洞不证明范围外动机，非空diff不证明偷改语义', () => {
  const c = card('CODE-015');
  assert.ok(c.endorsement.includes('不能证明改动超出任务范围或授权'));
  assert.equal(c.endorsement.includes('范围外多一行静默绕过'), false);
  assert.ok(c.endorsement.includes('https://cveawg.mitre.org/api/cve/CVE-2014-1266'));
  assert.equal(/非空 diff 即(偷改|命中)/.test(c.fix + c.verifier), false);
  assert.ok(c.verifier.includes('合法移动也可产生非空 diff'));
  assert.ok(c.verifier.includes('空 diff 也不是语义等价证明'));
});

test('CODE-038：位置效应、逐跳压缩和长任务漂移各自归源', () => {
  const c = card('CODE-038');
  assert.ok(c.evidence.source.includes('定性工程论述'));
  assert.ok(c.evidence.source.includes('https://www.splunk.com/en_us/blog/artificial-intelligence/multi-agent-system-failures.html'));
  assert.ok(c.evidence.source.includes('https://machinelearningmastery.com/building-ai-agents-here-are-some-anti-patterns-to-avoid/'));
  for (const text of ['位置效应', '未读全文', '不是多 Agent 逐跳压缩实验', '不证明规避动作的干预效果']) {
    assert.ok(c.endorsement.includes(text), text);
  }
});

test('SCI-004：过拟合只作邻证，收益变化不充分证明泄漏', () => {
  const c = card('SCI-004');
  assert.equal(c.description.includes('回测永远赚钱'), false);
  assert.ok(c.description.includes('成交假设待核，不自动证明前视泄漏'));
  assert.ok(c.verifier.includes('不把成交假设失真一律叫前视泄漏'));
  assert.ok(c.endorsement.includes('不是前视泄漏或指标重绘的直接证据'));
  assert.ok(c.endorsement.includes('未取得所挂刊版'));
  assert.equal(c.fix.includes('强制错开一根 bar'), false);
  assert.ok(c.verifier.includes('延后一根 bar'));
  assert.ok(c.verifier.includes('仅作排查线索，不能据此认定泄漏'));
  assert.ok(c.verifier.includes('决策时不可得的信息'));
  assert.ok(c.verifier.includes('未判定'));
});

test('SCI-005：构造例与PPV邻证分开，撤两百分点阈值及零分母误判', () => {
  const c = card('SCI-005');
  const positives = 10, negatives = 990;
  const dummyAccuracy = negatives / (positives + negatives);
  assert.equal(dummyAccuracy, 0.99);
  assert.equal(0 / positives, 0);
  assert.ok(1 - dummyAccuracy < 0.02, '完美模型也达不到旧两百分点门槛');
  assert.ok(c.description.includes('构造例'));
  assert.ok(c.endorsement.includes('不是零召回分类器实验'));
  assert.ok(c.evidence.source.includes('原例数值本次未核'));
  assert.equal(c.verifier.includes('差 <2 个点即命中'), false);
  for (const text of ['真实正类', 'recall=0', '无真实正类时 recall 不可评估', 'precision 分母为零']) {
    assert.ok(c.verifier.includes(text), text);
  }
});
