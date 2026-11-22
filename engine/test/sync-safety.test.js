'use strict';
/** 分发器安全回归：仅新建临时HOME，绝不运行真实副本同步或真实备份轮转。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'sync-all-agents.sh');
function fixture(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-sync-safety-'));
  try {return fn(home);}
  finally {fs.rmSync(home, {recursive: true, force: true});}
}
function run(home, args) {
  const p = spawnSync('sh', [SCRIPT, ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: {PATH: process.env.PATH, HOME: home, USERPROFILE: home, TMPDIR: home,
      PITFALL_LEDGER: 'off', PITFALL_HOOK_LOG: '0', npm_config_offline: 'true', npm_config_userconfig: '/dev/null'}
  });
  assert.equal(fs.existsSync(path.join(home, '.pitfall-expert/hits.jsonl')), false);
  return p;
}
function oldTarget(home) {
  const dir = path.join(home, '.agents/skills/pitfall-expert');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'OLD_PRIVATE_COPY');
  return dir;
}

test('同步检查：超过24份备份不轮转，目标旧副本不改', () => fixture(home => {
  const target = oldTarget(home);
  const backups = path.join(home, '.pitfall-sync-backups');
  fs.mkdirSync(backups);
  for (let i = 0; i < 26; i++) {
    const dir = path.join(backups, String(i).padStart(2, '0'));
    fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'keep.txt'), `BACKUP_${i}`);
  }
  const p = run(home, ['--check']);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.ok(p.stdout.includes('DRIFT(待处理)'));
  assert.equal(fs.readdirSync(backups).length, 26);
  for (let i = 0; i < 26; i++) {
    assert.equal(fs.readFileSync(path.join(backups, String(i).padStart(2, '0'), 'keep.txt'), 'utf8'), `BACKUP_${i}`);
  }
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'OLD_PRIVATE_COPY');
}));

test('同步失败：无法备份时退出非零且不覆盖旧副本', () => fixture(home => {
  const target = oldTarget(home);
  fs.writeFileSync(path.join(home, '.pitfall-sync-backups'), 'NOT_A_DIRECTORY');
  const p = run(home, []);
  assert.equal(p.status, 1, p.stdout + p.stderr);
  assert.ok(p.stderr.includes('留档失败'));
  assert.equal(p.stdout.includes('SYNCED'), false);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'OLD_PRIVATE_COPY');
}));
