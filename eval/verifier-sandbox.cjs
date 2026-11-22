'use strict';
/** 仅供合成快照实验；不连接服务，不是卡库验证器的生产实现或安全认证。 */
const unknown = reason => ({status: 'unknown', reason});
const validTime = n => Number.isFinite(n) && n >= 0;

function checkDeployment(snapshot) {
  if (!snapshot || snapshot.kind !== 'deployment' || !snapshot.version ||
      snapshot.acceptanceReached !== true || snapshot.businessAssertionsPassed === undefined ||
      !validTime(snapshot.observedAt) || !Array.isArray(snapshot.components) ||
      !snapshot.components.length) return unknown('缺版本、验收点、组件或业务观测');
  if (typeof snapshot.businessAssertionsPassed !== 'boolean') return unknown('业务观测格式不符');
  const names = new Set();
  for (const c of snapshot.components) {
    if (!c || typeof c.name !== 'string' || !c.name || names.has(c.name) ||
        typeof c.expected !== 'string' || !c.expected || typeof c.runtime !== 'string' ||
        !c.runtime || c.runtimeObserved !== true) return unknown('目标或运行态缺失、组件重复');
    names.add(c.name);
  }
  // 本实验快照须自带覆盖清单，不能将“拿到的几项”自动当成所有必要组件。
  if (!Array.isArray(snapshot.requiredComponents) || !snapshot.requiredComponents.length ||
      snapshot.requiredComponents.length !== names.size ||
      new Set(snapshot.requiredComponents).size !== names.size ||
      snapshot.requiredComponents.some(name => !names.has(name))) return unknown('组件覆盖不完整');
  if (snapshot.components.some(c => c.runtime !== c.expected)) {
    return {status: 'risk', reason: '运行态违反该组件的声明目标'};
  }
  // 业务失败未给归因材料时，不能一律当成本卡的效果未生效。
  if (!snapshot.businessAssertionsPassed) return unknown('业务断言失败但未提供变更效果归因');
  return {status: 'clear', reason: '仅此版本、组件、验收点和快照范围内未观察到缺口'};
}

function checkCancellation(snapshot) {
  if (!snapshot || snapshot.kind !== 'cancellation' || !snapshot.version ||
      !validTime(snapshot.canceledAt) || !validTime(snapshot.observedAt) ||
      !validTime(snapshot.allowedLag) || snapshot.observedAt < snapshot.canceledAt ||
      snapshot.stopObserved !== true || snapshot.releaseObserved !== true) {
    return unknown('缺版本、时间、允许滞留或独立停止/回收观测');
  }
  for (const value of [snapshot.stoppedAt, snapshot.releasedAt]) {
    if (value !== null && (!validTime(value) || value > snapshot.observedAt)) {
      return unknown('停止/回收时点缺失或晚于采样时点');
    }
  }
  const deadline = snapshot.canceledAt + snapshot.allowedLag;
  if (!Number.isFinite(deadline)) return unknown('时间预算超出数值范围');
  if (snapshot.observedAt < deadline) return unknown('尚未覆盖允许滞留窗口');
  if (snapshot.stoppedAt === null || snapshot.releasedAt === null ||
      snapshot.stoppedAt > deadline || snapshot.releasedAt > deadline) {
    return {status: 'risk', reason: '超时/取消后底层停止或资源回收超出声明滞留'};
  }
  return {status: 'clear', reason: '仅给定版本、模拟窗口内停止和回收均满足目标'};
}

module.exports = {checkDeployment, checkCancellation};
