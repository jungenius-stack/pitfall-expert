---
name: 误报——不相干任务命中了卡
about: 没踩坑却被拦 / 报告里出现与任务无关的卡片
labels: false-positive
---

**任务描述**（可脱敏）：

**不该命中的卡**（卡 ID + 为什么不相干）：

**--feedback 输出**（`node engine/src/cli.js "同一任务" --feedback`；默认不含任务原文）：

**卡库/引擎版本**（反馈包头部有）：

**若是门控拦截（hooks / dsh 插件，v0.7.8+）**：
- [ ] 我确认该操作确实安全可执行（拦截理由请见 stderr 的「踩坑专家·阻断」）
- 被拦的命令/写入内容（可脱敏，保留结构）：
- （可选）`node hooks/log-summary.js` 输出中该规则的暴露次数：
