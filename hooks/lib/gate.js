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
 *   PITFALL_HOOK_MODE=report（默认）先报告后放行；=block 硬规则命中才拦
 *   PITFALL_HOOK_TIER=quick|standard|deep（默认 quick，控制时延）
 *   PITFALL_HOOK_DISABLE=1 总开关（kill switch）
 *   PITFALL_ENGINE_DIR 指向 engine/（默认相对本文件定位）
 *   PITFALL_HOOK_LOG=1 选开拦截日志（默认关，保 PRIVACY.md「零写入」承诺）
 *   PITFALL_HOOK_LOG_FILE 日志路径（默认 ~/.pitfall-expert/hook-log.jsonl；仅供测试/自用观察）
 *
 * v0.7.8 分级语义（元坑⑳「少而重」）：
 *   hard —— 坑卡 intercept 确定性规则命中 → block 模式 exit 2；report 模式 🔴 标注放行
 *   soft —— 软规则命中 或 扫描型高危卡（S≥4 且 O≥3，词面匹配）→ 一律放行 + 显著警告
 *   阻断必须可解释「拦了哪条规则」；词面匹配不配阻断权。
 *
 * 设计纪律：门控自身也是会失效的一层（方法论 5.5）——
 * 输入解析失败/引擎缺失/规则表构建失败一律 fail-open 放行，绝不让门控成为阻塞源；
 * 但引擎扫描失败会显式输出披露，不允许被理解为"没有坑"。
 * 规则构建/判定/跳过启发式收敛在 engine/src/gate-core.cjs，与 dsh 插件共用一处。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const event = process.argv[2] || 'PreToolUse';
const engineDir = process.env.PITFALL_ENGINE_DIR || path.resolve(__dirname, '../../engine');
const mode = process.env.PITFALL_HOOK_MODE || 'report';
const tier = process.env.PITFALL_HOOK_TIER || 'quick';

const { extractTask, buildInterceptRules, decideRules, highRiskCards } = require(path.join(engineDir, 'src/gate-core.cjs'));

function loadScanner() {
  const scanner = require(path.join(engineDir, 'src/scanner'));
  const { buildReport } = require(path.join(engineDir, 'src/report'));
  return { scan: scanner.scan, loadCards: scanner.loadCards, buildReport };
}

/** 拦截规则表：从卡库构建（fail-open：构建失败=无规则拦截） */
function loadRules() {
  try {
    const { loadCards } = loadScanner();
    return buildInterceptRules(loadCards().cards).rules;
  } catch (_) { return []; }
}

/** 选开日志（PITFALL_HOOK_LOG=1）：本地 JSONL，只记非跳过决策；失败绝不影响放行 */
function appendLog(entry) {
  if (process.env.PITFALL_HOOK_LOG !== '1') return;
  try {
    const file = process.env.PITFALL_HOOK_LOG_FILE || path.join(os.homedir(), '.pitfall-expert', 'hook-log.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (_) { /* 日志失败静默——门不得成为阻塞源 */ }
}

function emit(text) { process.stdout.write(text + '\n'); }

function toolNameOf(json) {
  return json && (json.name || json.tool || json.tool_name || json.toolName) || '';
}

function main(json) {
  if (process.env.PITFALL_HOOK_DISABLE === '1') { process.exit(0); }
  if (!fs.existsSync(path.join(engineDir, 'src/cli.js'))) { process.exit(0); } // fail-open

  if (event === 'UserPromptSubmit') {
    const prompt = String(json.prompt || json.user_prompt || '').trim();
    if (prompt.length < 4) { process.exit(0); }
    let report;
    try {
      const { scan, buildReport } = loadScanner();
      report = buildReport(scan(prompt.slice(0, 2000), { tier, domain: 'auto' }));
    } catch (e) {
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
  // 顺序纪律（CODE-018）：确定性规则判定必须先于跳过启发式——git push --force 首词是 git
  const rules = loadRules();
  const d = decideRules(json, rules);
  const ext = extractTask(json);
  const tool = toolNameOf(json);
  const digest = String(ext.task || '').slice(0, 200); // 输入摘要（任务文本前 200 字符）

  // 硬规则：block 模式阻断；report 模式 🔴 标注放行
  if (d.decision === 'block') {
    const cards = [...new Set(d.hits.filter(h => h.tier === 'hard').map(h => h.cardId))];
    if (mode === 'block') {
      appendLog({ ts: new Date().toISOString(), event, mode, decision: 'hard_block', tool, rules: cards, input: digest });
      process.stderr.write(`【踩坑专家·阻断】命中硬拦截规则（${cards.join(', ')}）——不可逆/泄密类操作，必须人工确认。\n被拦内容摘要：${digest.slice(0, 120)}\n如确认无误请人工执行；或设 PITFALL_HOOK_MODE=report 改为只报告（规则来自坑卡 intercept 字段，可解释可审计）。\n`);
      process.exit(2);
    }
    appendLog({ ts: new Date().toISOString(), event, mode, decision: 'hard_warn', tool, rules: cards, input: digest });
    emit(`【踩坑专家·🔴 高危】命中硬拦截规则（${cards.join(', ')}）——report 模式未拦截。此操作不可逆/涉密，请人工确认后再执行（block 模式会直接拦下）。\n`);
  }

  // 琐碎命令跳过前，软规则警告必须先浮出（echo x > .env 首词是 echo——警告不能被跳过启发式吞掉）
  const softRuleCards = [...new Set(d.hits.filter(h => h.tier === 'soft').map(h => h.cardId))];
  if (ext.skip) {
    if (softRuleCards.length > 0) {
      appendLog({ ts: new Date().toISOString(), event, mode, decision: 'soft_warn', tool, rules: softRuleCards, cards: [], input: digest });
      process.stderr.write(`【踩坑专家·警告】软规则（${softRuleCards.join(', ')}）——已放行，请复核本次调用。\n`);
    }
    process.exit(0);
  }

  let report;
  let result;
  try {
    const { scan, buildReport } = loadScanner();
    result = scan(ext.task, { tier, domain: 'auto' });
    report = buildReport(result); // 只扫一次（v0.7.8 前的 block 路径扫两遍）
  } catch (e) {
    appendLog({ ts: new Date().toISOString(), event, mode, decision: 'error', tool, input: digest });
    emit('【踩坑专家】引擎扫描失败（已放行）——按诚实架构披露：本次未产出风险报告，不得理解为"没有坑"。');
    process.exit(0); // fail-open：门控故障不阻塞工作流，但显式披露
  }

  // 软警告分级（元坑⑳实测教训：一份普通文档可命中 9 张词面高危卡——stderr 只留给确定性规则）：
  //   stderr 警告 = 仅软规则命中（可解释「哪条规则」）；词面高危卡回报告正文，block 模式加一行 stdout 提示
  const high = highRiskCards(result);
  if (softRuleCards.length > 0) {
    appendLog({
      ts: new Date().toISOString(), event, mode, decision: 'soft_warn', tool,
      rules: softRuleCards, cards: high.map(s => s.card.id), input: digest
    });
    process.stderr.write(`【踩坑专家·警告】软规则（${softRuleCards.join(', ')}）——已放行，请复核本次调用。\n`);
  } else {
    appendLog({ ts: new Date().toISOString(), event, mode, decision: 'pass', tool, cards: high.map(s => s.card.id), input: digest });
  }
  if (mode === 'block' && high.length > 0) {
    emit(`【踩坑专家】block 模式：词面高危 ${high.length} 项（${high.map(s => s.card.id).join(', ')}）未阻断——阻断仅限确定性硬规则（词面匹配不配阻断权），详见下方报告。`);
  }

  emit(mode === 'block'
    ? '【踩坑专家】扫描完成（block 模式：未命中硬规则）。'
    : '【踩坑专家·预报告】本次工具调用已快扫（未拦截；硬规则拦截请设 PITFALL_HOOK_MODE=block）：');
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
