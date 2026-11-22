'use strict';
/**
 * 哨兵评测脚本（协议 v0.2 §二「哨兵命中率」的可执行部分）。
 *
 * 它回答一个问题：给定语义上明显相关的任务，召回器有没有把该抓的抓到？
 * 它不回答：坑卡对不对、报告有没有用、用户会不会照做。
 *
 * 关键设计：
 *  - 只在 eval/ 目录跑，卡片目录用 loadCards(cardsDir) 指定，绝不碰 cards/。
 *  - 输出只是计数和漏掉了哪些，不产生任何「效果提升」结论。
 *  - 缺文件/坏 JSON 一律按「未判定」处理，不当通过。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SENTINEL_DIR = path.join(__dirname, 'sentinel');
const TASKS = path.join(__dirname, 'sentinel-tasks.json');
const SENTINEL_YAML = path.join(__dirname, 'sentinel-cards.yaml');

function loadSentinel() {
  const yaml = require(path.join(ROOT, 'engine/node_modules/js-yaml'));
  const doc = yaml.load(fs.readFileSync(SENTINEL_YAML, 'utf8'));
  if (!doc || !Array.isArray(doc.cards) || doc.cards.length === 0) {
    throw new Error('哨兵卡文件无效或为空');
  }
  return doc.cards;
}

function main() {
  let tasks;
  try {
    tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8')).tasks;
  } catch (e) {
    console.error(`[未判定] 任务文件不可读：${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.error('[未判定] 任务列表为空');
    process.exit(2);
  }

  // 哨兵卡单独成一个目录，避免混进正式卡库
  fs.mkdirSync(SENTINEL_DIR, { recursive: true });

  const { scan } = require(path.join(ROOT, 'engine/src/scanner'));
  const results = [];
  let falseRecall = 0;

  for (const t of tasks) {
    let r;
    try {
      r = scan(t.text, { source: 'probe:sentinel', cardsDir: SENTINEL_DIR });
    } catch (e) {
      results.push({ id: t.id, status: '未判定', reason: e.message });
      continue;
    }
    const ids = r.matched.map(s => s.card.id);
    if (t.expectSentinel) {
      const hit = ids.includes(t.expectSentinel);
      results.push({
        id: t.id,
        expect: t.expectSentinel,
        got: ids,
        status: hit ? '命中' : '漏报',
        note: t.note
      });
    } else {
      const bad = ids.length > 0;
      if (bad) falseRecall++;
      results.push({
        id: t.id,
        expect: null,
        got: ids,
        status: bad ? '误报' : '正确未召回',
        note: t.note
      });
    }
  }

  const positive = results.filter(r => r.expect);
  const hit = positive.filter(r => r.status === '命中').length;
  const missed = positive.filter(r => r.status === '漏报');
  const undecided = results.filter(r => r.status === '未判定').length;

  console.log('# 哨兵命中率评测（仅 code 域下限检查）');
  console.log(`哨兵卡 ${loadSentinel().length} 张 · 任务 ${tasks.length} 条`);
  console.log(`正例命中 ${hit}/${positive.length}` + (undecided ? `　未判定 ${undecided}` : ''));
  console.log(`负例误报 ${falseRecall} 条`);
  if (missed.length) {
    console.log('漏报明细：');
    for (const m of missed) console.log(`  ${m.id} 期望 ${m.expect}，实际 [${m.got.join(', ') || '空'}]`);
  }
  console.log('');
  console.log('边界：本脚本只测「语义明显相关时能否召回」，不测坑卡正确性、');
  console.log('      报告有用性、用户依从或任何效果提升；三条任务都在 code 域，');
  console.log('      其他域的漏报仍需真实评测集。');

  // 退出码：漏报或未判定 → 1（非零表示需要人看，不代表产品结论）
  process.exitCode = (missed.length || undecided) ? 1 : 0;
}

if (require.main === module) main();
module.exports = { main };
