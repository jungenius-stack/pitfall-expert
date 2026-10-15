'use strict';
/**
 * gate-core 共享门控规则测试（hooks 与 dsh 插件共用）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  extractTask, isHighRisk, highRiskCards,
  READONLY_TOOLS, TRIVIAL_CMDS, DESTRUCTIVE_PATTERNS
} = require('../src/gate-core.cjs');

test('只读工具与琐碎命令跳过', () => {
  assert.strictEqual(extractTask({ name: 'Read', arguments: { file_path: '/x' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Grep', arguments: { pattern: 'x' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Bash', arguments: { command: 'ls -la' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Bash', arguments: { command: 'git status' } }).skip, true);
});

test('破坏性命令识别', () => {
  for (const cmd of ['rm -rf ./build', 'git push origin main --force', 'git reset --hard HEAD~3', 'DROP TABLE users', 'dd if=/dev/zero of=/dev/sda']) {
    const r = extractTask({ name: 'Bash', arguments: { command: cmd } });
    assert.strictEqual(r.skip, false, cmd);
    assert.strictEqual(r.destructive, true, cmd);
  }
});

test('普通变异命令不跳过不标破坏', () => {
  const r = extractTask({ name: 'Bash', arguments: { command: 'npm install express --save' } });
  assert.strictEqual(r.skip, false);
  assert.strictEqual(r.destructive, undefined);
  assert.ok(r.task.includes('npm install'));
});

test('写文件工具提取路径与内容', () => {
  const r = extractTask({ name: 'Write', arguments: { file_path: '/tmp/a.txt', content: 'hello world content' } });
  assert.strictEqual(r.skip, false);
  assert.ok(r.task.includes('/tmp/a.txt'));
});

test('多形状防御：snake_case 与裸字符串', () => {
  const a = extractTask({ tool_name: 'Bash', tool_input: { command: 'docker build -t app .' } });
  assert.strictEqual(a.skip, false);
  const b = extractTask('python train.py --epochs 100');
  assert.strictEqual(b.skip, false);
});

test('高危判据 S>=4 且 O>=3', () => {
  assert.strictEqual(isHighRisk({ severity: { S: 5, O: 3, D: 3 } }), true);
  assert.strictEqual(isHighRisk({ severity: { S: 4, O: 3, D: 5 } }), true);
  assert.strictEqual(isHighRisk({ severity: { S: 5, O: 2, D: 5 } }), false, 'O=2 不拦（不可逆但低概率）');
  assert.strictEqual(isHighRisk({ severity: { S: 3, O: 4, D: 3 } }), false);
});

test('highRiskCards 从扫描结果过滤', () => {
  const fake = {
    matched: [
      { card: { id: 'A', severity: { S: 5, O: 3, D: 3 } } },
      { card: { id: 'B', severity: { S: 5, O: 2, D: 5 } } }
    ]
  };
  assert.deepStrictEqual(highRiskCards(fake).map(s => s.card.id), ['A']);
});

test('规则常量非空（防回归删减）', () => {
  assert.ok(READONLY_TOOLS.size >= 5);
  assert.ok(TRIVIAL_CMDS.size >= 10);
  assert.ok(DESTRUCTIVE_PATTERNS.length >= 5);
});
