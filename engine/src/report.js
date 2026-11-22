'use strict';
/**
 * pitfall-expert report — 三区契约报告生成
 * 依据 docs/踩坑专家方法论_v0.3.md 第六层：三区任何一区不允许空着不写。
 */

const { DOMAINS, TIERS } = require('./scanner');

const CONFIDENCE_LABEL = {
  backed_by_context: '卡库标为"有依据"（不是本次任务已验证）',
  needs_verification: '卡库标为"待核"',
  assumption: '卡库标为"假设"'
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
  lines.push(`- 卡库原始来源（本次未核读）：${c.evidence.source}`);
  lines.push(`- 这条来源有多硬：${LEVEL_LABEL[c.evidence.level] || c.evidence.level}（只说明卡库怎么记的，不代表这次任务查过了）`);
  if (c.endorsement) {
    // 历史背书混有未核归因与“亲读”自称；只展示可追溯链接，不将旧叙述当本次查证。
    const urls = [...new Set(String(c.endorsement).match(/https?:\/\/[^\s<>"\u3000-\u303f\u4e00-\u9fff—]+/g) || [])];
    lines.push(`- 补充出处线索（本次未核读，相关性待核）：${urls.length ? urls.join('；') : '卡库有补充背书记录，但未提取到可追溯网址'}；不据此认可整卡主张`);
  }
  lines.push(`- 规避动作：${c.fix}`);
  lines.push(`- 卡库把握程度：${CONFIDENCE_LABEL[c.confidence] || c.confidence}`);
  lines.push('- 这次查了没有：❓ 没有。只是任务描述里出现了相关词，还没做任何检查，所以不能判断你的任务会不会踩这个坑');
  const reasons = [];
  if (s.m.triggerHits.length) reasons.push(`触发词命中：${s.m.triggerHits.join('、')}`);
  if (s.m.matchedFields.length) {
    reasons.push(`字段重合：${s.m.matchedFields.join('/')}${s.m.sampleTokens.length ? `（${s.m.sampleTokens.slice(0, 5).join('、')}）` : ''}`);
  }
  lines.push(`- 命中依据：${reasons.join('；') || '领域默认对照'}`);
  if (c.pass_k_relevant) lines.push('- ⚠️ 要重复跑几次：这类坑一次通过不算数，至少跑 3 次看结果是否稳定');
  return lines.join('\n');
}

function buildReport(r) {
  const L = [];
  const tierInfo = TIERS[r.tier];
  const en = r.lang === 'en';
  // 报告仅消费词面召回，不信任旧版 verified 分组或调用方自行塞入的“已验证”数组。
  const matched = r.matched;

  L.push(`# 踩坑报告 · ${tierInfo.label}${en ? ' / Pitfall Report' : ''}`);
  if (en) {
    // 卡正文仍为中文；英文对照必须同时说明证据标签与任务验证的区别。
    L.push('');
    L.push('> **Read this in English**: the card library (125 cards) is originally written in Chinese, so card bodies below stay in Chinese. Structure — `✅ 已查证区` = **verified for this task** (empty: this engine does not execute verifiers); `❓ 未验证区` = **unverified candidates**, including cards labeled backed_by_context; `🚫 盲区` = **declared blind spots**; `验证器清单` = **verifier list** (proposed checks, not executed here). Source links and evidence labels are library metadata, not sources inspected during this scan or proof that a pitfall applies. Field labels: 任务=task, 领域判定=domain routing, 扫描范围=cards scanned, 症状信号=symptom, 规避动作=mitigation, 卡库置信度=library confidence, 命中依据=why matched.');
  }
  L.push('');
  L.push(`- 任务：${r.task}`);
  L.push(`- 领域判定：${r.domain ? (DOMAINS[r.domain] || r.domain) : '没判出来'}（把握：${r.domainConfidence}${r.domainBasis ? '；' + r.domainBasis : ''}）`);
  L.push(`- 扫描范围：已加载 ${r.cardsLoaded} 张坑卡，逐条对照率 100%（${coverageLine(r.coverage)}）`);  if (!r.ticket) L.push(`- 运行票据：**未签发**（${r.ledgerStatus === 'failed' ? '账本写入失败' : '账本关闭或无可核对记录'}，本次无账本凭据可核；不等于引擎未运行）`);
  if (r.ticket) L.push(`- 运行票据：\`${r.ticket}\`（${r.ts ? r.ts.slice(0, 19).replace('T', ' ') + ' UTC' : ''}｜本机运行记录，已同步记入账本；不是防伪签名，不证明验证器已执行；引用时须原样抄写）`);
  L.push('- 扫描方式：从本地卡库按任务描述筛出可能相关的条目（词面匹配，不做语义推理，也不跑检查）');
  if (r.sourceErrors.length) {
    L.push(`- ⚠️ 卡库读取出问题：${r.sourceErrors.map(e => `${e.file}（${e.error}）`).join('；')} —— 这些文件没读出来，不算进下面的统计`);
    L.push('- 注意：这不等于"没有坑"，而是"有卡但没读出来"，没读到的卡这次完全没参与对照');
  }
  L.push(`- 用哪种扫法：${tierInfo.label} —— ${r.tier === 'quick' ? '只快速过一遍，不做任何检查，所有可疑项都列在 ❓ 区' : '给报告 + 待办检查清单（检查由你或调用方执行，本引擎不代跑）'}；需要更细请升档`);
  L.push('');

  // ✅ 区只留给当前任务的实际核验；此扫描接口不执行或接收验证结果。
  // ✅ 区改版（2026-11-23）：原来固定写「已查证区（0 项）」，用户读完只知道"引擎没验过"，
  // 看不出工具到底干了什么，容易觉得"这技能不好用"。
  // 现在改为陈述本次扫描确实完成的工作（可核对的事实），并紧跟边界：
  // 确认的是"筛选过程"，不是"你的任务安全"。两条不能混——11-16 复盘的核心教训。
  L.push('## ✅ 这次扫描确认了什么');
  L.push('');
  const scannedDomains = Object.keys(r.coverage).length;
  L.push(`- 逐条比对 **${r.cardsLoaded} 张**坑卡，覆盖 ${scannedDomains} 个领域，逐条对照率 100%`);
  L.push(`- 从库里筛出 **${matched.length} 条**与本次任务相关的候选${matched.length === 0 ? '（本次没有匹配到）' : ''}`);
  if (matched.length > 0) {
    const listed = matched.slice(0, 5).map(s => s.card.id).join('、');
    L.push(`  主要命中：${listed}${matched.length > 5 ? ` 等 ${matched.length} 条` : ''}`);
  }
  L.push(`- 领域判定：${r.domain ? (DOMAINS[r.domain] || r.domain) : '未能判定'}（把握：${r.domainConfidence}）`);
  if (r.ticket) L.push(`- 运行票据：\`${r.ticket}\`（可核对本次确实执行，不是模型自称）`);
  L.push('');
  L.push('> ⚠️ 以上确认的是**"这次扫描做了什么"**（扫了多少、筛出哪些、跑了没有），**不是"你的任务安全"**。');
  L.push('> 卡库里的出处和标签，也不代表这次任务已经查过。你的任务有没有坑，看下面 ❓ 区。');
  L.push('');

  L.push(`## ❓ 需要你去查的（${matched.length} 项）`);
  L.push('');
  if (matched.length === 0) {
    L.push('（本次没有候选——任务描述里没有和任何卡对得上的词。但这不等于任务没有风险：可能是卡库没覆盖，也可能是说法不同没匹配上。）');
  } else {
    if (r.tier !== 'quick') {
      L.push('下面这些是**你或调用方要执行**的检查。做了就记下原始结果，没做就保持 ❓——别凭这份报告直接放行。');
      L.push('');
    }
    for (const s of matched) L.push(cardEntry(s), '');
  }
  if (r.tier === 'quick') {
    L.push(`- 档位限制：⚡快扫档不执行任何验证，本次 ${matched.length} 项候选均未验证；需要检查办法请升标准/深审档。`);
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
  L.push(`- 信源边界：本次仅对照本地坑卡库（${r.cardsLoaded} 张），未检索任何外部实时信源；原始来源和补充出处均未在本次核读，类型、相关性和时效须另核`);
  if (r.crossDomainWeakCount > 0) {
    L.push(`- 跨域弱信号：另有 ${r.crossDomainWeakCount} 张非指定领域坑卡有低分重合，低于跨域门槛未列入（宁漏报不错报）`);
  }
  if (r.domainConfidence === '低' || r.domainConfidence === '无法判定') {
    L.push(`- 领域没把握（${r.domainConfidence === '低' ? '低' : '判不出来'}）：建议指定领域后重扫一次，免得拿错领域的卡来对照`);
  }
  L.push('');

  // 验证器清单（标准/深审档）：只列待执行动作，不伪造完成状态。
  if (tierInfo.verify) {
    L.push('## 验证器清单（待执行；本引擎未运行这些检查）');
    L.push('');
    if (matched.length === 0) {
      L.push('（无命中坑卡，验证器清单为空）');
    } else {
      matched.forEach((s, i) => {
        L.push(`${i + 1}. [${s.card.id}] ${s.card.verifier}${s.card.pass_k_relevant ? '（需复跑 ≥3 次看一致性）' : ''}`);
      });
      L.push('');
      L.push('注意：以上是卡库提供的检查办法，不保证已验证其有效性。调用方须在授权与资源边界内执行，记录结果后再判断本任务成立、范围内未观察到或未判定；本接口不会自动把结果回填为 ✅。');
    }
    L.push('');
  }

  // 深审档：FMEA RPN + Tiger 三分类 + 对抗追问
  if (r.tier === 'deep') {
    L.push('## 🔬 深审附加：先查哪条的排序（只是排序建议，不是风险评分）');
    L.push('');
    const rows = matched
      .map(s => ({ id: s.card.id, title: s.card.title, rpn: s.card.severity.S * s.card.severity.O * s.card.severity.D, s: s.card.severity }))
      .sort((a, b) => b.rpn - a.rpn);
    if (rows.length === 0) {
      L.push('（这次没有匹配到坑卡）');
    } else {
      L.push('下面是"先查哪条"的建议顺序，按卡库里记的三个维度算出来：出事有多严重、发生可能性、发现难度。它不代表你的任务已经核实过什么，也不是放行或阻断的结论。');
      L.push('| 坑卡 | 严重度 | 可能性 | 难发现 | 排序分 | 建议（待核） |');
      L.push('|---|---|---|---|---|---|');
      for (const row of rows) {
        const tiger = row.rpn >= 60 ? '🐯 建议先查' : row.rpn >= 20 ? '🐘 值得看一眼' : '可能用不上（没核过，别据此忽略）';
        L.push(`| ${row.id} ${row.title} | ${row.s.S} | ${row.s.O} | ${row.s.D} | ${row.rpn} | ${tiger} |`);
      }
      L.push('');
      L.push('再追问一句：');
      for (const s of matched.slice(0, 3)) {
        L.push(`- 如果「${s.card.title}」真的发生了，当前方案里哪一层防御会失效？这一层预设过自己的失效模式吗？`);
      }
    }
    L.push('');
  }

  L.push('---');
  L.push('披露状态：上面三个区都写了，但"格式写全"不等于"事实查过、检查跑过、事情能放行"。事后发现漏了坑，请回来补卡（错题本长期开放）。');
  L.push('踩坑专家方法论 v0.3 ｜ pitfall-expert-engine');
  return L.join('\n');
}

/**
 * 反馈包（--feedback，M1 最小化采集）：默认不含任务原文，附原文须显式 --with-task。
 * 卡库置信度与本任务状态分列；反馈包同样不能用卡的证据标签冒充实测结果。
 */
function buildFeedback(r, opts = {}) {
  const pkg = require('../package.json');
  const L = [];
  L.push('## pitfall-expert 反馈包（--feedback 生成，分享前须审查）');
  L.push('');
  L.push(`- 引擎版本：pitfall-expert-engine ${pkg.version}`);
  const libVersions = Object.entries(r.cardVersions || {})
    .map(([f, v]) => `${f.replace(/\.ya?ml$/, '')} ${v}`).join(' · ');
  L.push(`- 卡库版本：${libVersions || '未知'}（共 ${r.cardsLoaded} 张）`);
  L.push(`- 档位：${r.tier}；域判定：${r.domain || '未能判定'}（${r.domainConfidence}）`);
  L.push(`- 读卡库出错：${r.sourceErrors.length ? r.sourceErrors.map(e => `${e.file}：${e.error}`).join('；') : '无'}`);
  L.push('- 说明：下面这些只是"任务描述里出现了相关词"，没做任何检查；卡库怎么标的不等于这次任务查过了。');
  L.push('');
  if (r.matched.length) {
    L.push('| 命中卡 | 分 | 命中依据 | 卡库把握程度 | 本任务状态 |');
    L.push('|---|---|---|---|---|');
    for (const s of r.matched) {
      const basis = [
        s.m.triggerHits.length ? `触发词：${s.m.triggerHits.join('、')}` : '',
        s.m.matchedFields.length ? `字段：${s.m.matchedFields.join('/')}` : ''
      ].filter(Boolean).join('；') || '领域默认';
      L.push(`| ${s.card.id} | ${s.m.score} | ${basis} | ${CONFIDENCE_LABEL[s.card.confidence] || s.card.confidence} | ❓ 未验证 |`);
    }
  } else {
    L.push('命中卡：无（matched=0）——若实际踩了坑，这是漏报样本，请选「漏报」模板提交');
  }
  L.push('');
  L.push(opts.withTask
    ? `- 任务原文：${r.task}`
    : '- 任务原文：未包含（不保证匿名；如需附原文请加 --with-task，分享前自查敏感信息）');
  return L.join('\n');
}

module.exports = { buildReport, buildFeedback };
