'use strict';
/** 实验展示层：不接生产，不改召回；折叠不减少原文或输入token。 */
const {buildReport} = require('../engine/src/report');
const MARK = '<!-- family-preview -->';

function buildFamilyPreview(result, cards) {
  if (result.tier !== 'standard') throw Error('本实验仅支持standard，其他档位尚未设计展示');
  const byId = new Map();
  for (const c of cards) {
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(c.id) || byId.has(c.id)) throw Error('卡ID非法或重复');
    byId.set(c.id, c);
  }
  const parents = new Set();
  for (const c of cards) {
    if (c.parent === undefined) continue;
    const p = byId.get(c.parent);
    if (!p || p === c || p.parent !== undefined) throw Error('仅支持父存在、非自指、无链环的一层实验关系');
    parents.add(p.id);
  }
  const ids = result.matched.map(s => s.card.id);
  if (new Set(ids).size !== ids.length) throw Error('命中ID重复');
  for (const s of result.matched) {
    if (byId.get(s.card.id) !== s.card) throw Error('命中卡与实验卡库不对应');
  }
  const baseline = buildReport(result);
  const start = `## ❓ 需要你去查的（${ids.length} 项）`;
  const end = '## 🚫 盲区声明';
  if (baseline.includes(MARK) || baseline.split(start).length !== 2 || baseline.split(end).length !== 2) {
    throw Error('报告分区或实验标记有歧义');
  }
  const a = baseline.indexOf(start) + start.length, b = baseline.indexOf(end);
  if (a >= b) throw Error('报告分区顺序非法');
  const body = baseline.slice(a, b);
  const heads = [...body.matchAll(/^### \[([^\]\r\n]+)\][^\r\n]*\n/gm)];
  if (heads.length !== ids.length || heads.some((h, i) => h[1] !== ids[i])) throw Error('候选正文边界有歧义');
  const matched = new Set(ids);
  let content = '', cursor = 0;
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i], c = byId.get(h[1]);
    const next = heads[i + 1]?.index ?? body.length;
    content += body.slice(cursor, h.index + h[0].length);
    if (c.parent) {
      content += `${MARK} - 所属机制：${c.parent}（实验归属；${matched.has(c.parent) ? '母卡本次也命中' : '母卡本次未命中，不新增候选或检查'}）。\n`;
    } else if (parents.has(c.id)) {
      const children = ids.filter(id => byId.get(id).parent === c.id);
      content += `${MARK} - 机制与场景：${children.length ? '本次同亮子卡 ' + children.join('、') : '本次无场景子卡命中，不拉出未命中子卡'}；归属不是适用性或验证结果。\n`;
      if (children.length) content += `${MARK}<details>\n${MARK}<summary>母卡完整候选正文（可展开）；检查清单始终在下方完整展示</summary>\n${MARK}\n`;
      content += body.slice(h.index + h[0].length, next);
      if (children.length) content += `${MARK}</details>\n`;
      cursor = next;
      continue;
    }
    content += body.slice(h.index + h[0].length, next);
    cursor = next;
  }
  content += body.slice(cursor);
  return {baseline, candidate: baseline.slice(0, a) + content + baseline.slice(b)};
}

module.exports = {buildFamilyPreview};
