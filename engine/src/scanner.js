'use strict';
/**
 * pitfall-expert scanner — 踩坑扫描引擎核心逻辑
 * 依据 docs/踩坑专家方法论_v0.3.md：
 *   - 第三层 3.0 验证器优先：产出物含可执行验证器清单
 *   - 第六层 6.1 防线2 三区契约：✅已查证 / ❓未验证 / 🚫盲区（含未覆盖范围）
 *   - 第八层 DoD：覆盖率 100%（逐条对照）、扫描范围显式声明
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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
        cards.push(Object.assign({}, c, { _file: f }));
      }
    } catch (e) {
      // 元坑⑧ 信源失效：加载失败必须显式披露，绝不静默跳过
      errors.push({ file: f, error: e.message });
    }
  }
  return { cards, errors, files };
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
 */
function scoreCard(card, taskTokens, taskLower, fieldCache) {
  const ft = fieldCache.get(card.id) || cardFieldTokens(card);
  fieldCache.set(card.id, ft);

  const triggerHits = [];
  for (const t of card.triggers || []) {
    const tl = String(t).toLowerCase();
    if (tl.length >= 2 && taskLower.includes(tl)) triggerHits.push(t);
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

// ---------- 主扫描流程 ----------

function scan(task, opts = {}) {
  const tier = TIERS[opts.tier] ? opts.tier : 'standard';
  const requestedDomain = opts.domain || 'auto';
  const { cards, errors: sourceErrors } = loadCards(opts.cardsDir);

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

  return {
    task,
    tier,
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
    cardsLoaded: cards.length
  };
}

module.exports = { scan, loadCards, tokenize, scoreCard, detectDomain, DOMAINS, TIERS, DEFAULT_CARDS_DIR };
