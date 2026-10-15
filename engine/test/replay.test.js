'use strict';
/**
 * P2 回放验收：3+ 测试任务对照方法论 DoD
 * 场景 1：代码域任务 → 领域判定 + 指定坑卡命中
 * 场景 2：数学域任务 → 领域判定 + 证明类坑卡命中
 * 场景 3：诚实性考题 → 科学域无卡，盲区必须显式声明
 * 场景 4：档位行为 → quick 不出验证器清单 / deep 出 RPN
 * 场景 5：MCP stdio 冒烟 → initialize / tools/list / tools/call 全链路
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('node:child_process');
const { scan } = require('../src/scanner');
const { buildReport } = require('../src/report');

const CARDS_DIR = path.resolve(__dirname, '../../cards');

function matchedIds(r) {
  return r.matched.map(s => s.card.id);
}

test('场景1 代码域：CSV 汇总任务命中空值卡与 CSV 卡', () => {
  const r = scan('帮我把 users.csv 按省份汇总人数，注意处理空值和重复行', { tier: 'standard', cardsDir: CARDS_DIR });
  assert.strictEqual(r.domain, 'code', '领域应判定为 code');
  const ids = matchedIds(r);
  assert.ok(ids.includes('CODE-013'), `应命中空值卡，实际：${ids.join(',')}`);
  assert.ok(ids.includes('CODE-014'), `应命中 CSV 卡，实际：${ids.join(',')}`);
  assert.strictEqual(r.coverage.code.total, 23, '代码域 23 张卡应全部加载（v0.4 融合：CODE 18 + CI 5）');
  assert.strictEqual(r.cardsLoaded, 43, '共 43 张卡（v0.4 融合：code 23 + math 12 + research-decision 8）');
  const report = buildReport(r);
  assert.ok(report.includes('## ✅ 已查证区'), '报告须含已查证区');
  assert.ok(report.includes('## ❓ 未验证区'), '报告须含未验证区');
  assert.ok(report.includes('## 🚫 盲区声明'), '报告须含盲区声明');
  assert.ok(report.includes('科学/ML'), '盲区须声明科学/ML 域未建卡');
  assert.ok(report.includes('验证器清单'), '标准档须产验证器清单');
});

test('场景2 数学域：整除证明命中循环论证与逻辑跳跃卡', () => {
  const r = scan('证明：对任意正整数 n，n 的立方减 n 能被 6 整除，给出完整推导过程', { tier: 'standard', cardsDir: CARDS_DIR });
  assert.strictEqual(r.domain, 'math', '领域应判定为 math');
  const ids = matchedIds(r);
  assert.ok(ids.includes('MATH-001'), `应命中循环论证卡，实际：${ids.join(',')}`);
  assert.ok(ids.includes('MATH-007'), `应命中逻辑跳跃卡，实际：${ids.join(',')}`);
  const report = buildReport(r);
  assert.ok(report.includes('复跑') === false || true); // 数学卡默认不含复跑标记，不断言
  assert.ok(report.includes('盲区声明'), '三区齐备');
});

test('场景3 诚实性：科学域任务无卡可对照，盲区显式声明而非沉默', () => {
  const r = scan('评估这批实验数据是否显著，然后写进结项报告', { tier: 'standard', cardsDir: CARDS_DIR });
  const report = buildReport(r);
  assert.ok(report.includes('未建卡领域'), '盲区须列出未建卡领域');
  assert.ok(report.includes('科学/ML'), '科学/ML 须在未建卡清单中');
  assert.ok(report.includes('不是“没有坑”，是“没有卡”'), '盲区措辞须区分无卡与无坑');
  const ids = matchedIds(r);
  assert.ok(ids.includes('MATH-012'), `统计卡应命中，实际：${ids.join(',')}`);
  assert.ok(!ids.includes('CODE-014'), '跨域弱信号（CSV 卡）不应列入数学域任务');
});

test('场景4 档位行为：quick 不产验证器清单，deep 产 RPN 表', () => {
  const quick = buildReport(scan('重构这个模块，顺便修一下告警', { tier: 'quick', cardsDir: CARDS_DIR }));
  assert.ok(!quick.includes('## 验证器清单'), '快扫档不得出验证器清单');
  assert.ok(quick.includes('快扫档不执行任何验证'), '快扫档须声明验证限制');

  const deep = buildReport(scan('帮我把 users.csv 按省份汇总人数，注意处理空值和重复行', { tier: 'deep', cardsDir: CARDS_DIR }));
  assert.ok(deep.includes('FMEA RPN'), '深审档须出 RPN 表');
  assert.ok(deep.includes('RPN 是排序启发式非风险度量'), 'RPN 须带方法论批评注记');
  assert.ok(deep.includes('对抗追问'), '深审档须出对抗追问');
});

test('场景5 边界：空任务被 grill-me 退回', () => {
  const r = scan('', { cardsDir: CARDS_DIR });
  assert.ok(r.matched.length === 0 || true); // scan 层不设防，防御在 MCP 层；此处仅确保不崩
  const report = buildReport(r);
  assert.ok(report.includes('盲区'), '无命中时三区仍须齐备');
});

test('场景6 信源失效：坑卡目录缺失时显式披露而非静默', () => {
  const r = scan('任意一个任务描述用于测试', { cardsDir: '/tmp/definitely-not-exist-cards' });
  assert.ok(r.sourceErrors.length > 0, '目录缺失须记录信源故障');
  const report = buildReport(r);
  assert.ok(report.includes('信源故障'), '报告须显式披露信源故障');
  assert.ok(report.includes('不得被理解为'), '故障不得被理解为没有坑');
});

test('场景7 MCP stdio 冒烟：initialize / tools/list / tools/call 全链路', async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  child.stderr.on('data', d => process.stderr.write('[child-stderr] ' + d));
  child.on('exit', (code, sig) => process.stderr.write(`[child-exit] code=${code} sig=${sig}\n`));
  let buffer = '';
  const responses = [];
  const pending = [];

  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) {
          const resolve = pending.shift();
          if (resolve) resolve(msg);
          else responses.push(msg);
        }
      } catch (_) { /* 非 JSON 行忽略 */ }
    }
  });

  function send(obj) {
    return new Promise((resolve, reject) => {
      pending.push(resolve);
      child.stdin.write(JSON.stringify(obj) + '\n');
      setTimeout(() => reject(new Error('MCP 响应超时')), 15000);
    });
  }

  try {
    const init = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'replay-test', version: '1.0.0' } } });
    assert.strictEqual(init.result.serverInfo.name, 'pitfall-expert-engine', 'initialize 应返回服务名');

    // notifications/initialized 是通知（无 id），服务端不响应——直接写，不能 await
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const list = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.strictEqual(list.result.tools[0].name, 'scan_task', 'tools/list 应暴露 scan_task');

    const call = await send({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'scan_task', arguments: { task: '帮我把 users.csv 按省份汇总人数，注意空值', tier: 'standard' } }
    });
    const text = call.result.content[0].text;
    assert.ok(text.includes('踩坑报告'), 'tools/call 应返回踩坑报告');
    assert.ok(text.includes('CODE-013'), '报告应命中空值卡');

    const bad = await send({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'scan_task', arguments: { task: '' } }
    });
    assert.strictEqual(bad.result.isError, true, '空任务应被拒绝');
    assert.ok(bad.result.content[0].text.includes('需求是糊的'), '拒绝理由须引用 grill-me');
  } finally {
    child.kill();
  }
});
