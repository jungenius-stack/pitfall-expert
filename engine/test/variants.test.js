'use strict';
/**
 * 触发词词形变体单测（v0.7.0 原方向 + v0.7.1 对称方向）
 * 元坑⑰约束：变体只允许存在于触发词层；本层扩展须过判定表「跨域误命中不增」前置门。
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { triggerVariants, scan } = require('../src/scanner');

test('词形变体：复数触发词→单数文本（v0.7.0 原方向不回归）', () => {
  assert.deepStrictEqual(triggerVariants('tests'), ['tests', 'test']);
  assert.deepStrictEqual(triggerVariants('anomalies'), ['anomalies', 'anomaly']);
  assert.deepStrictEqual(triggerVariants('matches'), ['matches', 'match']);
  assert.strictEqual(triggerVariants('analysis').length, 1, 'is 结尾不拆（analysis 拆出 analys 是错的）');
  assert.strictEqual(triggerVariants('process').length, 1, 'ss 结尾不拆');
  assert.strictEqual(triggerVariants('status').length, 1, 'us 结尾不拆');
});

test('词形变体：y 结尾单数触发词→-ies 复数文本（v0.7.1 对称方向）', () => {
  assert.deepStrictEqual(triggerVariants('dependency'), ['dependency', 'dependencies']);
  assert.deepStrictEqual(triggerVariants('proxy'), ['proxy', 'proxies']);
  assert.deepStrictEqual(triggerVariants('identity'), ['identity', 'identities']);
  assert.strictEqual(triggerVariants('day').length, 1, '元音+y 不变体（days 本含 day 子串）');
  assert.strictEqual(triggerVariants('race condition').length, 1, '多词短语不变体（改最后一个词会改错对象）');
});

test('集成：复数任务文本命中 y 结尾触发词卡（修复前该任务 0 分漏报）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-cards-'));
  try {
    fs.writeFileSync(path.join(dir, 'fixture.yaml'), [
      'version: 1',
      'domain: code',
      'cards:',
      '  - id: FX-001',
      '    domain: code',
      '    title: 词形变体夹具卡',
      '    description: 验证单复数兜底的夹具卡',
      '    symptom: 提到依赖管理相关任务',
      '    severity: {S: 3, O: 3, D: 3}',
      '    evidence:',
      '      source: 测试夹具',
      '      level: consensus',
      '    fix: 夹具无动作',
      '    verifier: 夹具无验证',
      '    confidence: backed_by_context',
      '    pass_k_relevant: false',
      '    triggers: [dependency]',
      ''
    ].join('\n'));
    const r = scan('清理这个项目里多余的 dependencies', { tier: 'quick', cardsDir: dir });
    assert.ok(
      r.matched.some(s => s.card.id === 'FX-001'),
      `应经 dependency→dependencies 变体命中夹具卡，实际：${JSON.stringify(r.matched)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
