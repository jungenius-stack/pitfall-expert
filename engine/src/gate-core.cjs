'use strict';
/**
 * gate-core —— 门控共享核心（hooks 与 dsh 插件共用，规则只此一处）
 * 依据方法论 v0.3：5.3 最小权限/可回滚（不可逆操作升 🔴）、5.5 门控失效模式（fail-open）、
 * 元坑① 自指应用（跳过启发式防门控自我瘫痪）。
 *
 * v0.7.8 起：硬编码 DESTRUCTIVE_PATTERNS 退役，拦截规则活在坑卡的 intercept 字段里
 * （cards/*.yaml → loadCards → buildInterceptRules），知识层与执行层同源演化。
 *
 * 分级语义：
 *   hard  —— 确定性规则命中（正则，可解释「拦了哪条」）：block 模式下 exit 2 阻断
 *   soft  —— 可疑但可恢复 / 词面匹配型高危卡命中：放行 + 显著警告 + 日志
 *   顺序纪律（CODE-018）：decideRules 必须先于 extractTask 的跳过启发式求值——
 *   否则 git push --force 会因首词 git 命中琐碎表被静默放过。
 */

const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'TodoRead', 'NotebookRead', 'ListMcpResources'
]);

const TRIVIAL_CMDS = new Set([
  'ls', 'cat', 'pwd', 'echo', 'printf', 'head', 'tail', 'which', 'env', 'date',
  'ps', 'top', 'find', 'grep', 'true', 'false', 'test', 'git', 'npm ls', 'node -v'
]);

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const BASH_TOOLS = new Set(['Bash', 'Shell', 'bash', 'shell']);

/**
 * 从工具调用中提取任务描述。
 * call 形状按 harness 不同做防御：{ name, arguments } / { tool, input } / { tool_name, tool_input } / string
 * 返回 { skip, reason?, task? }
 * 注意：本函数只管「提取与跳过」，拦截判定在 decideRules（须先于本函数调用）。
 */
function extractTask(call) {
  if (typeof call === 'string') call = { name: 'Bash', arguments: { command: call } };
  if (!call || typeof call !== 'object') return { skip: true, reason: '无调用内容' };

  const name = call.name || call.tool || call.tool_name || call.toolName || '';
  const input = call.arguments || call.input || call.tool_input || call.toolInput || {};

  if (READONLY_TOOLS.has(name)) return { skip: true, reason: '只读工具' };

  if (BASH_TOOLS.has(name)) {
    const cmd = String(input.command || '').trim();
    if (!cmd) return { skip: true, reason: '空命令' };
    const parts = cmd.split(/\s+/);
    const first = parts[0] || '';
    const two = parts.slice(0, 2).join(' ');
    if (TRIVIAL_CMDS.has(first) || TRIVIAL_CMDS.has(two)) return { skip: true, reason: '琐碎命令' };
    if (cmd.length < 8) return { skip: true, reason: '命令过短' };
    return { skip: false, task: cmd.slice(0, 800) };
  }

  if (WRITE_TOOLS.has(name)) {
    const fp = String(input.file_path || input.path || input.notebook_path || '');
    const body = String(input.content || input.new_string || input.new_source || input.edits || '').slice(0, 400);
    const task = `写文件 ${fp}：${body}`.trim();
    return task.length < 8 ? { skip: true, reason: '无可提取内容' } : { skip: false, task };
  }

  if (name === 'WebFetch') {
    const task = `抓取 ${input.url || ''} ${input.prompt || ''}`.trim();
    return task.length < 8 ? { skip: true, reason: '无可提取内容' } : { skip: false, task };
  }

  if (name === 'Task' || name === 'Agent') {
    const task = `${input.description || ''} ${input.prompt || ''}`.trim();
    return task.length < 8 ? { skip: true, reason: '无可提取内容' } : { skip: false, task };
  }

  // 其他工具：整体快照（截断）
  let snap = '';
  try { snap = JSON.stringify(input); } catch (_) { snap = ''; }
  const task = `${name} ${snap}`.slice(0, 800).trim();
  return task.length < 8 ? { skip: true, reason: '无可提取内容' } : { skip: false, task };
}

/**
 * 从加载后的卡库构建拦截规则表（平铺为单条规则）。
 * 卡的可选字段 intercept: [{ tier: hard|soft, tools?: [Bash|Write], patterns: [regex 字符串] }]
 * 坏正则跳过该条并计入 dropped，绝不抛出——规则构建失败属于 fail-open 面（不拦，但可披露）。
 * 返回 { rules: [{ tier, re, cardId, tools }], dropped }
 */
function buildInterceptRules(cards) {
  const rules = [];
  let dropped = 0;
  for (const card of cards || []) {
    if (!Array.isArray(card.intercept)) continue;
    for (const g of card.intercept) {
      if (!g || !Array.isArray(g.patterns)) continue;
      for (const p of g.patterns) {
        if (typeof p !== 'string' || !p) { dropped++; continue; }
        try {
          rules.push({
            tier: g.tier === 'hard' ? 'hard' : 'soft',
            re: new RegExp(p),
            cardId: card.id,
            tools: Array.isArray(g.tools) && g.tools.length ? g.tools : ['Bash'] // 缺省只作用于命令文本，防文档内容误拦
          });
        } catch (_) { dropped++; }
      }
    }
  }
  return { rules, dropped };
}

/**
 * 确定性规则判定（不依赖扫描器，直接对原始输入文本应用规则）。
 * 通道：Bash → input.command；Write/Edit/MultiEdit/NotebookEdit → 写入内容（密钥检测的旗舰场景）。
 * 返回 { decision: 'block'|'warn'|null, hits: [{ tier, cardId }], channel }
 * 调用纪律：必须先于 extractTask（跳过启发式）求值。
 */
function decideRules(call, rules) {
  if (typeof call === 'string') call = { name: 'Bash', arguments: { command: call } };
  if (!call || typeof call !== 'object') return { decision: null, hits: [], channel: null };

  const name = call.name || call.tool || call.tool_name || call.toolName || '';
  const input = call.arguments || call.input || call.tool_input || call.callInput || {};

  let channel = null;
  let text = '';
  if (BASH_TOOLS.has(name)) {
    channel = 'Bash';
    text = String(input.command || '');
  } else if (WRITE_TOOLS.has(name)) {
    channel = 'Write';
    let edits = '';
    try { if (input.edits !== undefined) edits = JSON.stringify(input.edits); } catch (_) { edits = ''; }
    text = [input.content, input.new_string, input.new_source, edits]
      .map(v => (v === undefined || v === null) ? '' : String(v)).join('\n');
  } else {
    return { decision: null, hits: [], channel: null };
  }
  if (!text) return { decision: null, hits: [], channel };

  const hits = [];
  for (const r of rules || []) {
    if (!r.tools || !r.tools.includes(channel)) continue;
    try { if (r.re.test(text)) hits.push({ tier: r.tier, cardId: r.cardId }); } catch (_) { /* 单条规则异常不拖垮整体 */ }
  }
  const decision = hits.some(h => h.tier === 'hard') ? 'block' : (hits.length ? 'warn' : null);
  return { decision, hits, channel };
}

/** 高危坑卡判据：S≥4 且 O≥3（v0.7.8 起只作软警告依据——词面匹配不配阻断权，阻断只给确定性规则） */
function isHighRisk(card) {
  const s = card.severity || {};
  return typeof s.S === 'number' && typeof s.O === 'number' && s.S >= 4 && s.O >= 3;
}

/** 从扫描结果中挑高危卡 */
function highRiskCards(scanResult) {
  return (scanResult.matched || []).filter(s => isHighRisk(s.card));
}

module.exports = {
  READONLY_TOOLS, TRIVIAL_CMDS, WRITE_TOOLS,
  extractTask, buildInterceptRules, decideRules, isHighRisk, highRiskCards
};
