'use strict';
/** 真selfcheck+临时HOME验证副本门，不同步真实应用、不写真实账本。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'skills/pitfall-expert/scripts/selfcheck.sh');
const SOURCE = path.join(ROOT, 'skills/pitfall-expert/SKILL.md');
const DOUBAO = 'Library/Application Support/Doubao/Profile 1/.doubao/agent_mode/workspace';

function fixture(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-copy-check-'));
  try { return fn(home); }
  finally { fs.rmSync(home, {recursive: true, force: true}); }
}
function check(home) {
  const p = spawnSync('sh', [SCRIPT], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: {...process.env, HOME: home, USERPROFILE: home, PITFALL_LEDGER: 'off', PITFALL_HOOK_LOG: '0'}
  });
  assert.equal(fs.existsSync(path.join(home, '.pitfall-expert/hits.jsonl')), false);
  return p;
}
function target(home, parent) {
  const dir = path.join(home, parent, 'pitfall-expert');
  fs.mkdirSync(dir, {recursive: true});
  return dir;
}

test('副本门：豆包真实.user_skills漂移必须报红，旧.skills同源副本不能掩盖', () => fixture(home => {
  const actual = target(home, path.join(DOUBAO, '.user_skills'));
  const obsolete = target(home, path.join(DOUBAO, '.skills'));
  fs.copyFileSync(SOURCE, path.join(obsolete, 'SKILL.md'));
  fs.writeFileSync(path.join(actual, 'SKILL.md'), 'outdated copy');
  const p = check(home);
  assert.equal(p.status, 1, p.stdout + p.stderr);
  assert.ok(p.stdout.includes(`副本内容漂移：${actual}/SKILL.md`));
  assert.equal(p.stdout.includes('本机无已装副本'), false);
}));

test('副本门：豆包.user_skills同源可通过，已装目录缺SKILL须报红', () => fixture(home => {
  const dir = target(home, path.join(DOUBAO, '.user_skills'));
  fs.copyFileSync(SOURCE, path.join(dir, 'SKILL.md'));
  let p = check(home);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.ok(p.stdout.includes('1 个本机副本 SKILL.md 与仓库源逐字节一致'));
  fs.unlinkSync(path.join(dir, 'SKILL.md'));
  p = check(home);
  assert.equal(p.status, 1, p.stdout + p.stderr);
  assert.ok(p.stdout.includes(`副本缺失：${dir}/SKILL.md`));
}));

test('副本门：selfcheck和同步器的八端路径集一致（不执行同步器）', () => {
  const sync = fs.readFileSync(path.join(ROOT, 'sync-all-agents.sh'), 'utf8');
  const selfcheck = fs.readFileSync(SCRIPT, 'utf8');
  const block = sync.match(/TARGET_SKILL_DIRS="([^\"]+)"/)[1];
  const expected = block.split('\n').map(p => `${p}/pitfall-expert`).sort();
  const loop = selfcheck.match(/for cdir in ([^\n]+); do/)[1];
  const actual = [...loop.matchAll(/"([^\"]+)"/g)].map(m => m[1]).sort();
  assert.equal(expected.length, 8);
  assert.deepEqual(actual, expected);
});
