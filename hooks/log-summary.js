#!/usr/bin/env node
'use strict';
/**
 * hooks/log-summary.js —— 拦截日志聚合（P2 评测协议 §八.2 习惯化测量的数据出口）
 *
 * 用法：node hooks/log-summary.js [日志文件]
 *   日志文件缺省 ~/.pitfall-expert/hook-log.jsonl（与 gate.js 的 PITFALL_HOOK_LOG_FILE 同源）
 *
 * 输出：
 *   1. 决策分布（hard_block / hard_warn / soft_warn / pass / error）
 *   2. 每条规则/卡的出现频次 Top 榜
 *   3. 软警告的暴露序号分布——同一规则第 N 次出现的时间线（习惯化曲线的原料：暴露序号→是否仍被理会）
 *
 * 设计约束：只读、本地、无网络；日志不存在时安静退出（说明还没开 PITFALL_HOOK_LOG=1）。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const file = process.argv[2]
  || process.env.PITFALL_HOOK_LOG_FILE
  || path.join(os.homedir(), '.pitfall-expert', 'hook-log.jsonl');

if (!fs.existsSync(file)) {
  console.log(`无日志文件：${file}`);
  console.log('开启拦截日志：设 PITFALL_HOOK_LOG=1（可选 PITFALL_HOOK_LOG_FILE 指定路径）后正常使用即可。');
  process.exit(0);
}

const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
const entries = [];
for (const line of lines) {
  try { entries.push(JSON.parse(line)); } catch (_) { /* 坏行跳过 */ }
}
if (entries.length === 0) {
  console.log(`日志为空：${file}`);
  process.exit(0);
}

// ---- 1. 决策分布 ----
const byDecision = {};
for (const e of entries) byDecision[e.decision] = (byDecision[e.decision] || 0) + 1;

console.log(`# 拦截日志聚合（${path.basename(file)}，${entries.length} 条，${entries[0].ts.slice(0, 10)} ~ ${entries[entries.length - 1].ts.slice(0, 10)}）\n`);
console.log('## 决策分布');
for (const [k, v] of Object.entries(byDecision).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${v}`);
}
const blocks = byDecision.hard_block || 0;
const softs = byDecision.soft_warn || 0;
if (blocks + softs > 0) {
  console.log(`\n  警告:拦截比 = ${softs}:${blocks}（拦截占比 ${Math.round(blocks * 100 / (blocks + softs))}%）——元坑⑳参考：拦截应少而准，占比过高考虑收紧规则`);
}

// ---- 2. 规则/卡频次 Top ----
const byRule = {};
for (const e of entries) {
  for (const r of e.rules || []) byRule[r] = (byRule[r] || 0) + 1;
  for (const c of e.cards || []) byRule[c] = (byRule[c] || 0) + 1;
}
const top = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 15);
if (top.length) {
  console.log('\n## 规则/卡命中频次 Top 15');
  for (const [k, v] of top) console.log(`  ${String(v).padStart(5)}  ${k}`);
}

// ---- 3. 软警告暴露序号（习惯化曲线原料）----
const exposure = {}; // key -> [ts...]
for (const e of entries) {
  if (e.decision !== 'soft_warn') continue;
  const keys = [...(e.rules || []), ...(e.cards || [])];
  for (const k of keys) (exposure[k] = exposure[k] || []).push(e.ts);
}
const expKeys = Object.entries(exposure).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length);
if (expKeys.length) {
  console.log('\n## 软警告暴露序号（≥2 次的规则/卡；同一信号反复出现而行为未变 = 习惯化信号，评测协议 §八.2）');
  for (const [k, tsList] of expKeys.slice(0, 10)) {
    console.log(`  ${k}（${tsList.length} 次）：${tsList.map((t, i) => `#${i + 1}@${t.slice(5, 16)}`).join(' ')}`);
  }
} else {
  console.log('\n## 软警告暴露序号：暂无 ≥2 次的重复信号');
}
