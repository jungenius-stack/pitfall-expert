'use strict';
/** 全为合成夹具：parent只用于本实验，不代表正式卡库已裁定关系。 */
const cards = [
  {
    id: 'FX-MOTHER', domain: 'code', title: '重试放大机制（合成）',
    description: '失败后的重试可能消耗额外资源。', symptom: '观察到重试工作量上升，原因待核。',
    severity: {S: 6, O: 4, D: 7},
    evidence: {source: '合成机制示例，无外部事故证据', level: 'opinion'},
    fix: '共同行动：确认端到端预算；母卡行动：核多层尝试链。',
    verifier: '母卡检查：区分逻辑操作与每层尝试，核累计资源成本和端到端预算；缺观测则未判定。',
    confidence: 'assumption', pass_k_relevant: false, triggers: ['familymechanism']
  },
  {
    id: 'FX-CHILD', parent: 'FX-MOTHER', domain: 'code', title: '支付SDK重试场景（合成）',
    description: '支付SDK重复尝试可能增加费用或业务副作用。', symptom: '尝试次数变化，业务结果待核。',
    severity: {S: 8, O: 3, D: 8},
    evidence: {source: '合成场景示例，无真实支付记录', level: 'opinion'},
    fix: '共同行动：确认端到端预算；子卡行动：核幂等键、重复扣款与回滚边界。',
    verifier: '子卡检查：核同一逻辑支付的幂等键、重复扣款证据及补偿路径；未经授权不发真实支付请求，缺记录则未判定。',
    confidence: 'assumption', pass_k_relevant: false, triggers: ['familyscenario']
  }
];
const cases = [
  {id: 'mother-only', label: '仅母命中', task: 'familymechanism', expected: ['FX-MOTHER']},
  {id: 'child-only', label: '仅子命中', task: 'familyscenario', expected: ['FX-CHILD']},
  {id: 'both', label: '母子同亮', task: 'familymechanism familyscenario', expected: ['FX-MOTHER', 'FX-CHILD']}
];
module.exports = {cards, cases};
