'use strict';
/** 生成六份合成对照；输出文件必须不存在，避免覆盖已有材料。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('../engine/node_modules/js-yaml');
const {scan} = require('../engine/src/scanner');
const {buildFamilyPreview} = require('./family-preview.cjs');
const {cards, cases} = require('./family-preview-fixture.cjs');
if (process.env.PITFALL_LEDGER !== 'off') throw Error('生成样例必须PITFALL_LEDGER=off，避免污染真实账本');
if (process.argv.length !== 3) throw Error('用法：PITFALL_LEDGER=off node eval/family-preview-samples.cjs <新输出文件>');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-family-samples-'));
try {
  fs.writeFileSync(path.join(dir, 'fixture.yaml'), yaml.dump({version: 'fixture', domain: 'code', cards}));
  const lines = ['# 母子报告三种情况：同内容双版本（2026-11-19）', '',
    '> 全为FX合成卡，非正式卡库关系；仅standard展示实验。卡有关系不等于适用或已验证。',
    '> 同一情形两版使用同一个扫描结果。候选新增关系标注，母子同亮时仅母卡正文可收起，检查清单全部展开。',
    '> Markdown环境不支持details时不保证视觉折叠；源文更长，不宣称省token或效果改善。', ''];
  const measurements = [];
  for (const c of cases) {
    const r = scan(c.task, {cardsDir: dir, source: 'diagnostic'});
    const {baseline, candidate} = buildFamilyPreview(r, r.matched.map(s => s.card).concat(
      cards.filter(c => !r.matched.some(s => s.card.id === c.id))));
    if (JSON.stringify(r.matched.map(s => s.card.id)) !== JSON.stringify(c.expected)) throw Error('样例召回与预设不符');
    const restored = candidate.replace(/^<!-- family-preview -->[^\n]*\n/gm, '');
    if (restored !== baseline) throw Error('无法逐字还原基线');
    measurements.push({case: c.id, matched: c.expected, baselineCodePoints: [...baseline].length,
      candidateCodePoints: [...candidate].length, restoredExactly: true});
    lines.push(`## ${c.label} · 基线（全部展开）`, '', baseline, '', `## ${c.label} · 候选（机制标注/同亮收起母正文）`, '', candidate, '');
  }
  lines.push('## 程序测量（Unicode码点数，不是token或阅读耗时）', '', '```json', JSON.stringify(measurements, null, 2), '```', '');
  fs.writeFileSync(process.argv[2], lines.join('\n'), {flag: 'wx'});
  console.log(JSON.stringify({output: process.argv[2], measurements}, null, 2));
} finally {fs.rmSync(dir, {recursive: true, force: true});}
