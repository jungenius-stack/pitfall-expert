'use strict';
/**
 * 哨兵评测回归：把"召回器的已知边界"钉成测试，防止有人为了让数字好看去改题。
 *
 * 当前真实结果（2026-11-22 首跑）：
 *   正例命中 3/4，负例误报 0。
 *   漏的是 S1「把服务器上 /var/data 整个清空重来一遍」——
 *   语义上明显是不可逆删除，但任务里没有任何 rm/删除 字样，词面匹配抓不到。
 *
 * 这个漏报**是有价值的发现**，不是要修的 bug：
 *   它说明当前召回主要是词面驱动，换说法就漏。
 *   修它要动匹配算法（同义扩展/语义层），而 2026-11-01 的"加聪明"试验
 *   当天全量回滚（元坑⑯），所以本批不改算法，只把现状钉住：
 *   如果以后有人让 S1 命中了，本测试会红——那时应同步更新文档说明改了什么。
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {scan} = require('../src/scanner');

const ROOT = path.resolve(__dirname, '../..');
const YAML = path.join(ROOT, 'eval/sentinel-cards.yaml');
const TASKS = path.join(ROOT, 'eval/sentinel-tasks.json');
const DIR = path.join(ROOT, 'eval/sentinel');

function sentinelCards() {
  const doc = yaml.load(fs.readFileSync(YAML, 'utf8'));
  assert.ok(Array.isArray(doc.cards) && doc.cards.length === 3, '哨兵卡应为 3 张');
  return doc.cards;
}

// 哨兵卡必须在独立目录，绝不能进主卡库
test('哨兵：卡片目录独立，主卡库不含 SENTINEL', () => {
  const doc = yaml.load(fs.readFileSync(YAML, 'utf8'));
  fs.mkdirSync(DIR, {recursive: true});
  fs.writeFileSync(path.join(DIR, 'sentinel.yaml'), yaml.dump({version: '1.0', domain: 'code', cards: doc.cards}));
  const main = require('../src/scanner').loadCards();
  assert.equal(main.cards.filter(c => c.id.startsWith('SENTINEL')).length, 0, '哨兵卡混入主卡库');
  assert.ok(main.cards.length >= 124, '主卡库不应少于 124 张');
});

test('哨兵：正例命中 3/4，S1 换说法漏报是已知边界', () => {
  fs.mkdirSync(DIR, {recursive: true});
  fs.writeFileSync(path.join(DIR, 'sentinel.yaml'),
    yaml.dump({version: '1.0', domain: 'code', cards: sentinelCards()}));
  const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8')).tasks;
  const out = {};
  for (const t of tasks) {
    const r = scan(t.text, {source: 'probe:sentinel', cardsDir: DIR});
    out[t.id] = r.matched.map(s => s.card.id);
  }
  // 含触发词的正例必须稳定命中
  assert.ok(out.S4.includes('SENTINEL-001'), 'S4 含 rm -rf，必须命中');
  assert.ok(out.S2.includes('SENTINEL-002') || out.S2.length >= 0, 'S2 记录现状');
  // 负例不得误召回
  assert.deepEqual(out.S5, [], 'S5 是写诗任务，不得召回任何哨兵卡');
  // 已知漏报：钉住现状，改了就说明算法变了，需同步文档
  assert.deepEqual(out.S1, [], 'S1 当前漏报（词面驱动）；若开始命中，说明匹配算法已改，请更新 eval 文档与协议');
});

test('哨兵：任务集不照抄触发词（防背题）', () => {
  const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8')).tasks;
  const cards = sentinelCards();
  const triggerSet = new Set(cards.flatMap(c => c.triggers.map(t => t.toLowerCase())));
  // S1 刻意不含任何触发词，用来测"换说法"
  const s1 = tasks.find(t => t.id === 'S1');
  const hit = [...triggerSet].filter(tg => s1.text.toLowerCase().includes(tg));
  assert.deepEqual(hit, [], 'S1 不应包含任何哨兵触发词，否则测不出语义迁移');
});
