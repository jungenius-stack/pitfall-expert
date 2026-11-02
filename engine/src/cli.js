#!/usr/bin/env node
'use strict';
/**
 * pitfall-expert CLI —— 供 hook 门控与人工调用
 * 用法：node src/cli.js "任务描述" [--tier quick|standard|deep] [--domain auto|code|math|...] [--cards-dir 路径] [--feedback] [--with-task]
 * --feedback：输出脱敏反馈包（默认不含任务原文）供贴进 GitHub 误报/漏报 issue；--with-task 附原文（提交前自查敏感信息）
 * 退出码：0=报告已产出；1=扫描失败（显式披露，不得理解为没有坑）；2=任务描述为空或过短（grill-me 退回）
 */

const { scan } = require('./scanner');
const { buildReport, buildFeedback } = require('./report');

function parseArgs(argv) {
  const out = { task: '', tier: 'standard', domain: 'auto', cardsDir: null, feedback: false, withTask: false, lang: 'zh', stats: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--feedback') { out.feedback = true; }
    else if (a === '--stats') { out.stats = true; }
    else if (a === '--with-task') { out.withTask = true; }
    else if (a === '--tier' && argv[i + 1]) { out.tier = argv[++i]; }
    else if (a === '--domain' && argv[i + 1]) { out.domain = argv[++i]; }
    else if (a === '--cards-dir' && argv[i + 1]) { out.cardsDir = argv[++i]; }
    else if (a === '--lang' && argv[i + 1]) { out.lang = argv[++i]; }
    else if (a.startsWith('--lang=')) { out.lang = a.slice(7); }
    else if (a.startsWith('--tier=')) { out.tier = a.slice(7); }
    else if (a.startsWith('--domain=')) { out.domain = a.slice(9); }
    else if (a.startsWith('--cards-dir=')) { out.cardsDir = a.slice(12); }
    else rest.push(a);
  }
  out.task = rest.join(' ').trim();
  return out;
}

// --help / -h：国际用户第一反应，必须给用法而不是把 --help 当成任务去扫描
if (process.argv.slice(2).some((a) => a === '--help' || a === '-h')) {
  process.stdout.write([
    'pitfall-expert — task-time risk scan before your agent starts',
    '',
    'USAGE',
    '  pitfall-expert "<task description>" [options]',
    '',
    'OPTIONS',
    '  --tier quick|standard|deep   Scan depth (default: standard)',
    '  --domain auto|code|math|science|creative|research-decision|strategy|agent-security',
    '                               Force a domain (default: auto-detect)',
    '  --lang zh|en                 Report language hint (default: zh). "en" prepends an',
    '                               English field glossary; card bodies remain Chinese.',
    '  --cards-dir <path>           Card library directory (default: bundled cards/)',
    '  --feedback [--with-task]     Print a de-identified report skeleton to paste into a',
    '                               GitHub issue. Nothing is sent automatically.',
    '  --stats                      Print the local hit-ledger summary (~/.pitfall-expert/',
    '                               hits.jsonl): per-card usage counts and zero-hit cards.',
    '                               The ledger stays on this machine; nothing is uploaded.',
    '  -h, --help                   Show this help',
    '',
    'EXAMPLES',
    '  pitfall-expert "refactor the payment module" --tier quick',
    '  pitfall-expert "重构支付模块" --tier standard --lang=en',
    '',
    'EXIT CODES  0 = report produced · 1 = scan failed (disclosed, not "no pitfalls")',
    '            2 = task missing or too short (grill-me handback)',
    ''
  ].join('\n'));
  process.exit(0);
}

// --stats：读本机命中账本（~/.pitfall-expert/hits.jsonl），产出全卡出勤表。
// 只读操作；账本不存在=还没有扫描记录，显式说明而非报错。
function buildStats(cardsDir) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const ledger = path.join(os.homedir(), '.pitfall-expert', 'hits.jsonl');
  let raw = '';
  try {
    raw = fs.readFileSync(ledger, 'utf8');
  } catch (e) {
    return `命中账本不存在或不可读（${ledger}）——还没有任何扫描记录。先正常使用攒数据，或跑一次扫描验证账本在岗。`;
  }
  const entries = [];
  let badLines = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch (e) { badLines++; }
  }
  if (entries.length === 0) return `命中账本存在但还没有记录（坏行 ${badLines} 条已跳过）。`;
  const counts = {};
  const sources = {};
  let first = null, last = null;
  for (const e of entries) {
    if (e.ts) { if (!first || e.ts < first) first = e.ts; if (!last || e.ts > last) last = e.ts; }
    const src = e.source || 'unknown';
    sources[src] = (sources[src] || 0) + 1;
    for (const h of e.hits || []) counts[h.id] = (counts[h.id] || 0) + 1;
  }
  const { loadCards } = require('./scanner');
  const lib = loadCards(cardsDir);
  const seen = new Set(Object.keys(counts));
  const zero = lib.cards.filter(c => !seen.has(c.id)).map(c => c.id);
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const out = [];
  out.push('# 命中账本汇总（本机出勤表，仅本机数据）');
  out.push(`扫描 ${entries.length} 次 · 区间 ${first} ~ ${last}`);
  out.push('入口分布：' + Object.entries(sources).map(([k, v]) => `${k}=${v}`).join(' / '));
  out.push(`命中卡 ${ranked.length}/${lib.cards.length} 张，按次数降序：`);
  for (const [id, n] of ranked) out.push(`  ${String(n).padStart(4)}  ${id}`);
  out.push(`零命中卡 ${zero.length} 张（先测触发词，再谈退役）：`);
  out.push(zero.length ? '  ' + zero.join(', ') : '  （无——全库都有出勤）');
  if (badLines) out.push(`⚠️ 账本坏行 ${badLines} 条已跳过`);
  if (lib.errors.length) out.push(`⚠️ 卡库加载错误 ${lib.errors.length} 条（零命中清单可能失真）：${lib.errors.map(e => e.file).join(', ')}`);
  return out.join('\n');
}

const args = parseArgs(process.argv.slice(2));

if (args.stats) {
  process.stdout.write(buildStats(args.cardsDir) + '\n');
  process.exit(0);
}

if (!args.task || args.task.length < 4) {
  process.stderr.write('错误：任务描述为空或过短——需求是糊的，按方法论 SOP 第 1 步退回：请补充任务内容、验收标准与边界条件。\n');
  process.exit(2);
}

try {
  const result = scan(args.task, { tier: args.tier, domain: args.domain, cardsDir: args.cardsDir, source: 'cli' });
  if (args.feedback) {
    process.stdout.write(buildFeedback(result, { withTask: args.withTask }) + '\n');
  } else {
    result.lang = args.lang === 'en' ? 'en' : 'zh';
    process.stdout.write(buildReport(result) + '\n');
  }
} catch (e) {
  process.stderr.write(`扫描失败：${e.message}\n按诚实架构披露：本次未产出任何风险报告，故障原因如上。不得将此失败理解为"没有坑"。\n`);
  process.exit(1);
}
