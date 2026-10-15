#!/usr/bin/env node
'use strict';
/**
 * pitfall-expert hook 门控核心
 * 用法：node gate.js <PreToolUse|UserPromptSubmit>  （hook JSON 从 stdin 进）
 *
 * 事件语义（经 2026-10-14 官方文档核验）：
 *   - UserPromptSubmit：stdout 纯文本追加进模型上下文（本事件用于"值班注入"）
 *   - PreToolUse：exit 0=放行；exit 2=阻断且 stderr 回给模型（本事件用于"高危拦截"）
 *
 * 模式（环境变量）：
 *   PITFALL_HOOK_MODE=report（默认）先报告后放行；=block 命中高危才拦
 *   PITFALL_HOOK_TIER=quick|standard|deep（默认 quick，控制时延）
 *   PITFALL_HOOK_DISABLE=1 总开关（kill switch）
 *   PITFALL_ENGINE_DIR 指向 engine/（默认相对本文件定位）
 *
 * 设计纪律：门控自身也是会失效的一层（方法论 5.5）——
 * 输入解析失败/引擎缺失/超时一律 fail-open 放行，绝不让门控成为阻塞源；
 * 但引擎扫描失败会显式输出披露，不允许被理解为"没有坑"。
 * 规则（跳过启发式/破坏性模式/高危判据）收敛在 engine/src/gate-core.cjs，与 dsh 插件共用一处。
 */

const fs = require('fs');
const path = require('path');

const event = process.argv[2] || 'PreToolUse';
const engineDir = process.env.PITFALL_ENGINE_DIR || path.resolve(__dirname, '../../engine');
const mode = process.env.PITFALL_HOOK_MODE || 'report';
const tier = process.env.PITFALL_HOOK_TIER || 'quick';

const { extractTask, highRiskCards } = require(path.join(engineDir, 'src/gate-core.cjs'));

function runScan(task) {
  const { scan } = require(path.join(engineDir, 'src/scanner'));
  const { buildReport } = require(path.join(engineDir, 'src/report'));
  return buildReport(scan(task, { tier, domain: 'auto' }));
}

function emit(text) { process.stdout.write(text + '\n'); }

function main(json) {
  if (process.env.PITFALL_HOOK_DISABLE === '1') { process.exit(0); }
  if (!fs.existsSync(path.join(engineDir, 'src/cli.js'))) { process.exit(0); } // fail-open

  if (event === 'UserPromptSubmit') {
    const prompt = String(json.prompt || json.user_prompt || '').trim();
    if (prompt.length < 4) { process.exit(0); }
    let report;
    try { report = runScan(prompt.slice(0, 2000)); } catch (e) {
      emit('【踩坑专家值班】引擎扫描失败——按诚实架构披露：本次未产出风险报告，不得理解为"没有坑"。需要时手动调用 scan_task。');
      process.exit(0);
    }
    emit('【踩坑专家值班】以下是对本次请求的 ⚡快扫 预报告（完整审查请说"用踩坑专家标准档/深审审查"）：');
    emit('');
    emit(report);
    emit('');
    emit('【值班规则】✅ 区命中项执行时逐条规避；❓ 区决定是否升档；🚫 区原文告知用户，不许删改弱化。');
    process.exit(0);
  }

  // PreToolUse
  const ext = extractTask(json);
  if (ext.skip) { process.exit(0); }

  let report;
  try { report = runScan(ext.task); } catch (e) {
    emit('【踩坑专家】引擎扫描失败（已放行）——按诚实架构披露：本次未产出风险报告，不得理解为"没有坑"。');
    process.exit(0); // fail-open：门控故障不阻塞工作流，但显式披露
  }

  if (mode === 'block') {
    // 破坏性命令：无视坑卡直接拦（权限系统思路，方法论 5.3）
    if (ext.destructive) {
      process.stderr.write('【踩坑专家·阻断】检测到破坏性命令（不可逆操作，方法论 5.3：不可回滚的操作自动升 🔴）。\n' + report + '\n请人工确认后重试，或设置 PITFALL_HOOK_MODE=report 改为只报告。\n');
      process.exit(2);
    }
    // 高危坑卡：S≥4 且 O≥3 才拦
    try {
      const { scan } = require(path.join(engineDir, 'src/scanner'));
      const r = scan(ext.task, { tier, domain: 'auto' });
      const high = highRiskCards(r);
      if (high.length > 0) {
        process.stderr.write(`【踩坑专家·阻断】命中 ${high.length} 项高危坑（S≥4 且 O≥3）：${high.map(s => s.card.id).join(', ')}\n` + report + '\n请人工确认后重试，或设置 PITFALL_HOOK_MODE=report 改为只报告。\n');
        process.exit(2);
      }
    } catch (_) { /* 判定失败→放行 */ }
    emit('【踩坑专家】未命中高危坑（block 模式）。\n' + report);
    process.exit(0);
  }

  // report 模式（默认）：先报告后放行
  emit('【踩坑专家·预报告】本次工具调用已快扫（未拦截；高危拦截请设 PITFALL_HOOK_MODE=block）：');
  emit('');
  emit(report);
  process.exit(0);
}

let input = '';
process.stdin.on('data', d => { input += d; if (input.length > 1e6) process.exit(0); });
process.stdin.on('end', () => {
  try { main(JSON.parse(input)); } catch (_) { process.exit(0); } // 输入异常→fail-open
});
process.stdin.resume();
