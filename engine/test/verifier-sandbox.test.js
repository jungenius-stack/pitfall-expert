'use strict';
/** 合成快照已知真值回归；不代表真实服务、LLM行为或人类依从率评测。 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {checkDeployment, checkCancellation} = require('../../eval/verifier-sandbox.cjs');

const deployment = () => ({
  kind: 'deployment', version: 'fixture-v1', acceptanceReached: true, observedAt: 100,
  businessAssertionsPassed: true, requiredComponents: ['authoritative', 'cache'],
  components: [
    {name: 'authoritative', expected: 'role-a-new', runtime: 'role-a-new', runtimeObserved: true},
    {name: 'cache', expected: 'role-b-new', runtime: 'role-b-new', runtimeObserved: true}
  ]
});
const cancellation = () => ({
  kind: 'cancellation', version: 'fixture-v1', canceledAt: 100, observedAt: 120,
  allowedLag: 10, stoppedAt: 105, releasedAt: 107, stopObserved: true, releaseObserved: true,
  explicitTimeout: false
});

const cases = [
  {id: 'V01', check: checkDeployment, make: deployment, expected: 'clear', why: '角色目标不同但分别正确'},
  {id: 'V02', check: checkDeployment, make() {const s = deployment(); for (const c of s.components) c.runtime = 'same-wrong'; return s;}, expected: 'risk', why: '全部一致却全体同错'},
  {id: 'V03', check: checkDeployment, make() {const s = deployment(); s.components[1].runtimeObserved = false; return s;}, expected: 'unknown', why: '只有配置、缺运行态观测'},
  {id: 'V04', check: checkCancellation, make: cancellation, expected: 'clear', why: '未局部填timeout但实际停止/回收满足声明预算'},
  {id: 'V05', check: checkCancellation, make() {return {...cancellation(), explicitTimeout: true, stoppedAt: null, releasedAt: null};}, expected: 'risk', why: '显式timeout齐全但窗口后仍未停止/回收'},
  {id: 'V06', check: checkCancellation, make() {return {...cancellation(), releaseObserved: false};}, expected: 'unknown', why: '只知调用返回、缺资源回收观测'}
];

function readAndCheck(file, check) {
  try { return check(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return {status: 'unknown', reason: '快照不存在、不可读或解析失败'}; }
}

for (const c of cases) {
  test(`${c.id} ${c.why} ⇒ ${c.expected}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-verifier-'));
    try {
      const file = path.join(dir, 'snapshot.json');
      fs.writeFileSync(file, JSON.stringify(c.make()));
      assert.equal(readAndCheck(file, c.check).status, c.expected);
    } finally {fs.rmSync(dir, {recursive: true, force: true});}
  });
}

test('验证器：窗口未到、覆盖漏项、非法观测不能放行或强判事故', () => {
  assert.equal(checkDeployment({...deployment(), acceptanceReached: false}).status, 'unknown');
  const partial = deployment(); partial.components.pop();
  assert.equal(checkDeployment(partial).status, 'unknown');
  assert.equal(checkDeployment({...deployment(), businessAssertionsPassed: false}).status, 'unknown');
  assert.equal(checkCancellation({...cancellation(), observedAt: 105, stoppedAt: 102, releasedAt: 104}).status, 'unknown');
  assert.equal(checkCancellation({...cancellation(), releasedAt: 999}).status, 'unknown');
  assert.equal(checkCancellation({...cancellation(), stoppedAt: undefined}).status, 'unknown');
  assert.equal(checkCancellation({...cancellation(), releasedAt: 112}).status, 'risk');
});

test('验证器：缺环境/坏JSON均未判定；替换路径提高可执行性，不代表用户参与有益', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-verifier-path-'));
  try {
    const actual = path.join(dir, 'actual.json'), wrong = path.join(dir, 'fixed-template.json');
    fs.writeFileSync(actual, JSON.stringify(cases[1].make()));
    const before = fs.readFileSync(actual);
    assert.equal(readAndCheck(wrong, checkDeployment).status, 'unknown');
    assert.equal(readAndCheck(actual, checkDeployment).status, 'risk');
    assert.deepEqual(fs.readFileSync(actual), before, '检查只读，不改观测材料');
    const broken = path.join(dir, 'broken.json');fs.writeFileSync(broken, '{bad');
    assert.equal(readAndCheck(broken, checkDeployment).status, 'unknown');
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('反向校准：两种故意写坏的旧捷径必须被已知真值考题击穿', () => {
  const sameMeansSafe = s => s.components.every(c => c.runtime === s.components[0].runtime) ? 'clear' : 'risk';
  const timeoutMeansSafe = s => s.explicitTimeout ? 'clear' : 'risk';
  assert.notEqual(sameMeansSafe(cases[0].make()), cases[0].expected, '异构角色正常却被误报');
  assert.notEqual(sameMeansSafe(cases[1].make()), cases[1].expected, '全体同错被漏报');
  assert.notEqual(timeoutMeansSafe(cases[3].make()), cases[3].expected, '正确继承期限被误报');
  assert.notEqual(timeoutMeansSafe(cases[4].make()), cases[4].expected, '有参数但不回收被漏报');
});

test('澄清考题：12题/三类各4题，题面无答案字段；仅结构检查，不打模型成绩', () => {
  const tasks = require('../../eval/clarification-tasks.json');
  const key = require('../../eval/clarification-key.json');
  assert.equal(tasks.tasks.length, 12);
  assert.equal(key.answers.length, 12);
  assert.equal(new Set(tasks.tasks.map(t => t.id)).size, 12);
  assert.deepEqual(tasks.tasks.map(t => t.id).sort(), key.answers.map(a => a.id).sort());
  for (const category of key.categories) assert.equal(key.answers.filter(a => a.category === category).length, 4);
  for (const task of tasks.tasks) {
    assert.deepEqual(Object.keys(task).sort(), ['context', 'id', 'task']);
    assert.ok(task.task && task.context);
  }
  assert.equal(tasks.version, key.version);
  assert.ok(key.status.includes('human annotation pending'));
  assert.ok(key.answers.find(a => a.id === 'Q07').acceptedAlternative);
  assert.ok(tasks.tasks.find(t => t.id === 'Q08').context.includes("require('../src/sum.js')"));
});

test('复杂澄清题：六题与冻结判据对应，不强制唯一动作标签', () => {
  const tasks = require('../../eval/clarification-hard-tasks.json');
  const key = require('../../eval/clarification-hard-key.json');
  assert.equal(tasks.tasks.length, 6);
  assert.equal(key.answers.length, 6);
  assert.equal(new Set(tasks.tasks.map(t => t.id)).size, 6);
  assert.deepEqual(tasks.tasks.map(t => t.id), key.answers.map(a => a.id));
  assert.ok(tasks.instruction.includes('JSON 数组'));
  for (const task of tasks.tasks) {
    assert.deepEqual(Object.keys(task).sort(), ['context', 'id', 'task']);
    assert.ok(task.context.excerpts.every(e => e.path && e.text));
  }
  for (const answer of key.answers) {
    assert.ok(answer.acceptableActions.length > 1);
    assert.ok(answer.criticalError.length > 0);
    assert.ok(answer.requiredEvidence.essential.length > 0);
    assert.ok(answer.requiredEvidence.supplementary.length > 0);
  }
});
