'use strict';
/**
 * 报告语言提示（面向非中文使用者）：
 * 卡库 125 张均为中文，不假装整份报告已英化；lang='en' 只前置字段对照表，
 * 使英文用户能定位三区与验证器清单。默认 zh 必须与历史输出完全一致（零回归）。
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { scan } = require('../src/scanner');
const { buildReport } = require('../src/report');

const TASK = 'refactor this function and add tests';

function report(lang) {
  const r = scan(TASK, { tier: 'quick', cardsDir: path.join(__dirname, '../../cards') });
  if (lang) r.lang = lang;
  return buildReport(r);
}

test('lang 缺省（zh）：不出现英文对照段，与历史输出一致', () => {
  const out = report();
  assert.ok(out.includes('踩坑报告'), '应含中文标题');
  assert.ok(!out.includes('Read this in English'), 'zh 模式不得出现英文对照段');
});

test('lang=zh：显式指定等同缺省', () => {
  assert.strictEqual(report('zh'), report());
});

test('lang=en：前置英文对照段，说明三区与字段含义', () => {
  const out = report('en');
  assert.ok(out.includes('Read this in English'), 'en 模式应含英文对照段');
  for (const anchor of ['verified', 'unverified', 'blind spot', 'verifier list']) {
    assert.ok(out.includes(anchor), `英文对照段应解释 ${anchor}`);
  }
  // 必须如实声明卡库仍为中文，不得谎称已英化
  assert.ok(out.includes('stay in Chinese'), 'en 模式须声明卡正文仍为中文');
});

test('lang=en：不改变正文结论（卡 ID 与三区仍在）', () => {
  const zh = report();
  const en = report('en');
  assert.ok(en.includes('踩坑报告'), 'en 模式仍保留中文标题');
  assert.ok(en.includes('已查证'), 'en 模式仍输出三区结论');
  // 去掉英文附加段与标题后缀后，两者应逐字节一致（内容零变化）。
  // 注意：英文段前后各有一个空行，需一并折叠，否则会留下连续空行导致假失败。
  const stripEn = (s) => s
    .split('\n')
    .filter((l) => !l.startsWith('> **Read this in English**'))
    .join('\n')
    .replace(' / Pitfall Report', '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  assert.strictEqual(stripEn(en), stripEn(zh), 'en 模式除附加说明外不得改动报告内容');
});

test('CLI --help：给用法，不把 --help 当任务扫描', () => {
  const { execFileSync } = require('child_process');
  const cli = path.join(__dirname, '../src/cli.js');
  const out = execFileSync('node', [cli, '--help'], { encoding: 'utf8' });
  assert.ok(out.includes('USAGE'), '应输出用法说明');
  assert.ok(out.includes('--lang'), '应列出 --lang 选项');
  assert.ok(!out.includes('踩坑报告'), '--help 不得触发扫描');
});
