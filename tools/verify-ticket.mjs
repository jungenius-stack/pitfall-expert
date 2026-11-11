#!/usr/bin/env node
// 验票：核对一份踩坑报告里的「运行票据」是否真出自引擎，且与账本记录一致。
//
// 用途：解决「模型自称跑了引擎、其实自己现编」这个无法从报告表面看出的失效模式。
// 票据 = 引擎在实跑时按 (时间+任务+命中卡集+卡库版本) 算出的短哈希，同时写入账本。
// 模型无法凭空造出与真实任务匹配的票据；编造、漏抄、换任务都对不上。
//
// 用法：
//   node tools/verify-ticket.mjs <报告文件>
//   node tools/verify-ticket.mjs --ticket <票据> [--task <任务前60字>]
//
// 退出码：0=通过 1=不通过（无票据/查无此票/任务不符）2=用法错误
'use strict';
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const LEDGER = path.join(HOME, '.pitfall-expert', 'hits.jsonl');

function die(msg) { console.error(msg); process.exit(2); }

function loadLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  const rows = [];
  for (const line of fs.readFileSync(LEDGER, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const r = JSON.parse(s);
      if (r && r.ticket) rows.push(r);
    } catch { /* 坏行跳过 */ }
  }
  return rows;
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`验票工具
用法:
  node tools/verify-ticket.mjs <报告文件>
  node tools/verify-ticket.mjs --ticket <票据> [--task "<任务开头>"]
退出码: 0=通过 1=不通过 2=用法错误`);
  process.exit(args.length === 0 ? 2 : 0);
}

let ticket = null;
let taskHint = null;

if (args[0] === '--ticket') {
  ticket = args[1];
  const ti = args.indexOf('--task');
  if (ti > -1) taskHint = args[ti + 1];
  if (!ticket) die('--ticket 缺少票据值');
} else {
  const file = args[0];
  if (!fs.existsSync(file)) die(`报告不存在: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/运行票据[：:]\s*`?([0-9a-f]{8,64})`?/);
  if (!m) {
    console.log('❌ 不通过：报告里没有「运行票据」行——无法证明引擎被真正执行过。');
    console.log('   （报告可能是模型凭通用知识写的，未必读过坑卡库。）');
    process.exit(1);
  }
  ticket = m[1];
  // 报告里的任务行，用于交叉核对
  const tm = text.match(/-\s*任务[：:]\s*(.+)/);
  if (tm) taskHint = tm[1].trim().slice(0, 60);
}

const rows = loadLedger();
const hit = rows.find(r => r.ticket === ticket);

console.log(`票据: ${ticket}`);
console.log(`账本: ${LEDGER}（含票据记录 ${rows.length} 条）`);

if (!hit) {
  console.log('❌ 不通过：账本里查无此票。');
  console.log('   可能原因：①引擎没跑过（票据是编的）②账本被清空 ③票据抄错。');
  process.exit(1);
}

console.log(`✅ 票为真：账本命中 —— ${hit.ts?.slice(0, 19).replace('T', ' ')} UTC｜入口 ${hit.source}｜档位 ${hit.tier}｜领域 ${hit.domain}｜命中 ${hit.hits?.length ?? 0} 张`);

if (taskHint) {
  const ledgerTask = String(hit.task || '').trim();
  const repTask = String(taskHint).trim();
  // 严格：两侧各取较短长度做前缀比对（账本只存任务前 60 字）。
  // 不设宽容阈值——「票是真的但换了任务」等于张冠李戴，必须拦。
  const n = Math.min(ledgerTask.length, repTask.length);
  const ok = n > 0 && ledgerTask.slice(0, n) === repTask.slice(0, n);
  if (!ok) {
    console.log('❌ 不通过：票是真的，但不是这一次任务。');
    console.log(`   账本任务: ${ledgerTask}`);
    console.log(`   （票本身为真，但它对应的是上面这条任务——报告里写的是另一件事）`);
    console.log(`   报告任务: ${taskHint}`);
    process.exit(1);
  }
  console.log(`✅ 任务对得上：${ledgerTask}`);
}

console.log('✅ 验票通过：这份报告有引擎实跑凭据。');
process.exit(0);
