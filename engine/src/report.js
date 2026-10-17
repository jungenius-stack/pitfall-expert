'use strict';
/**
 * pitfall-expert report — 三区契约报告生成
 * 依据 docs/踩坑专家方法论_v0.3.md 第六层：三区任何一区不允许空着不写。
 */

const { DOMAINS, TIERS } = require('./scanner');

const CONFIDENCE_LABEL = {
  backed_by_context: 'backed_by_context（有上下文/检索证据支撑）',
  needs_verification: 'needs_verification（怀疑但未验证）',
  assumption: 'assumption（假设，未经任何检验）'
};

const LEVEL_LABEL = {
  empirical: '实证',
  case: '案例',
  consensus: '共识',
  opinion: '观点'
};

function coverageLine(coverage) {
  return Object.entries(coverage)
    .map(([d, v]) => `${DOMAINS[d] || d} ${v.matched}/${v.total}`)
    .join('，');
}

function cardEntry(s) {
  const c = s.card;
  const lines = [];
  lines.push(`### [${c.id}] ${c.title}`);
  lines.push(`- 症状信号：${c.symptom}`);
  lines.push(`- 证据：${c.evidence.source}（${LEVEL_LABEL[c.evidence.level] || c.evidence.level}）`);
  lines.push(`- 规避动作：${c.fix}`);
  lines.push(`- 置信度：${CONFIDENCE_LABEL[c.confidence] || c.confidence}`);
  const reasons = [];
  if (s.m.triggerHits.length) reasons.push(`触发词命中：${s.m.triggerHits.join('、')}`);
  if (s.m.matchedFields.length) {
    reasons.push(`字段重合：${s.m.matchedFields.join('/')}${s.m.sampleTokens.length ? `（${s.m.sampleTokens.slice(0, 5).join('、')}）` : ''}`);
  }
  lines.push(`- 命中依据：${reasons.join('；') || '领域默认对照'}`);
  if (c.pass_k_relevant) lines.push('- ⚠️ 复跑相关：本坑需 pass^k 一致性验证（方法论 3.7），单次通过不构成放行依据');
  return lines.join('\n');
}

function buildReport(r) {
  const L = [];
  const tierInfo = TIERS[r.tier];

  L.push(`# 踩坑报告 · ${tierInfo.label}`);
  L.push('');
  L.push(`- 任务：${r.task}`);
  L.push(`- 领域判定：${r.domain ? (DOMAINS[r.domain] || r.domain) : '未能判定'}（置信度：${r.domainConfidence}${r.domainBasis ? '；' + r.domainBasis : ''}）`);
  L.push(`- 扫描范围：已加载 ${r.cardsLoaded} 张坑卡，逐条对照率 100%（${coverageLine(r.coverage)}）`);
  if (r.sourceErrors.length) {
    L.push(`- ⚠️ 信源故障：${r.sourceErrors.map(e => `${e.file}（${e.error}）`).join('；')} —— 按元坑⑧显式披露，故障文件不计入覆盖率`);
    L.push('- 注意：信源故障不得被理解为“没有坑”——是“有卡但没读出来”，未加载的坑卡本次零对照');
  }
  L.push(`- 档位说明：${tierInfo.label} —— ${r.tier === 'quick' ? '只出报告不验证，未验证项全部降级 ❓ 区' : '报告 + 验证器清单（验证器由调用方执行，本引擎不代为执行）'}；越档需求请升档（方法论 6.4）`);
  L.push('');

  // ✅ 已查证区
  L.push(`## ✅ 已查证区（${r.verified.length} 项）`);
  L.push('');
  if (r.verified.length === 0) {
    L.push('（本区为空——未命中任何 backed_by_context 级坑卡，这不代表没有坑，只代表已知坑卡库中无高置信匹配）');
  } else {
    for (const s of r.verified) L.push(cardEntry(s), '');
  }

  // ❓ 未验证区
  L.push(`## ❓ 未验证区（${r.unverified.length + (r.tier === 'quick' ? r.verified.length : 0)} 项）`);
  L.push('');
  if (r.unverified.length === 0 && r.tier !== 'quick') {
    L.push('（本区为空——所有命中坑卡均为 backed_by_context 级）');
  } else {
    for (const s of r.unverified) {
      const c = s.card;
      L.push(`- [${c.id}] ${c.title} —— 原因：${CONFIDENCE_LABEL[c.confidence] || c.confidence}；需补动作：${c.verifier}`);
    }
    if (r.tier === 'quick') {
      L.push(`- 档位限制：⚡快扫档不执行任何验证，上述 ${r.verified.length} 项已查证坑的验证器均未运行，按方法论 6.4 不算已验证`);
    }
  }
  L.push('');

  // 🚫 盲区声明
  L.push('## 🚫 盲区声明');
  L.push('');
  if (r.unbuiltDomains.length) {
    L.push(`- 未建卡领域：${r.unbuiltDomains.map(d => DOMAINS[d]).join('、')} —— 这些领域当前无坑卡可对照，本次扫描对其零覆盖（不是“没有坑”，是“没有卡”）`);
  } else {
    L.push('- 未建卡领域：无（全部领域已有坑卡）');
  }
  L.push('- 未知的未知：坑卡是对已知坑的采样，unknown unknowns 原则上无法被清单捕捉（方法论定位公理 1）');
  L.push(`- 信源边界：本次仅对照本地坑卡库（${r.cardsLoaded} 张），未检索任何外部实时信源；竞品类结论的时效以卡片更新日为准`);
  if (r.crossDomainWeakCount > 0) {
    L.push(`- 跨域弱信号：另有 ${r.crossDomainWeakCount} 张非指定领域坑卡有低分重合，低于跨域门槛未列入（宁漏报不错报）`);
  }
  if (r.domainConfidence === '低' || r.domainConfidence === '无法判定') {
    L.push(`- 领域判定置信度${r.domainConfidence === '低' ? '低' : '缺失'}：建议显式指定 domain 参数后重扫，避免按错误领域的坑卡清单承诺`);
  }
  L.push('');

  // 验证器清单（标准/深审档）
  if (tierInfo.verify) {
    L.push('## 验证器清单（方法论 3.0 验证器优先：预踩坑的产出物以此计量）');
    L.push('');
    const all = [...r.verified, ...r.unverified];
    if (all.length === 0) {
      L.push('（无命中坑卡，验证器清单为空）');
    } else {
      all.forEach((s, i) => {
        L.push(`${i + 1}. [${s.card.id}] ${s.card.verifier}${s.card.pass_k_relevant ? '（需复跑 ≥3 次看一致性）' : ''}`);
      });
      L.push('');
      L.push('注意：以上验证器由调用方（agent/人）执行，本引擎只铸造不执行——执行结果回写后才能进 ✅ 区。');
    }
    L.push('');
  }

  // 深审档：FMEA RPN + Tiger 三分类 + 对抗追问
  if (r.tier === 'deep') {
    L.push('## 🔬 深审附加：FMEA RPN 排序（方法论 2.5，RPN 是排序启发式非风险度量）');
    L.push('');
    const rows = [...r.verified, ...r.unverified]
      .map(s => ({ id: s.card.id, title: s.card.title, rpn: s.card.severity.S * s.card.severity.O * s.card.severity.D, s: s.card.severity }))
      .sort((a, b) => b.rpn - a.rpn);
    if (rows.length === 0) {
      L.push('（无命中坑卡）');
    } else {
      L.push('| 坑卡 | S | O | D | RPN | 分类 |');
      L.push('|---|---|---|---|---|---|');
      for (const row of rows) {
        const tiger = row.rpn >= 60 ? '🐯 立刻杀' : row.rpn >= 20 ? '🐘 进监控区' : '纸老虎（识别后不浪费防御资源）';
        L.push(`| ${row.id} ${row.title} | ${row.s.S} | ${row.s.O} | ${row.s.D} | ${row.rpn} | ${tiger} |`);
      }
      L.push('');
      L.push('对抗追问（红队，方法论 2.7）：');
      for (const s of [...r.verified, ...r.unverified].slice(0, 3)) {
        L.push(`- 如果「${s.card.title}」真的发生了，当前方案里哪一层防御会失效？这一层预设过自己的失效模式吗？`);
      }
    }
    L.push('');
  }

  L.push('---');
  L.push('完成标准（方法论第八层 DoD）：完成 = 披露完整，非结果完美。本报告三区齐备即视为流程合格；事后发现漏坑请回写坑卡库（元坑登记簿持续开放）。');
  L.push('踩坑专家方法论 v0.3 ｜ pitfall-expert-engine');
  return L.join('\n');
}

/**
 * 反馈包（--feedback，M1 最小化采集）：默认不含任务原文，只含聚合值（卡 ID/分数/版本/域判定），
 * 用户自查后贴进 GitHub 误报/漏报 issue 模板；附原文须显式 --with-task。
 */
function buildFeedback(r, opts = {}) {
  const pkg = require('../package.json');
  const L = [];
  L.push('## pitfall-expert 反馈包（--feedback 生成，可直接贴进误报/漏报 issue）');
  L.push('');
  L.push(`- 引擎版本：pitfall-expert-engine ${pkg.version}`);
  const libVersions = Object.entries(r.cardVersions || {})
    .map(([f, v]) => `${f.replace(/\.ya?ml$/, '')} ${v}`).join(' · ');
  L.push(`- 卡库版本：${libVersions || '未知'}（共 ${r.cardsLoaded} 张）`);
  L.push(`- 档位：${r.tier}；域判定：${r.domain || '未能判定'}（${r.domainConfidence}）`);
  L.push(`- 信源故障：${r.sourceErrors.length ? r.sourceErrors.map(e => `${e.file}：${e.error}`).join('；') : '无'}`);
  L.push('');
  if (r.matched.length) {
    L.push('| 命中卡 | 分 | 命中依据 | 区 |');
    L.push('|---|---|---|---|');
    for (const s of r.matched) {
      const basis = [
        s.m.triggerHits.length ? `触发词：${s.m.triggerHits.join('、')}` : '',
        s.m.matchedFields.length ? `字段：${s.m.matchedFields.join('/')}` : ''
      ].filter(Boolean).join('；') || '领域默认';
      L.push(`| ${s.card.id} | ${s.m.score} | ${basis} | ${s.card.confidence === 'backed_by_context' ? '✅' : '❓'} |`);
    }
  } else {
    L.push('命中卡：无（matched=0）——若实际踩了坑，这是漏报样本，请选「漏报」模板提交');
  }
  L.push('');
  L.push(opts.withTask
    ? `- 任务原文：${r.task}`
    : '- 任务原文：未包含（默认脱敏；如需附原文请加 --with-task，提交前自查敏感信息）');
  return L.join('\n');
}

module.exports = { buildReport, buildFeedback };
