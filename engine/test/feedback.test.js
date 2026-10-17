'use strict';
/**
 * --feedback 反馈包（M1 最小化采集）：默认脱敏不含任务原文，附原文须显式 withTask
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scan } = require('../src/scanner');
const { buildFeedback } = require('../src/report');

const TASK = '清理这个项目里多余的 dependencies';

function withFixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-fb-'));
  try {
    fs.writeFileSync(path.join(dir, 'fixture.yaml'), [
      'version: 9.9',
      'domain: code',
      'cards:',
      '  - id: FX-001',
      '    domain: code',
      '    title: 反馈包夹具卡',
      '    description: 验证反馈包脱敏的夹具卡',
      '    symptom: 依赖清理任务',
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
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('反馈包：默认脱敏——不含任务原文，含版本/命中卡/三区标记', () => {
  withFixture(dir => {
    const r = scan(TASK, { tier: 'standard', cardsDir: dir });
    assert.strictEqual(r.cardVersions['fixture.yaml'], '9.9', 'loadCards 须暴露卡库版本');
    const fb = buildFeedback(r);
    assert.ok(fb.includes('FX-001') && fb.includes('9.9'), '反馈包含命中卡 ID 与卡库版本');
    assert.ok(fb.includes('pitfall-expert-engine'), '反馈包含引擎版本');
    assert.ok(fb.includes('✅'), 'backed_by_context 卡标 ✅ 区');
    assert.ok(!fb.includes(TASK), '默认不得含任务原文（M1 最小化采集）');
    assert.ok(fb.includes('未包含'), '须显式声明任务原文未含及开启方式');
  });
});

test('反馈包：withTask 才附任务原文', () => {
  withFixture(dir => {
    const r = scan(TASK, { tier: 'standard', cardsDir: dir });
    const fb = buildFeedback(r, { withTask: true });
    assert.ok(fb.includes(TASK), 'withTask 时附任务原文');
  });
});
