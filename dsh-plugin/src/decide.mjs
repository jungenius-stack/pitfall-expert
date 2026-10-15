/**
 * decide.mjs —— dsh 插件的决策逻辑（与 hooks/lib/gate.js 共用 engine/src/gate-core.cjs 规则）
 * API 依据（2026-10-14 拉取官方仓库文档核验）：
 *   - ctx.on('tools/pre-execute', async (exec, next) => PreToolDecision)
 *   - 拒绝返回 { kind: 'deny', reason }；放行返回 next()
 *   - ToolExecution 携带 name / arguments / signal 等不可变字段
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  return { scan: scanner.scan, buildReport: reporter.buildReport, gate };
}

/**
 * 对一次工具执行做决策。
 * @param exec ToolExecution（或兼容形状 { name, arguments }）
 * @param opts { mode: 'report'|'block', tier: 'quick'|'standard'|'deep' }
 * @returns { action: 'allow'|'deny', report?, reason?, skipped?, degraded? }
 */
export async function decide(exec, opts = {}) {
  const mode = opts.mode || process.env.PITFALL_HOOK_MODE || 'report';
  const tier = opts.tier || process.env.PITFALL_HOOK_TIER || 'quick';

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
  const ext = engine.gate.extractTask(call);
  if (ext.skip) return { action: 'allow', skipped: true };

  const result = engine.scan(ext.task, { tier, domain: 'auto' });
  const report = engine.buildReport(result);

  if (mode === 'block') {
    if (ext.destructive) {
      return {
        action: 'deny',
        report,
        reason: '踩坑专家·阻断：检测到破坏性命令（不可逆操作，方法论 5.3：不可回滚的操作自动升 🔴）。请人工确认后重试，或设 PITFALL_HOOK_MODE=report 改为只报告。'
      };
    }
    const high = engine.gate.highRiskCards(result);
    if (high.length > 0) {
      return {
        action: 'deny',
        report,
        reason: `踩坑专家·阻断：命中 ${high.length} 项高危坑（S≥4 且 O≥3）：${high.map(s => s.card.id).join(', ')}。请人工确认后重试，或设 PITFALL_HOOK_MODE=report 改为只报告。`
      };
    }
    return { action: 'allow', report };
  }

  // report 模式（默认）：先报告后放行
  return { action: 'allow', report, advisory: true };
}
