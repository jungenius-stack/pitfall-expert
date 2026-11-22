'use strict';
/** 三卡结构与召回回归；不执行卡中文字验证器，不证明真实服务安全。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scan, loadCards } = require('../src/scanner');

const lib = loadCards();
const pilots = ['CODE-048', 'CODE-049', 'CODE-050'];

test('试点卡：全库124张且ID唯一，三卡保留，050不再声明parent', () => {
  assert.deepEqual(lib.errors, []);
  assert.equal(lib.cards.length, 124);
  assert.equal(new Set(lib.cards.map(c => c.id)).size, lib.cards.length);
  for (const id of pilots) assert.ok(lib.cards.some(c => c.id === id), id);
  const card = lib.cards.find(c => c.id === 'CODE-050');
  assert.equal(Object.hasOwn(card, 'parent'), false);
  assert.ok(card.title.includes('资源释放'));
});

const tasks = [
  ['CODE-048', '蓝绿切换后核验配置的部分生效和缓存没刷新'],
  ['CODE-048', 'After a blue-green rolling update, verify the runtime config drift.'],
  ['CODE-049', '自动重试和超时重试在多层叠加，需要核对重试预算'],
  ['CODE-049', 'Trace a retry storm and exponential backoff across the gateway and SDK.'],
  ['CODE-050', '连接池里 context canceled 后仍持锁，核验资源释放'],
  ['CODE-050', 'Check whether a timeout releases a connection pool slot and database lock.']
];
for (const [id, task] of tasks) {
  test(`试点卡召回：${id} / ${task}`, () => {
    const r = scan(task, { source: 'diagnostic' });
    assert.equal(r.domain, 'code');
    const hit = r.matched.find(s => s.card.id === id);
    assert.ok(hit, `未召回 ${id}`);
    assert.ok(hit.m.triggerHits.length > 0, '专属中英触发词须仍可用');
  });
}

test('试点卡噪音：通用PR检查不召回三卡，保持原跨域门基线', () => {
  const r = scan('review 这个 PR，检查测试是否都绿了', { source: 'diagnostic' });
  assert.deepEqual(r.matched.filter(s => pilots.includes(s.card.id)).map(s => s.card.id), []);
});

test('试点卡边界文案：旧放行捷径不回流（只验文本，不冒称已执行）', () => {
  const [deployment, retry, cancellation] = pilots.map(id => lib.cards.find(c => c.id === id));
  for (const card of [deployment, retry, cancellation]) {
    assert.ok(card.verifier.includes('未实测真实服务'));
    assert.ok(card.verifier.includes('未判定'));
    assert.ok(card.verifier.includes('范围内未观察到'));
  }
  assert.equal(deployment.verifier.includes('全部一致 ⇒ 不成立'), false);
  assert.ok(deployment.verifier.includes('全体同错也不能放行'));
  assert.ok(deployment.verifier.includes('EXPLAIN ANALYZE 会执行语句'));
  assert.equal(/放大系数|>2|≤1/.test(retry.verifier), false);
  assert.ok(retry.verifier.includes('允许预算内多次廉价尝试'));
  assert.ok(retry.evidence.source.includes('不是请求量 7 倍'));
  assert.ok(retry.evidence.source.includes('Google Cloud Storage 19002 原文未取得'));
  assert.equal(/30s|30秒|≤阈值/.test(cancellation.verifier), false);
  assert.ok(cancellation.verifier.includes('正确继承 deadline'));
  assert.ok(cancellation.verifier.includes('显式有限 timeout 也不能据此放行'));
});
