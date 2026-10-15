'use strict';
/**
 * gate-core —— 门控共享核心（hooks 与 dsh 插件共用，规则只此一处）
 * 依据方法论 v0.3：5.3 最小权限/可回滚（不可逆操作升 🔴）、5.5 门控失效模式（fail-open）、
 * 元坑① 自指应用（跳过启发式防门控自我瘫痪）。
 */

const READONLY_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'TodoRead', 'NotebookRead', 'ListMcpResources'
]);

const TRIVIAL_CMDS = new Set([
  'ls', 'cat', 'pwd', 'echo', 'printf', 'head', 'tail', 'which', 'env', 'date',
  'ps', 'top', 'find', 'grep', 'true', 'false', 'test', 'git', 'npm ls', 'node -v'
]);

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s/,   // rm -r / -rf / -fr …
  /\brm\s+-[a-zA-Z]*f[a-zA-Z]*\s+\//,               // rm -f /...
  /git\s+push\s+.*(--force|-f)\b/,
  /git\s+reset\s+--hard/,
  /\b(DROP|TRUNCATE)\s+TABLE/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/(sd|disk|nvme)/,
  /\bchmod\s+-R\s+777\s+\//
];

/**
 * 从工具调用中提取任务描述。
 * call 形状按 harness 不同做防御：{ name, arguments } / { tool, input } / { tool_name, tool_input } / string
 * 返回 { skip, reason?, destructive?, task? }
 */
function extractTask(call) {
  if (typeof call === 'string') call = { name: 'Bash', arguments: { command: call } };
  if (!call || typeof call !== 'object') return { skip: true, reason: '无调用内容' };

  const name = call.name || call.tool || call.tool_name || call.toolName || '';
  const input = call.arguments || call.input || call.tool_input || call.toolInput || {};

  if (READONLY_TOOLS.has(name)) return { skip: true, reason: '只读工具' };

  if (name === 'Bash' || name === 'Shell' || name === 'bash' || name === 'shell') {
    const cmd = String(input.command || '').trim();
    if (!cmd) return { skip: true, reason: '空命令' };
    // 顺序纪律：破坏性（阻断）规则必须优先于琐碎（跳过）规则求值——
    // 否则 git push --force 会因首词 git 命中琐碎表而被静默放过（CODE-018）
    for (const re of DESTRUCTIVE_PATTERNS) {
      if (re.test(cmd)) return { skip: false, destructive: true, task: cmd.slice(0, 800) };
    }
    const parts = cmd.split(/\s+/);
    const first = parts[0] || '';
    const two = parts.slice(0, 2).join(' ');
    if (TRIVIAL_CMDS.has(first) || TRIVIAL_CMDS.has(two)) return { skip: true, reason: '琐碎命令' };
    if (cmd.length < 8) return { skip: true, reason: '命令过短' };
    return { skip: false, task: cmd.slice(0, 800) };
  }

  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
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

/** 高危坑卡判据：S≥4 且 O≥3 才拦（D 只进报告不参与拦截——防拦截疲劳） */
function isHighRisk(card) {
  const s = card.severity || {};
  return typeof s.S === 'number' && typeof s.O === 'number' && s.S >= 4 && s.O >= 3;
}

/** 从扫描结果中挑高危卡 */
function highRiskCards(scanResult) {
  return (scanResult.matched || []).filter(s => isHighRisk(s.card));
}

module.exports = {
  READONLY_TOOLS, TRIVIAL_CMDS, DESTRUCTIVE_PATTERNS,
  extractTask, isHighRisk, highRiskCards
};
