#!/usr/bin/env node
/**
 * 第⑰号门自动守门器（eval/gate.js）
 *
 * 用途：任何新增/修改坑卡后跑一次，判定「跨域误命中不增」。
 * 背景：元坑⑰——词干化/泛词改动曾在 10 任务电池上引入跨域噪音，
 *      此后每次改卡必须过这道门，靠人工比对 10 组数字不可靠。
 *
 * 判定表（前置，先写再执行）：
 *   输出「跨域误命中增量: 0」+ exit 0  ⇒ 门通过
 *   输出任何增量为正的域            ⇒ 门失败，exit 1
 *   输出「解析失败 / 引擎报错」      ⇒ 未判定，exit 2（不得当作通过）
 *
 * 副作用分类：只读（只跑引擎 quick 档，不写任何文件）。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'engine', 'src', 'cli.js');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'battery.json'), 'utf8'));

// 标签一律从引擎 DOMAINS 派生，不在本脚本里硬编码报告文案。
// 历史坑：曾按「域无中文名时报告打印原始英文键」把 'agent-security' 写死进正则，
// 引擎补上中文名后正则失配，⑰号门整门退化为「未判定」。
const { DOMAINS } = require(path.join(ROOT, 'engine', 'src', 'scanner.js'));

const DOMAIN_KEYS = {
  code: 'code',
  'agent-security': 'security',
  creative: 'creative',
  math: 'math',
  'research-decision': 'rd',
  science: 'science',
  strategy: 'strategy',
};

function scanOnce(text) {
  const out = execFileSync('node', [ENGINE, text, '--tier', 'quick'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const line = out.split('\n').find((l) => l.includes('扫描范围'));
  if (!line) throw new Error('未找到「扫描范围」行，引擎输出格式可能变了');
  const counts = {};
  for (const [domain, key] of Object.entries(DOMAIN_KEYS)) {
    const label = DOMAINS[domain] || domain; // 与 report.js 的 coverageLine 同源
    const m = line.match(new RegExp(`${label.replace(/[/\\]/g, '\\$&')} (\\d+)/\\d+`));
    if (!m) throw new Error(`扫描范围行里缺 ${label} 域（${domain}），无法判定`);
    counts[key] = Number(m[1]);
  }
  return counts;
}

let exitCode = 0;
const increases = [];

for (const task of spec.tasks) {
  let now;
  try {
    now = scanOnce(task.text);
  } catch (e) {
    console.error(`[未判定] 任务${task.id}「${task.text}」解析失败：${e.message}`);
    exitCode = 2;
    continue;
  }
  const base = spec.baseline[String(task.id)];
  const deltas = {};
  for (const key of Object.keys(DOMAIN_KEYS).map((z) => DOMAIN_KEYS[z])) {
    const d = (now[key] || 0) - (base[key] || 0);
    if (d !== 0) deltas[key] = `${base[key]}→${now[key]}`;
    if (d > 0) increases.push({ task: task.id, domain: key, from: base[key], to: now[key] });
  }
  const tag = Object.keys(deltas).length === 0 ? '零变化' : JSON.stringify(deltas);
  console.log(`任务${String(task.id).padStart(2)} ${task.text.slice(0, 20).padEnd(22)} ${tag}`);
}

console.log('');
if (exitCode === 2) {
  console.log('⑰号门：未判定（有任务解析失败）。不得当作通过。');
} else if (increases.length === 0) {
  console.log('⑰号门：通过 —— 跨域误命中增量 0（10/10 任务零增）。');
} else {
  console.log(`⑰号门：失败 —— ${increases.length} 处新增命中：`);
  for (const i of increases) console.log(`  · 任务${i.task} ${i.domain} ${i.from}→${i.to}`);
  console.log('  处置：查是哪张卡的哪个字段/触发词点亮，改具体表述后重跑（先例：MATH-014「复杂度」、SCI-011「这张图」、CODE-045「实现」）。');
  exitCode = 1;
}
process.exit(exitCode);
