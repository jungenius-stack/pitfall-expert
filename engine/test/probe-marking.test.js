'use strict';
/**
 * 诊断标记回归（元坑㉔长期解）：防"排障调用污染出勤账本"再次发生。
 * 事故：2026-10-31 排障时直接跑电池文本，4 条诊断记录进了真账本，
 * 当时唯一防线是"调用方记得设 PITFALL_LEDGER=off"。
 * 本组测试只操作临时 HOME。
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SCANNER = path.join(ROOT, 'engine/src/scanner.js');
const CLI = path.join(ROOT, 'engine/src/cli.js');
const WEEKLY = path.join(ROOT, 'tools/weekly-report.mjs');
const TASK = '核对支付接口幂等性 PROBE_MARKER';

function fixture(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-probe-'));
  try { return fn(home); }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
}
function scan(home, source, extra = {}) {
  const code = `const {scan}=require(${JSON.stringify(SCANNER)});console.log(JSON.stringify(scan(process.argv[1],{source:process.argv[2]})));`;
  const p = spawnSync(process.execPath, ['-e', code, TASK, source], {
    encoding: 'utf8',
    env: {...process.env, HOME: home, USERPROFILE: home,
      PITFALL_LEDGER: 'on', PITFALL_LEDGER_TASK: '', ...extra}
  });
  assert.equal(p.status, 0, p.stderr);
  return JSON.parse(p.stdout);
}
const ledger = home => path.join(home, '.pitfall-expert/hits.jsonl');
const rows = home => fs.readFileSync(ledger(home), 'utf8').trimEnd().split('\n').map(l => JSON.parse(l));

test('probe 标记：probe/test/diagnostic 开头的 source 自动加 probe:true', () => fixture(home => {
  for (const src of ['probe', 'probe:battery', 'test', 'test-suite', 'diagnostic']) {
    scan(home, src);
  }
  for (const r of rows(home)) assert.equal(r.probe, true, r.source);
}));

test('probe 标记：正常 source 不加字段，历史行结构不变', () => fixture(home => {
  for (const src of ['cli', 'mcp', 'hook', 'dsh']) scan(home, src);
  for (const r of rows(home)) assert.equal(Object.hasOwn(r, 'probe'), false, r.source);
}));

test('probe 标记：显式开关可强制标记真实入口的探针调用', () => fixture(home => {
  scan(home, 'cli', {PITFALL_LEDGER_PROBE: 'on'});
  assert.equal(rows(home)[0].probe, true);
}));

test('统计排除：cli --stats 不计 probe 记录，并披露排除条数', () => fixture(home => {
  scan(home, 'cli');
  scan(home, 'cli');
  scan(home, 'probe:battery');
  scan(home, 'diagnostic');
  const p = spawnSync(process.execPath, [CLI, '--stats'], {
    encoding: 'utf8',
    env: {...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'off'}
  });
  assert.equal(p.status, 0, p.stderr);
  assert.ok(p.stdout.includes('扫描 2 次'), p.stdout);
  assert.ok(p.stdout.includes('诊断记录 2 条已排除'), p.stdout);
  assert.equal(p.stdout.includes('扫描 4 次'), false);
}));

test('统计排除：weekly-report 排除 probe 并单独报告条数', () => fixture(home => {
  scan(home, 'cli');
  scan(home, 'probe');
  const p = spawnSync(process.execPath, [WEEKLY, '--json'], {
    encoding: 'utf8',
    env: {...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'off'}
  });
  assert.equal(p.status, 0, p.stderr);
  const s = JSON.parse(p.stdout);
  assert.equal(s.scans, 1);
  assert.equal(s.probesExcluded, 1);
}));

test('全为诊断记录时不出假出勤表', () => fixture(home => {
  scan(home, 'probe');
  const p = spawnSync(process.execPath, [CLI, '--stats'], {
    encoding: 'utf8',
    env: {...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'off'}
  });
  assert.equal(p.status, 0, p.stderr);
  assert.ok(p.stdout.includes('没有有效使用记录'), p.stdout);
  assert.ok(p.stdout.includes('诊断记录 1 条已排除'), p.stdout);
  assert.equal(p.stdout.includes('零命中卡'), false);
}));
