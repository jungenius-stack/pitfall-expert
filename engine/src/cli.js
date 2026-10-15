#!/usr/bin/env node
'use strict';
/**
 * pitfall-expert CLI —— 供 hook 门控与人工调用
 * 用法：node src/cli.js "任务描述" [--tier quick|standard|deep] [--domain auto|code|math|...] [--cards-dir 路径]
 * 退出码：0=报告已产出；1=扫描失败（显式披露，不得理解为没有坑）；2=任务描述为空或过短（grill-me 退回）
 */

const { scan } = require('./scanner');
const { buildReport } = require('./report');

function parseArgs(argv) {
  const out = { task: '', tier: 'standard', domain: 'auto', cardsDir: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tier' && argv[i + 1]) { out.tier = argv[++i]; }
    else if (a === '--domain' && argv[i + 1]) { out.domain = argv[++i]; }
    else if (a === '--cards-dir' && argv[i + 1]) { out.cardsDir = argv[++i]; }
    else if (a.startsWith('--tier=')) { out.tier = a.slice(7); }
    else if (a.startsWith('--domain=')) { out.domain = a.slice(9); }
    else if (a.startsWith('--cards-dir=')) { out.cardsDir = a.slice(12); }
    else rest.push(a);
  }
  out.task = rest.join(' ').trim();
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.task || args.task.length < 4) {
  process.stderr.write('错误：任务描述为空或过短——需求是糊的，按方法论 SOP 第 1 步退回：请补充任务内容、验收标准与边界条件。\n');
  process.exit(2);
}

try {
  const result = scan(args.task, { tier: args.tier, domain: args.domain, cardsDir: args.cardsDir });
  process.stdout.write(buildReport(result) + '\n');
} catch (e) {
  process.stderr.write(`扫描失败：${e.message}\n按诚实架构披露：本次未产出任何风险报告，故障原因如上。不得将此失败理解为"没有坑"。\n`);
  process.exit(1);
}
