#!/usr/bin/env node
// 验票：核对报告票据和本机账本中的任务摘要，不是防伪签名或验证器执行证明。
// 新记录比对完整任务 SHA-256；旧记录只能精确比对前 60 字符，不修改原账本。
// 用法：node tools/verify-ticket.mjs <引擎报告文件>
//       node tools/verify-ticket.mjs --ticket <票据> --task <完整任务>
// 退出码：0=任务与记录对应 1=无法核对 2=用法错误
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const LEDGER = path.join(HOME, '.pitfall-expert', 'hits.jsonl');
function die(msg) { console.error(msg); process.exit(2); }
function fail(msg) { console.log(`❌ 不通过：${msg}`); process.exit(1); }
function loadLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').flatMap(line => {
    try {
      const row = JSON.parse(line);
      return row && typeof row.ticket === 'string' ? [row] : [];
    } catch { return []; }
  });
}

const args = process.argv.slice(2);
if (!args.length || ['--help', '-h'].includes(args[0])) {
  console.log(`验票工具
用法:
  node tools/verify-ticket.mjs <引擎报告文件>
  node tools/verify-ticket.mjs --ticket <票据> --task "<完整任务>"
新记录核对完整任务摘要；旧记录只核对原有前60字符。输出不回显任务原文。
报告头缺失或有歧义时拒绝；CRLF报告允许披露后的LF规范化回退，不改其他空白。
严格核对任务原字节请用显式票据和完整任务；命令参数可能被 shell/系统留存。
票据是本机匹配痕迹，不是签名；通过不证明卡已读懂、验证器已执行或任务已完成。
退出码: 0=对应 1=无法核对 2=用法错误`);
  process.exit(args.length ? 0 : 2);
}
let ticket, task, normalizedTask;
if (args[0] === '--ticket') {
  if (args.length !== 4 || args[2] !== '--task') die('需提供 --ticket <票据> --task <完整任务>');
  ticket = args[1];
  task = args[3];
} else {
  if (args.length !== 1) die('报告模式只接受一个文件');
  let text;
  try { text = fs.readFileSync(args[0], 'utf8'); }
  catch { die('报告文件不存在或不可读'); }
  // 未签发/坏票头也参与计数，不能跳过真实头后借正文内嵌的旧票通过。
  const headers = [...text.matchAll(/^- 领域判定[：:][^\r\n]*(\r?\n)- 扫描范围[：:][^\r\n]*\r?\n- 运行票据[：:]([^\r\n]*)/gm)];
  if (headers.length !== 1) fail('报告无唯一可核对票据头；可能关闭记录、写入失败或文本有歧义，不能据此判断未运行。');
  const header = headers[0];
  ticket = header[2].match(/^[ \t]*`?([0-9a-f]{12})`?(?=\s|[（(]|$)/)?.[1];
  if (!ticket) fail('报告未签发可核对票据；不能据此判断未运行。');
  const start = text.slice(0, header.index).match(/^- 任务[：:]/m);
  if (start) {
    // 用元数据自身的换行约定移除分隔符，保留原任务末尾的独立CR和其他空白。
    task = text.slice(start.index + start[0].length, header.index);
    if (!task.endsWith(header[1])) fail('任务与报告头分隔格式有歧义。');
    task = task.slice(0, -header[1].length);
    // 文件经编辑器转为CRLF时仅提供显式披露的回退；命令行任务仍严格字节匹配。
    if (header[1] === '\r\n') normalizedTask = task.replace(/\r\n/g, '\n');
  }
}
if (!/^[0-9a-f]{12}$/.test(ticket || '')) die('票据须为12位小写十六进制');
if (typeof task !== 'string' || !task.length) fail('缺少完整任务，不能只凭存在同号票据判通过。');
let rows;
try { rows = loadLedger().filter(row => row.ticket === ticket); }
catch { fail('账本不可读；不回显文件内容。'); }
if (!rows.length) fail('账本无此记录；可能未记录、已清除、抄错或票据不实，不能单独证明未运行。');
if (rows.length !== 1) fail('票据对应多条记录，无法唯一核对。');
const row = rows[0];
if (row.schemaVersion !== undefined && row.schemaVersion !== 1 && row.schemaVersion !== 2) fail('不支持的账本版本。');
if (row.schemaVersion === 2) {
  if (typeof row.taskHash !== 'string' || !/^[0-9a-f]{64}$/.test(row.taskHash)) fail('任务摘要缺失或格式错误。');
  const digest = crypto.createHash('sha256').update(task).digest('hex');
  if (digest !== row.taskHash) {
    if (normalizedTask === undefined || crypto.createHash('sha256').update(normalizedTask).digest('hex') !== row.taskHash) {
      fail('完整任务与账本摘要不符；未输出任一任务原文。');
    }
    console.log('⚠️ 报告经 CRLF→LF 换行规范化后摘要对应，不保证文件中的任务原字节相同；需严格核对请用 --ticket 与 --task。');
  }
  console.log('✅ 完整任务摘要与唯一账本票据对应（SHA-256，无密钥，不是匿名化或防伪签名）。');
} else {
  if (Object.hasOwn(row, 'taskHash')) fail('账本版本与任务摘要字段不符。');
  if (typeof row.task !== 'string' || !row.task.length || row.task !== task.slice(0, 60)) fail('旧账本任务前缀不符或不足；未输出任务原文。');
  console.log('⚠️ 旧账本仅核对前60字符，无法区分同前缀任务，不提供完整任务对应保证。');
}
console.log('✅ 验票通过：只核对上述新/旧记录的任务对应范围，不证明引擎执行未被伪造、验证器执行或结果正确。');
