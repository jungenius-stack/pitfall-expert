'use strict';
/**
 * pitfall-expert scanner — 踩坑扫描引擎核心逻辑
 * 依据 docs/踩坑专家方法论_v0.3.md：
 *   - 第三层 3.0 验证器优先：产出物含可执行验证器清单
 *   - 第六层 6.1 防线2 三区契约：✅已查证 / ❓未验证 / 🚫盲区（含未覆盖范围）
 *   - 第八层 DoD：覆盖率 100%（逐条对照）、扫描范围显式声明
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

const DEFAULT_CARDS_DIR = path.resolve(__dirname, '../../cards');

const REQUIRED_FIELDS = [
  'id', 'domain', 'title', 'description', 'symptom', 'severity',
  'evidence', 'fix', 'verifier', 'confidence', 'pass_k_relevant', 'triggers'
];
const EVIDENCE_LEVELS = new Set(['empirical', 'case', 'consensus', 'opinion']);
const CONFIDENCE_LEVELS = new Set(['backed_by_context', 'needs_verification', 'assumption']);

/** 全领域登记表（领域能力分级表）：已建卡 + 未建卡领域都在这里登记，未建卡 = 盲区必须显式声明 */
const DOMAINS = {
  code: '代码',
  math: '数学',
  science: '科学/ML',
  creative: '创意/写作',
  'research-decision': '调研/决策',
  strategy: '战略',
  'agent-security': 'Agent 安全',
  decision: '决策/战略',
  meta: '元任务'
};

const TIERS = {
  quick: { label: '⚡ 快扫', verify: false },
  standard: { label: '🛡️ 标准', verify: true },
  deep: { label: '🔬 深审', verify: true }
};

// ---------- 坑卡加载与校验 ----------

function loadCards(cardsDir) {
  const dir = cardsDir || DEFAULT_CARDS_DIR;
  const cards = [];
  const errors = [];
  const versions = {};
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
    if (files.length === 0) errors.push({ file: '(directory)', error: `坑卡目录无 yaml 文件：${dir}` });
  } catch (e) {
    return { cards, errors: [{ file: '(directory)', error: `无法读取坑卡目录 ${dir}：${e.message}` }], files };
  }
  for (const f of files) {
    try {
      const doc = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!doc || !Array.isArray(doc.cards)) throw new Error('文档缺少 cards 数组');
      if (doc.version !== undefined) versions[f] = String(doc.version); // 供 --feedback 反馈包标注卡库版本
      const fileDomain = doc.domain; // 文件级 domain 下发给缺省卡
      for (const c of doc.cards) {
        if (!c.domain && fileDomain) c.domain = fileDomain;
        const missing = REQUIRED_FIELDS.filter(k => c[k] === undefined || c[k] === null);
        if (missing.length) throw new Error(`${c.id || '(无id)'} 缺字段: ${missing.join(', ')}`);
        if (!EVIDENCE_LEVELS.has(c.evidence.level)) throw new Error(`${c.id} evidence.level 非法: ${c.evidence.level}`);
        if (!CONFIDENCE_LEVELS.has(c.confidence)) throw new Error(`${c.id} confidence 非法: ${c.confidence}`);
        if (!c.severity || !['S', 'O', 'D'].every(k => typeof c.severity[k] === 'number')) {
          throw new Error(`${c.id} severity 须含数字 S/O/D`);
        }
        if (!Array.isArray(c.triggers) || c.triggers.length < 1) throw new Error(`${c.id} triggers 须为非空数组`);
        // 拦截规则（v0.7.8+）：可选项，但一旦存在必须结构合法——坏规则进卡库 = 门禁行为不可预期
        if (c.intercept !== undefined) {
          if (!Array.isArray(c.intercept) || c.intercept.length < 1) throw new Error(`${c.id} intercept 须为非空数组`);
          for (const g of c.intercept) {
            if (!g || typeof g !== 'object') throw new Error(`${c.id} intercept 组须为对象`);
            if (!['hard', 'soft'].includes(g.tier)) throw new Error(`${c.id} intercept.tier 须为 hard|soft`);
            if (!Array.isArray(g.patterns) || g.patterns.length < 1 || !g.patterns.every(p => typeof p === 'string' && p.length > 0)) {
              throw new Error(`${c.id} intercept.patterns 须为非空字符串数组（JS 正则）`);
            }
            if (g.tools !== undefined && (!Array.isArray(g.tools) || !g.tools.every(t => typeof t === 'string'))) {
              throw new Error(`${c.id} intercept.tools 须为字符串数组（Bash|Write）`);
            }
          }
        }
        cards.push(Object.assign({}, c, { _file: f }));
      }
    } catch (e) {
      // 元坑⑧ 信源失效：加载失败必须显式披露，绝不静默跳过
      errors.push({ file: f, error: e.message });
    }
  }
  return { cards, errors, files, versions };
}

// ---------- 分词与匹配 ----------

function tokenize(text) {
  const tokens = new Set();
  if (!text) return tokens;
  const lower = String(text).toLowerCase();
  const ascii = lower.match(/[a-z0-9][a-z0-9_.^+-]*/g) || [];
  for (const w of ascii) if (w.length >= 2) tokens.add(w);
  const cjkRuns = lower.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
  }
  return tokens;
}

/**
 * 单词触发词的词形变体（v0.7.0；v0.7.1 补对称方向）：只兜子串匹配覆盖不了的单复数——
 * 复数触发词 vs 单数文本（tests→test），以及辅音+y 结尾单数触发词 vs -ies 复数文本
 * （dependency→dependencies；y↔ies 互不为子串，v0.7.0 只做了 ies→y 一向，
 * 卡库 20 个 y 结尾触发词全部漏配复数文本）。其余单复数（test/tests、match/matches）
 * 单数本就是复数的子串，无需变体。
 * 多词短语保持原子串匹配（变体只作用于最后一个词会改错对象，不做）。
 * 注意：词形归一曾试入 tokenize（字段 token 精确匹配层），实测通用词（agent）
 * 字段命中扩散导致跨域噪音上升，判定表不通过，当日回滚——见元坑⑰。
 * 触发词层保留：触发词是人工筛过的具体短语，误命中面远小于字段 token；
 * 本层任何变体扩展仍须过判定表「跨域误命中不增」前置门。
 */
function triggerVariants(tl) {
  const vs = [tl];
  if (tl.includes(' ')) return vs;
  if (/ies$/.test(tl) && tl.length >= 5) vs.push(tl.slice(0, -3) + 'y');
  else if (/(ses|xes|zes|ches|shes)$/.test(tl) && tl.length >= 5) vs.push(tl.slice(0, -2));
  else if (/s$/.test(tl) && !/(ss|us|is)$/.test(tl) && tl.length >= 4) vs.push(tl.slice(0, -1));
  else if (/[^aeiou]y$/.test(tl) && tl.length >= 4) vs.push(tl.slice(0, -1) + 'ies');
  return vs;
}

const CARD_TEXT_FIELDS = ['title', 'description', 'symptom', 'fix'];

function cardFieldTokens(card) {
  const map = {};
  for (const f of CARD_TEXT_FIELDS) map[f] = tokenize(card[f]);
  map.triggers = tokenize((card.triggers || []).join(' '));
  return map;
}

/**
 * 评分 = 3 × 触发词字面命中数 + 命中的字段数（封顶 5）
 * 字段计数法（而非原始 token 计数）降低常用词噪声：
 * 任务 token 出现在坑卡的 title/description/symptom/fix/triggers 哪几个字段里，数几个。
 * 注：不做任何重要性加权（元坑⑯，2026-10-15 试验 core 加权一天后回滚）——
 * 分数只回答「这任务和这卡多相关」，预检系统的价值在准确，不在注意力排序。
 */
function scoreCard(card, taskTokens, taskLower, fieldCache) {
  const ft = fieldCache.get(card.id) || cardFieldTokens(card);
  fieldCache.set(card.id, ft);

  const triggerHits = [];
  for (const t of card.triggers || []) {
    const tl = String(t).toLowerCase();
    if (tl.length >= 2 && triggerVariants(tl).some(v => taskLower.includes(v))) triggerHits.push(t);
  }

  let fieldsMatched = 0;
  const matchedFields = [];
  const sampleTokens = new Set();
  for (const f of [...CARD_TEXT_FIELDS, 'triggers']) {
    let hit = false;
    for (const tok of taskTokens) {
      if (ft[f].has(tok)) { hit = true; if (sampleTokens.size < 8) sampleTokens.add(tok); }
    }
    if (hit) { fieldsMatched++; matchedFields.push(f); }
  }

  return {
    score: triggerHits.length * 3 + Math.min(fieldsMatched, 5),
    triggerHits,
    matchedFields,
    sampleTokens: [...sampleTokens]
  };
}

const MATCH_THRESHOLD = 2;        // ≥2 分计入命中（1 次触发词命中，或 2 个字段重合）
const CROSS_DOMAIN_MIN = 4;       // 跨域弱信号门槛：低于此分数的跨域卡不列入，仅在脚注计数

function detectDomain(scored) {
  const perDomain = {};
  for (const s of scored) {
    const d = s.card.domain;
    if (!perDomain[d]) perDomain[d] = { top: 0, sum: 0 };
    perDomain[d].top = Math.max(perDomain[d].top, s.m.score);
    perDomain[d].sum += s.m.score;
  }
  const ranked = Object.entries(perDomain)
    .map(([d, v]) => ({ domain: d, top: v.top, sum: v.sum }))
    .sort((a, b) => b.top - a.top || b.sum - a.sum);
  if (ranked.length === 0 || ranked[0].top === 0) {
    return { domain: null, confidence: '无法判定', basis: '无任何领域命中信号' };
  }
  const best = ranked[0];
  const second = ranked[1];
  let confidence;
  if (best.top >= 6 && (!second || second.top < best.top / 2)) confidence = '高';
  else if (best.top >= 3) confidence = '中';
  else confidence = '低';
  const basis = `最高分卡 ${best.top} 分${second ? `，次高领域 ${DOMAINS[second.domain] || second.domain} ${second.top} 分` : ''}`;
  return { domain: best.domain, confidence, basis };
}

// ---------- 命中账本（黑匣子）：每次扫描追加一行，供周期性分拣 ----------
// 目的：让每张卡知道自己被命中过几次（出勤表）——零命中卡→查触发词/退役评审；
// 高频命中+人工补记"救命"笔迹→主力卡。分拣规则见 docs（2026-11-02 装配）。
// 隐私：只写本机 ~/.pitfall-expert/hits.jsonl（append-only），不联网上传，任务原文只存前 60 字
// 摘要（M1 最小化采集——任务文本可能含密钥/路径，不入账本）。
// 关闭：环境变量 PITFALL_LEDGER=off（引擎测试套件默认携带，防测试数据污染真实账本）。
// 失败披露：写账本失败仅向 stderr 披露一行，不影响扫描结果本身（不得静默，也不得反噬主流程）。
function makeTicket(result) {
  const basis = [
    result.ts || '',
    result.tier,
    result.domain || '',
    String(result.task || '').slice(0, 60),
    (result.matched || []).map(s => s.card.id).join(','),
    result.cardsLoaded
  ].join('|');
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 12);
}

function appendLedger(result) {
  try {
    if (process.env.PITFALL_LEDGER === 'off') return;
    const dir = path.join(os.homedir(), '.pitfall-expert');
    fs.mkdirSync(dir, { recursive: true });
    const entry = {
      ts: result.ts || new Date().toISOString(),
      ticket: result.ticket,
      source: result.source,
      tier: result.tier,
      domain: result.domain,
      task: String(result.task || '').slice(0, 60),
      hits: (result.matched || []).map(s => ({ id: s.card.id, score: s.m.score, trig: s.m.triggerHits }))
    };
    fs.appendFileSync(path.join(dir, 'hits.jsonl'), JSON.stringify(entry) + '\n');
  } catch (e) {
    process.stderr.write(`命中账本写入失败（不影响扫描结果）：${e.message}\n`);
  }
}

// ---------- 主扫描流程 ----------

function scan(task, opts = {}) {
  const tier = TIERS[opts.tier] ? opts.tier : 'standard';
  const requestedDomain = opts.domain || 'auto';
  const { cards, errors: sourceErrors, versions: cardVersions } = loadCards(opts.cardsDir);

  const taskTokens = tokenize(task);
  const taskLower = task.toLowerCase();
  const fieldCache = new Map();
  const scored = cards.map(card => ({ card, m: scoreCard(card, taskTokens, taskLower, fieldCache) }));

  // 领域判定
  let detected, domainConfidence, domainBasis;
  if (requestedDomain !== 'auto' && DOMAINS[requestedDomain]) {
    detected = requestedDomain;
    domainConfidence = '用户指定';
    domainBasis = '调用方显式指定，未经自动判定';
  } else {
    const d = detectDomain(scored);
    detected = d.domain;
    domainConfidence = d.confidence;
    domainBasis = d.basis;
  }

  // 候选集：自动判定时取判定领域 + 跨域强信号（≥CROSS_DOMAIN_MIN）；
  // 指定领域时取该领域 + 跨域强信号。跨域弱信号只计数不列入（宁漏报不错报）。
  let candidates = scored;
  let crossDomainWeakCount = 0;
  const effectiveDomain = (requestedDomain !== 'auto' && DOMAINS[requestedDomain])
    ? requestedDomain
    : detected;
  if (effectiveDomain) {
    candidates = scored.filter(s =>
      s.card.domain === effectiveDomain || s.m.score >= CROSS_DOMAIN_MIN);
    crossDomainWeakCount = scored.filter(s =>
      s.card.domain !== effectiveDomain && s.m.score > 0 && s.m.score < CROSS_DOMAIN_MIN).length;
  }

  const matched = candidates
    .filter(s => s.m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.m.score - a.m.score);

  // 覆盖率（DoD 第 2 条：逐条对照，可数可查）
  const coverage = {};
  for (const s of scored) {
    const d = s.card.domain;
    if (!coverage[d]) coverage[d] = { total: 0, matched: 0 };
    coverage[d].total++;
  }
  for (const s of matched) coverage[s.card.domain].matched++;

  const loadedDomains = new Set(cards.map(c => c.domain));
  const unbuiltDomains = Object.keys(DOMAINS).filter(d => !loadedDomains.has(d));

  // 三区划分
  const verified = matched.filter(s => s.card.confidence === 'backed_by_context');
  const unverified = matched.filter(s => s.card.confidence !== 'backed_by_context');

  const result = {
    ts: new Date().toISOString(),
    task,
    tier,
    source: opts.source || 'unknown',
    requestedDomain,
    domain: detected,
    domainConfidence,
    domainBasis,
    coverage,
    unbuiltDomains,
    sourceErrors,
    crossDomainWeakCount,
    matched,
    verified,
    unverified,
    cardVersions,
    cardsLoaded: cards.length
  };
  // 运行票据：把「这次真跑了引擎」变成可验证的事实，而不是模型的一句自称。
  // 票据 = 时间 + 任务 + 命中卡集 + 卡库版本 的短哈希。模型无法凭空编出与任务匹配的票据；
  // 报告里票据对不上账本记录 = 没跑却声称跑了（谎报），可 machine-check。
  // 账本关闭时不发票据：票据的唯一价值是可核对，账本关了就核对不了，
  // 发一张不可验证的票比不发更糟（会让「有票」失去意义）。
  if (process.env.PITFALL_LEDGER !== 'off') {
    result.ticket = makeTicket(result);
  }
  appendLedger(result);
  return result;
}

module.exports = { scan, loadCards, tokenize, scoreCard, detectDomain, triggerVariants, DOMAINS, TIERS, DEFAULT_CARDS_DIR };
