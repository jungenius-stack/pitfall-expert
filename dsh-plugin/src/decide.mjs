/**
 * decide.mjs —— dsh 插件的决策逻辑（与 hooks/lib/gate.js 共用 engine/src/gate-core.cjs 规则）
 * API 依据（2026-10-14 拉取官方仓库文档核验）：
 *   - ctx.on('tools/pre-execute', async (exec, next) => PreToolDecision)
 *   - 拒绝返回 { kind: 'deny', reason }；放行返回 next()
 *   - ToolExecution 携带 name / arguments / signal 等不可变字段
 *
 * v0.7.8 分级语义（与 hooks/lib/gate.js 对齐，元坑⑳少而重）：
 *   hard —— 坑卡 intercept 确定性规则命中 → block 模式 deny；report 模式放行+🔴警告
 *   soft —— 软规则 或 扫描型高危卡（S≥4 且 O≥3 词面匹配）→ 一律放行 + 警告（不 deny）
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 选开日志（与 hooks/lib/gate.js 同一账本）：默认关；opts.log 或 PITFALL_HOOK_LOG=1 开 */
function appendLog(entry) {
  try {
    const file = process.env.PITFALL_HOOK_LOG_FILE || path.join(os.homedir(), '.pitfall-expert', 'hook-log.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  } catch (_) { /* 日志失败绝不影响决策 */ }
}

function logDecision(enabled, entry) {
  if (enabled !== true && process.env.PITFALL_HOOK_LOG !== '1') return;
  appendLog(entry);
}

/** 引擎定位：PITFALL_ENGINE_DIR 显式设置时权威且独占（无效则降解，不静默回退）；未设置时按相对路径候选 */
export function resolveEngineDir() {
  const envDir = process.env.PITFALL_ENGINE_DIR;
  if (envDir) {
    try {
      if (fs.existsSync(path.join(envDir, 'src', 'scanner.js'))) return envDir;
    } catch (_) { /* 忽略不可读路径 */ }
    return null; // 显式设置但无效：不静默回退，由调用方降解并告警
  }
  const candidates = [
    path.resolve(__dirname, '../../engine'),        // monorepo 布局：dsh-plugin/src → engine
    path.resolve(__dirname, '../../../engine'),
    path.resolve(process.cwd(), 'engine')
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'src', 'scanner.js'))) return c;
    } catch (_) { /* 忽略不可读路径 */ }
  }
  return null;
}

async function loadEngine(engineDir) {
  const pick = m => (m && m.default) ? m.default : m;
  const scanner = pick(await import(pathToFileURL(path.join(engineDir, 'src', 'scanner.js')).href));
  const reporter = pick(await import(pathToFileURL(path.join(engineDir, 'src', 'report.js')).href));
  const gate = pick(await import(pathToFileURL(path.join(engineDir, 'src', 'gate-core.cjs')).href));
  return { scan: scanner.scan, loadCards: scanner.loadCards, buildReport: reporter.buildReport, gate };
}

/**
 * 对一次工具执行做决策。
 * @param exec ToolExecution（或兼容形状 { name, arguments }）
 * @param opts { mode: 'report'|'block', tier: 'quick'|'standard'|'deep' }
 * @returns { action: 'allow'|'deny', report?, reason?, warn?, skipped?, degraded? }
 */
export async function decide(exec, opts = {}) {
  const mode = opts.mode || process.env.PITFALL_HOOK_MODE || 'report';
  const tier = opts.tier || process.env.PITFALL_HOOK_TIER || 'quick';
  const logOn = opts.log === true || process.env.PITFALL_HOOK_LOG === '1';
  const digestOf = t => String(t || '').slice(0, 200);
  const toolOf = e => (e && (e.name ?? e.tool ?? e.toolName)) || '';

  const engineDir = resolveEngineDir();
  if (!engineDir) {
    // 诚实架构：引擎缺失必须显式降解，不允许被理解为"没有坑"
    return {
      action: 'allow',
      degraded: true,
      reason: '踩坑专家：未找到引擎（engine/src/scanner.js）——本次不产出风险扫描，不得理解为没有坑；可用 PITFALL_ENGINE_DIR 指定引擎目录'
    };
  }

  const engine = await loadEngine(engineDir);

  // exec 形状防御（ToolExecution 官方形状为 name/arguments；旧形状兜底）
  const call = {
    name: exec?.name ?? exec?.tool ?? exec?.toolName ?? '',
    arguments: exec?.arguments ?? exec?.args ?? exec?.input ?? {}
  };

  // 确定性规则判定先于跳过启发式（CODE-018 顺序纪律，规则只此一处）
  let rules = [];
  try { rules = engine.gate.buildInterceptRules(engine.loadCards().cards).rules; } catch (_) { rules = []; }
  const d = engine.gate.decideRules(call, rules);
  const hardCards = [...new Set(d.hits.filter(h => h.tier === 'hard').map(h => h.cardId))];
  const softRuleCards = [...new Set(d.hits.filter(h => h.tier === 'soft').map(h => h.cardId))];
  const ext = engine.gate.extractTask(call);

  if (d.decision === 'block' && mode === 'block') {
    logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'hard_block', tool: toolOf(exec), rules: hardCards, input: digestOf(ext.task) });
    return {
      action: 'deny',
      reason: `踩坑专家·阻断：命中硬拦截规则（${hardCards.join(', ')}）——不可逆/泄密类操作，必须人工确认。被拦内容摘要：${String(ext.task || '').slice(0, 120)}。规则来自坑卡 intercept 字段，可解释可审计；确认无误请人工执行，或设 PITFALL_HOOK_MODE=report 改为只报告。`
    };
  }

  if (ext.skip) {
    if (hardCards.length > 0) {
      logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'hard_warn', tool: toolOf(exec), rules: hardCards, input: digestOf(ext.task) });
      return { action: 'allow', warn: `踩坑专家·🔴 高危：硬规则命中（${hardCards.join(', ')}）——report 模式未拦截，请人工确认后再执行。` };
    }
    if (softRuleCards.length > 0) {
      logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'soft_warn', tool: toolOf(exec), rules: softRuleCards, cards: [], input: digestOf(ext.task) });
      return { action: 'allow', warn: `踩坑专家·警告：软规则（${softRuleCards.join(', ')}）——已放行，请复核本次调用。` };
    }
    return { action: 'allow', skipped: true };
  }

  let report;
  let result;
  try {
    result = engine.scan(ext.task, { tier, domain: 'auto' });
    report = engine.buildReport(result);
  } catch (e) {
    logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'error', tool: toolOf(exec), input: digestOf(ext.task) });
    return { action: 'allow', degraded: true, reason: '踩坑专家：扫描失败（fail-open 放行）——不得理解为没有坑' };
  }

  const high = engine.gate.highRiskCards(result);
  const warnParts = [];
  if (hardCards.length) warnParts.push(`硬规则命中（${hardCards.join(', ')}）——report 模式未拦截，请人工确认`);
  if (softRuleCards.length) warnParts.push(`软规则（${softRuleCards.join(', ')}）`);
  // 元坑⑳实测教训：词面高危卡在普通任务上可命中 9 张——只提示不进警告主渠道，且仅 block 模式提示
  if (mode === 'block' && high.length) warnParts.push(`词面高危 ${high.length} 项（${high.map(s => s.card.id).join(', ')}）未阻断（阻断仅限硬规则）`);
  if (warnParts.length) {
    logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'soft_warn', tool: toolOf(exec), rules: [...hardCards, ...softRuleCards], cards: high.map(s => s.card.id), input: digestOf(ext.task) });
    return { action: 'allow', report, warn: `踩坑专家·警告：${warnParts.join(' + ')}——已放行，请复核。` };
  }

  logDecision(logOn, { ts: new Date().toISOString(), event: 'pre-execute', mode, decision: 'pass', tool: toolOf(exec), cards: high.map(s => s.card.id), input: digestOf(ext.task) });
  // report 模式（默认）：先报告后放行
  return { action: 'allow', report, advisory: true };
}
