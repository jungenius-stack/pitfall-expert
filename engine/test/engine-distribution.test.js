'use strict';
/**
 * 引擎分发回归：防"技能副本没引擎，模型全盘 find 到旧副本跑出过期报告"复发。
 * 2026-11-22 实测事故：WorkBuddy 副本无 engine/，模型 find 到 ~/Downloads/pitfall
 * （2026-10-20 旧副本、120 卡），用户看到的是旧版结果却以为是当前版本。
 * 本测试只读同步脚本与暂存产物，不执行真实同步、不写真实 HOME。
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');

test('引擎分发：sync 脚本带精简引擎且装完即测，不靠复制成功', () => {
  const s = fs.readFileSync(path.join(ROOT, 'sync-all-agents.sh'), 'utf8');
  assert.ok(s.includes('engine/src'), '必须复制 engine/src');
  assert.ok(s.includes('js-yaml'), '必须带 js-yaml');
  assert.ok(s.includes('精简引擎自检失败') || s.includes('读取不出卡库'), '装完必须实测能否读卡库');
  // 不带 28M 的 MCP SDK
  assert.equal(s.includes('cp -R "$REPO_ROOT/engine/node_modules"'), false, '不得整包复制 node_modules');
  assert.ok(s.includes('未含 MCP SDK'), '必须声明未含 MCP SDK');
});

test('引擎分发：install.sh 同步具备引擎装配与失败降级', () => {
  const s = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  assert.ok(s.includes('install_engine'), 'install.sh 须有引擎装配函数');
  assert.ok(s.includes('engine/node_modules/js-yaml'), '须带 js-yaml');
  assert.ok(s.includes('技能仍可用'), '引擎失败须降级为技能可用，不阻塞安装');
});

test('引擎分发：SKILL.md 规定副本优先且禁止全盘搜索', () => {
  const s = fs.readFileSync(path.join(ROOT, 'skills/pitfall-expert/SKILL.md'), 'utf8');
  assert.ok(s.includes('<本技能目录>/engine/src/cli.js'), '须声明技能副本自带引擎为首选路径');
  assert.ok(s.includes('禁止全盘搜索引擎'), '须显式禁止全盘 find');
  assert.ok(s.includes('旧副本'), '须记录旧副本事故作为理由');
});

test('引擎分发：备份不包含引擎副本（避免每端 2M 膨胀）', () => {
  const s = fs.readFileSync(path.join(ROOT, 'sync-all-agents.sh'), 'utf8');
  assert.ok(s.includes('rm -rf "$bdir/$NAME/engine"'), '备份后须剔除引擎副本');
});

test('引擎分发：副本引擎可独立读到全部卡库', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-engine-dist-'));
  try {
    // 用仓库真实 engine/src + 真源 cards 模拟副本结构，验证这条依赖链无需 MCP SDK
    const cli = path.join(ROOT, 'engine/src/cli.js');
    const p = spawnSync(process.execPath, [cli, '核对接口幂等性', '--tier', 'quick'], {
      encoding: 'utf8', timeout: 60000,
      env: {...process.env, PITFALL_LEDGER: 'off', PITFALL_HOOK_LOG: '0', TMPDIR: dir}
    });
    assert.equal(p.status, 0, p.stderr);
    assert.ok(p.stdout.includes('踩坑报告'));
    assert.ok(p.stdout.includes('125'), '须加载 124 张卡');
    assert.equal(fs.existsSync(path.join(dir, '.pitfall-expert/hits.jsonl')), false);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
