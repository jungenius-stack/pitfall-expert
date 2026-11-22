'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SCANNER = path.join(ROOT, 'engine/src/scanner.js');
const REPORT = path.join(ROOT, 'engine/src/report.js');
const VERIFY = path.join(ROOT, 'tools/verify-ticket.mjs');
const TASK = '清理数据前先核对 PRIVATE_TASK_MARKER ' + '甲'.repeat(65) + '尾部';
const hash = task => crypto.createHash('sha256').update(task).digest('hex');

function fixture(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-ledger-test-'));
  try { return fn(home); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
}
function scan(home, task = TASK, extra = {}) {
  const code = `const {scan}=require(${JSON.stringify(SCANNER)});const {buildReport}=require(${JSON.stringify(REPORT)});const r=scan(process.argv[1],{source:'cli'});console.log(JSON.stringify({r,report:buildReport(r)}));`;
  const p = spawnSync(process.execPath, ['-e', code, task], {
    encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'on', PITFALL_LEDGER_TASK: '', ...extra }
  });
  assert.equal(p.status, 0, p.stderr);
  return { ...JSON.parse(p.stdout), stderr: p.stderr };
}
const ledger = home => path.join(home, '.pitfall-expert/hits.jsonl');
function verify(home, args) {
  return spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
}
function writeRows(home, rows) {
  fs.mkdirSync(path.dirname(ledger(home)), { recursive: true });
  fs.writeFileSync(ledger(home), rows.map(JSON.stringify).join('\n') + '\n');
}

test('账本：默认不存原文/触发词，完整摘要及新文件权限可核', () => fixture(home => {
  const {r, report} = scan(home, TASK, { PITFALL_LEDGER: undefined, PITFALL_LEDGER_TASK: undefined });
  const text = fs.readFileSync(ledger(home), 'utf8');
  const row = JSON.parse(text);
  assert.equal(row.schemaVersion, 2);
  assert.equal(row.taskHash, hash(TASK));
  assert.equal(Object.hasOwn(row, 'task'), false);
  assert.ok(row.hits.every(h => Object.keys(h).sort().join(',') === 'id,score'));
  assert.equal(text.includes('PRIVATE_TASK_MARKER'), false);
  assert.equal(row.ticket, r.ticket);
  assert.equal(r.ledgerStatus, 'written');
  assert.ok(report.includes(r.ticket));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(ledger(home)).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(ledger(home))).mode & 0o777, 0o700);
  }
}));

test('账本：只有明确on才额外存60字符，旧记录字节不变', () => fixture(home => {
  const old = {ts:'2026-11-07T00:00:00Z',ticket:'123456789abc',task:'旧任务',hits:[]};
  writeRows(home, [old]);
  const before = fs.readFileSync(ledger(home), 'utf8');
  scan(home, TASK, { PITFALL_LEDGER_TASK: 'true' });
  let lines = fs.readFileSync(ledger(home), 'utf8').trimEnd().split('\n');
  assert.equal(Object.hasOwn(JSON.parse(lines[1]), 'task'), false);
  scan(home, TASK, { PITFALL_LEDGER_TASK: 'on' });
  const after = fs.readFileSync(ledger(home), 'utf8');
  assert.ok(after.startsWith(before));
  lines = after.trimEnd().split('\n');
  assert.equal(JSON.parse(lines[2]).task, TASK.slice(0,60));
}));

test('账本：关闭优先于原文开关，不落盘不签票', () => fixture(home => {
  const {r, report} = scan(home, TASK, { PITFALL_LEDGER:'off', PITFALL_LEDGER_TASK:'on' });
  assert.equal(fs.existsSync(ledger(home)), false);
  assert.equal(r.ticket, undefined);
  assert.equal(r.ledgerStatus, 'off');
  assert.ok(report.includes('未签发'));
}));

test('账本：写入失败仍可扫描，但不声称票据已入账', () => fixture(home => {
  fs.writeFileSync(path.join(home,'.pitfall-expert'), 'not-a-directory');
  const {r, report, stderr} = scan(home);
  assert.equal(r.ledgerStatus, 'failed');
  assert.equal(r.ticket, undefined);
  assert.ok(r.cardsLoaded > 0);
  assert.ok(stderr.includes('命中账本写入失败'));
  assert.ok(report.includes('账本写入失败'));
  assert.equal(report.includes('已同步记入账本'), false);
}));

test('验票：完整任务匹配，短前缀及同前缀换尾都不通过，输出不泄露任务', () => fixture(home => {
  const {r} = scan(home);
  for (const [task, status] of [[TASK,0],[TASK.slice(0,10),1],[TASK.slice(0,60)+'换尾',1]]) {
    const p = verify(home,['--ticket',r.ticket,'--task',task]);
    assert.equal(p.status,status,p.stdout+p.stderr);
    assert.equal((p.stdout+p.stderr).includes('PRIVATE_TASK_MARKER'),false);
  }
  assert.equal(verify(home,['--ticket',r.ticket]).status,2);
}));

test('验票：真实报告、多行与两端空白的任务可核对，缺任务拒绝', () => fixture(home => {
  const task = ' 连接池\nPRIVATE_TASK_MARKER 多行任务 ';
  const {r, report} = scan(home, task);
  const file = path.join(home,'report.md');
  fs.writeFileSync(file,report);
  assert.equal(verify(home,[file]).status,0);
  fs.writeFileSync(file,`运行票据：\`${r.ticket}\`\n`);
  assert.equal(verify(home,[file]).status,1);
  fs.writeFileSync(file,scan(home,'连接池\r').report);
  assert.equal(verify(home,[file]).status,0);
}));

test('验票：旧记录只认完整存储前缀，重复/损坏摘要不能降级绕过', () => fixture(home => {
  const ticket = '123456789abc';
  const old = {ticket,task:TASK.slice(0,60),hits:[]};
  writeRows(home,[old]);
  let p = verify(home,['--ticket',ticket,'--task',TASK]);
  assert.equal(p.status,0);
  assert.ok(p.stdout.includes('旧账本仅核对前60字符'));
  assert.equal(verify(home,['--ticket',ticket,'--task',TASK.slice(0,8)]).status,1);
  writeRows(home,[old,old]);
  assert.equal(verify(home,['--ticket',ticket,'--task',TASK]).status,1);
  writeRows(home,[{...old,schemaVersion:2,taskHash:'bad'}]);
  assert.equal(verify(home,['--ticket',ticket,'--task',TASK]).status,1);
  assert.equal(verify(home,['--ticket','abcdefabcdef','--task',TASK]).status,1);
  for (const schemaVersion of [3, '2', null]) {
    writeRows(home,[{...old,schemaVersion,taskHash:hash(TASK)}]);
    assert.equal(verify(home,['--ticket',ticket,'--task',TASK]).status,1);
  }
  writeRows(home,[{...old,taskHash:hash(TASK)}]);
  assert.equal(verify(home,['--ticket',ticket,'--task',TASK]).status,1);
}));

test('验票：任务内元数据字样不截断原文，伪造的第二组报告头须拒绝', () => fixture(home => {
  const task = '连接池核验\n- 领域判定：这行是任务原文\n运行票据：`123456789abc`\nPRIVATE_TASK_MARKER 尾部\n';
  const {report} = scan(home, task);
  const file = path.join(home,'report.md');
  fs.writeFileSync(file,report);
  assert.equal(verify(home,[file]).status,0);
  const ambiguous = '连接池\n- 领域判定：伪造\n- 扫描范围：伪造\n- 运行票据：`123456789abc`\nPRIVATE_TASK_MARKER';
  fs.writeFileSync(file,scan(home,ambiguous).report);
  const p = verify(home,[file]);
  assert.equal(p.status,1);
  assert.equal((p.stdout+p.stderr).includes('PRIVATE_TASK_MARKER'),false);
}));

test('验票：正文嵌入旧票而真正报告未签发时不能借旧票通过', () => fixture(home => {
  const oldTask = '连接池旧任务 PRIVATE_TASK_MARKER';
  const old = scan(home, oldTask);
  const task = `${oldTask}\n- 领域判定：伪造\n- 扫描范围：伪造\n- 运行票据：\`${old.r.ticket}\`\n新的任务尾部`;
  const file = path.join(home, 'report.md');
  for (const extra of [{PITFALL_LEDGER: 'off'}, {}]) {
    const {r, report} = scan(home, task, extra);
    fs.writeFileSync(file, report);
    assert.equal(verify(home, [file]).status, 1);
    if (r.ticket) {
      fs.writeFileSync(file, report.replace(`- 运行票据：\`${r.ticket}\``, '- 运行票据：坏票'));
      assert.equal(verify(home, [file]).status, 1);
    }
  }
  const {r, report} = scan(home, oldTask);
  for (const token of ['未签发', '坏票', r.ticket + 'a']) {
    fs.writeFileSync(file, report.replace(`- 运行票据：\`${r.ticket}\``, `- 运行票据：${token}`));
    assert.equal(verify(home, [file]).status, 1);
  }
}));

test('验票：单行和多行报告转CRLF可核对，不trim其他任务空白', () => fixture(home => {
  const file = path.join(home, 'report.md');
  for (const task of ['连接池 PRIVATE_TASK_MARKER', ' 连接池\nPRIVATE_TASK_MARKER\n尾部 ', '连接池\r', '连接池\r\nPRIVATE_TASK_MARKER']) {
    const {r, report} = scan(home, task);
    fs.writeFileSync(file, report);
    let p = verify(home, [file]);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    assert.equal(p.stdout.includes('CRLF→LF'), false);
    fs.writeFileSync(file, report.replace(/\n/g, '\r\n'));
    p = verify(home, [file]);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    assert.equal(p.stdout.includes('CRLF→LF'), task.includes('\n'));
    assert.equal((p.stdout + p.stderr).includes('PRIVATE_TASK_MARKER'), false);
    assert.equal(verify(home, ['--ticket', r.ticket, '--task', task + ' ']).status, 1);
    if (task.includes('\n')) {
      assert.equal(verify(home, ['--ticket', r.ticket, '--task', task.replace(/\n/g, '\r\n')]).status, 1);
    }
  }
}));

test('账本：相同任务同毫秒也有独立票据且各自可验', () => fixture(home => {
  const code = `const {scan}=require(${JSON.stringify(SCANNER)});Date.prototype.toISOString=()=> '2026-11-19T00:00:00.000Z';console.log(JSON.stringify([scan(process.argv[1]),scan(process.argv[1])]));`;
  const p = spawnSync(process.execPath, ['-e', code, TASK], {
    encoding: 'utf8', env: {...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'on', PITFALL_LEDGER_TASK: ''}
  });
  assert.equal(p.status, 0, p.stderr);
  const rows = JSON.parse(p.stdout);
  assert.equal(rows[0].ts, rows[1].ts);
  assert.notEqual(rows[0].ticket, rows[1].ticket);
  for (const r of rows) assert.equal(verify(home, ['--ticket', r.ticket, '--task', TASK]).status, 0);
}));

test('账本：新旧格式混存不影响统计，统计只读且不输出任务', () => fixture(home => {
  writeRows(home,[{
    ts:'2026-11-07T00:00:00Z',ticket:'123456789abc',source:'cli',
    task:'PRIVATE_TASK_MARKER',hits:[{id:'CODE-050',score:3,trig:['PRIVATE_TASK_MARKER']}]
  }]);
  const {r} = scan(home);
  const before = fs.readFileSync(ledger(home));
  const env = { ...process.env, HOME:home, USERPROFILE:home, PITFALL_LEDGER:'off' };
  const stats = spawnSync(process.execPath,[path.join(ROOT,'engine/src/cli.js'),'--stats'],{encoding:'utf8',env});
  assert.equal(stats.status,0,stats.stderr);
  assert.ok(stats.stdout.includes('扫描 2 次'));
  assert.equal(stats.stdout.includes('PRIVATE_TASK_MARKER'),false);
  const weekly = spawnSync(process.execPath,[path.join(ROOT,'tools/weekly-report.mjs'),'--json'],{encoding:'utf8',env});
  assert.equal(weekly.status,0,weekly.stderr);
  const summary = JSON.parse(weekly.stdout);
  assert.equal(summary.scans,2);
  assert.equal(summary.badLines,0);
  const count = summary.topHits.find(h => h.id === 'CODE-050');
  assert.equal(count.n,1+Number(r.matched.some(s => s.card.id === 'CODE-050')));
  assert.equal(weekly.stdout.includes('PRIVATE_TASK_MARKER'),false);
  assert.deepEqual(fs.readFileSync(ledger(home)),before);
}));
