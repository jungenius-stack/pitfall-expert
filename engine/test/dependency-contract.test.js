'use strict';
/** 分发清单与支持口径回归；不把本机node_modules当作锁文件安装结果。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('依赖契约：根与engine清单同范围，engine锁根字段一致', () => {
  const pkg = JSON.parse(read('package.json'));
  const engine = JSON.parse(read('engine/package.json'));
  const lock = JSON.parse(read('engine/package-lock.json'));
  assert.deepEqual(pkg.dependencies, engine.dependencies);
  assert.deepEqual(engine.dependencies, lock.packages[''].dependencies);
  assert.deepEqual(engine.engines, lock.packages[''].engines);
  assert.equal(engine.version, lock.version);
  assert.equal(engine.version, lock.packages[''].version);
  assert.equal(lock.packages['node_modules/js-yaml'].version, '5.5.0');
});

test('依赖契约：Node下限与当前三清单及用户说明一致', () => {
  for (const f of ['package.json', 'engine/package.json', 'dsh-plugin/package.json']) {
    assert.equal(JSON.parse(read(f)).engines.node, '>=20', f);
  }
  for (const f of ['README.md', 'README.zh-CN.md', 'install.sh']) {
    assert.ok(read(f).includes('Node ≥20'), f);
    assert.equal(read(f).includes('Node ≥18'), false, f);
  }
  // CI 只钉 Node 20（下限）：扩矩阵需 workflow 写权限，本仓 token 暂无，
  // 强行改会阻塞整个推送；下限已被覆盖，矩阵属可选增强，留给有权限时再补。
  assert.ok(read('.github/workflows/ci.yml').includes('node-version: 20'));
});
