'use strict';
/** 冻结阅读材料回归：模拟闭合文本，不是实际Markdown渲染或模型效果判分。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const a = require('../../eval/family-reading-input-a.json');
const b = require('../../eval/family-reading-input-b.json');
const {cards} = require('../../eval/family-preview-fixture.cjs');

test('母子阅读材料：两臂各三题同问题，内容冻结不冒称真渲染', () => {
  assert.deepEqual(a.questions, b.questions);
  assert.equal(a.instructions, b.instructions);
  assert.deepEqual(a.tasks.map(t => t.id), ['R01', 'R02', 'R03']);
  assert.deepEqual(b.tasks.map(t => t.id), a.tasks.map(t => t.id));
  for (const [name, hash] of [
    ['a', '6c94dc91769c4f20edcfb499caad652cff3b4114590d7220ede98f12b048aea7'],
    ['b', 'b3a505f15e13ead114de93eceab93ec32191ae844de52e2a6baa6e9aef6b390a']
  ]) {
    const bytes = fs.readFileSync(path.join(__dirname, `../../eval/family-reading-input-${name}.json`));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), hash);
  }
});

test('母子阅读材料：模拟收起只去母正文，全部检查和诚实边界还在', () => {
  for (let i = 0; i < 3; i++) {
    const left = a.tasks[i].report, right = b.tasks[i].report;
    const ids = [...left.matchAll(/^### \[([^\]]+)\]/gm)].map(m => m[1]);
    assert.deepEqual([...right.matchAll(/^### \[([^\]]+)\]/gm)].map(m => m[1]), ids);
    assert.equal(right.slice(right.indexOf('## 验证器清单')), left.slice(left.indexOf('## 验证器清单')));
    assert.ok(right.includes('## ✅ 已查证区（0 项）'));
    assert.ok(right.includes('不能凭本报告放行'));
    assert.equal(right.includes('<details>'), false);
    assert.equal(right.includes('[模拟收起正文：'), i === 2);
    for (const c of cards.filter(c => ids.includes(c.id))) assert.ok(right.includes(c.verifier));
  }
  assert.ok(b.tasks[2].report.includes(cards[1].fix));
  assert.equal(b.tasks[2].report.includes(cards[0].fix), false);
  assert.ok(b.tasks[1].report.includes('母卡本次未命中，不新增候选或检查'));
  assert.equal(b.tasks[1].report.includes(cards[0].verifier), false);
});
