#!/usr/bin/env node
// 账本出勤周报：读 ~/.pitfall-expert/hits.jsonl，输出四格分拣
//
// 口径声明（写在输出里，不许删）：
//   「命中」= 引擎召回列表含该卡，不等于「有用」。
//   本工具只数次数，不做价值判断；「零命中」不等于「该卡无效」。
//
// 用法：node tools/weekly-report.mjs [--days N] [--json] [--ledger <path>] [--help]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const DEFAULT_LEDGER = path.join(HOME, '.pitfall-expert', 'hits.jsonl');
const CARDS_DIR = path.join(__dirname, '..', 'cards');

function parseArgs(argv) {
  const a = { days: null, json: false, ledger: DEFAULT_LEDGER, help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--help' || v === '-h') a.help = true;
    else if (v === '--json') a.json = true;
    else if (v === '--days') { a.days = Number(argv[++i]); }
    else if (v === '--ledger') { a.ledger = argv[++i]; }
    else { console.error(`未知参数: ${v}（用 --help 看用法）`); process.exit(2); }
  }
  if (a.days !== null && (!Number.isFinite(a.days) || a.days <= 0)) {
    console.error('--days 需要正整数'); process.exit(2);
  }
  return a;
}

// 读卡库实体 id（只认 `id: XXX`，不认注释里的字符串——验证器教训）
function loadCardIds() {
  const ids = new Set();
  if (!fs.existsSync(CARDS_DIR)) return ids;
  for (const f of fs.readdirSync(CARDS_DIR)) {
    if (!f.endsWith('.yaml')) continue;
    const text = fs.readFileSync(path.join(CARDS_DIR, f), 'utf8');
    for (const m of text.matchAll(/^\s*-\s*id:\s*([A-Z]+-\d+)/gm)) ids.add(m[1]);
    for (const m of text.matchAll(/^\s*id:\s*([A-Z]+-\d+)/gm)) ids.add(m[1]);
  }
  return ids;
}

// 读账本：逐行容错，坏行计数不中断
function loadLedger(file) {
  const out = { rows: [], bad: 0, exists: fs.existsSync(file) };
  if (!out.exists) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const r = JSON.parse(s);
      if (!r || typeof r !== 'object' || !Array.isArray(r.hits)) throw new Error('形状不符');
      out.rows.push(r);
    } catch { out.bad++; }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`账本出勤周报
用法: node tools/weekly-report.mjs [选项]
  --days N       只看最近 N 天（按 UTC）
  --json         输出 JSON
  --ledger PATH  指定账本路径（默认 ~/.pitfall-expert/hits.jsonl）
口径: 「命中」≠「有用」；「零命中」≠「该卡无效」。`);
    return;
  }

  const cardIds = loadCardIds();
  const led = loadLedger(args.ledger);

  const cutoff = args.days ? Date.now() - args.days * 86400000 : null;
  const rows = cutoff
    ? led.rows.filter(r => { const t = Date.parse(r.ts); return Number.isFinite(t) && t >= cutoff; })
    : led.rows;

  const count = new Map();       // id -> 次数
  const sourceCount = new Map(); // source -> 次数
  let minTs = null, maxTs = null;
  for (const r of rows) {
    sourceCount.set(r.source || 'unknown', (sourceCount.get(r.source || 'unknown') || 0) + 1);
    const t = Date.parse(r.ts);
    if (Number.isFinite(t)) { if (minTs === null || t < minTs) minTs = t; if (maxTs === null || t > maxTs) maxTs = t; }
    for (const h of r.hits) if (h && h.id) count.set(h.id, (count.get(h.id) || 0) + 1);
  }

  // 三行分拣（禁止混为一谈）
  const inLedger = [...count.keys()];
  const orphan = inLedger.filter(id => !cardIds.has(id));          // 账本有、卡库无：退役/改名
  const neverHit = [...cardIds].filter(id => !count.has(id));      // 卡库有、账本无：新卡或触发词太窄
  const hitInLib = inLedger.filter(id => cardIds.has(id));         // 正常命中

  const result = {
    ledger: args.ledger,
    exists: led.exists,
    badLines: led.bad,
    scans: rows.length,
    range: minTs === null ? null : { from: new Date(minTs).toISOString(), to: new Date(maxTs).toISOString() },
    sources: Object.fromEntries([...sourceCount].sort((a, b) => b[1] - a[1])),
    cardsTotal: cardIds.size,
    hitInLibrary: hitInLib.length,
    neverHitCount: neverHit.length,
    orphanIds: orphan,
    topHits: hitInLib.map(id => ({ id, n: count.get(id) })).sort((a, b) => b.n - a.n).slice(0, 10),
    neverHitSample: neverHit.slice(0, 10),
    caveat: '「命中」= 引擎召回含该卡，不等于「有用」；「零命中」不等于「该卡无效」。样本量小（扫描 ' + rows.length + ' 次）时四格分拣不成立。'
  };

  if (args.json) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log('# 账本出勤周报');
  console.log(`账本: ${args.ledger}${led.exists ? '' : '（不存在）'}`);
  if (!led.exists) { console.log('\n没有账本——说明引擎还没被跑过，或账本被清空。\n先跑一次扫描再来。'); return; }
  if (rows.length === 0) { console.log('\n账本为空（或无符合 --days 的记录）。\n'); return; }

  console.log(`扫描 ${rows.length} 次 · 区间 ${result.range.from} ~ ${result.range.to}`);
  console.log(`入口分布: ${Object.entries(result.sources).map(([k, v]) => `${k}=${v}`).join(' / ')}`);
  if (led.bad > 0) console.log(`⚠ 坏行 ${led.bad} 条（已跳过，未中断）`);

  console.log(`\n## 分拣（三行不许混为一谈）`);
  console.log(`1. 正常命中：${hitInLib.length}/${cardIds.size} 张`);
  console.log(`2. 账本有但卡库无（退役/改名）：${orphan.length} 个${orphan.length ? ' → ' + orphan.join(', ') : ''}`);
  console.log(`3. 卡库有但账本零命中：${neverHit.length} 张${neverHit.length ? '（样例）→ ' + neverHit.slice(0, 10).join(', ') : ''}`);

  if (result.topHits.length) {
    console.log(`\n## 命中次数 Top ${result.topHits.length}（次数≠价值）`);
    for (const { id, n } of result.topHits) console.log(`  ${String(n).padStart(3)}  ${id}`);
  }

  console.log(`\n---\n${result.caveat}`);
  if (rows.length < 30) console.log(`⚠ 样本量 ${rows.length} 次，低于 30——四格分拣暂不可用，只看趋势。`);
}

main();
