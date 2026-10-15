# AMiner 配给作战包附件：核心 14 卡触发词（flash 体力活标准输入）

> 来源：`cards/*.yaml` 实时抽取（2026-10-15，v0.5.8）。用途：贴给 GLM5.3-flash 做口语变体扩充——⑯号裁决后这是提高核心卡召回的唯一正道，纯体力活不花 5.3 弹药。变体经人工筛选后按回写流程入卡。

## 配套 flash 提示词（先贴这段，再贴下面的卡）

```text
[任务] 触发词口语变体扩充。下面是 14 张核心坑卡的现有触发词（中英双语）。
为每张卡补 8–12 个缺失的口语变体——开发者/研究者真实会说出口的短语，
中文英文都要，包括：口语缩写（"it builds"、"能跑"）、情绪化表达
（"finally works"、"终于通了"）、工具黑话（"LGTM"、"merge it"、
"p < 0.05"、"train dev split"）。规则：
- 只输出词表：卡 id + 新增变体列表，不要解释
- 与现有触发词重复的不输出
- 变体必须是「任务描述里会出现的短语」，不是概念词
```

## 核心卡现有触发词（每卡一行）

- CODE-002 幻觉式完成：任务收尾、已完成类声明、交付物生成、多步长任务终点、task complete、done statement、delivery claim、finished、ready to ship、任务完成、搞定了
- CODE-025 模型自我报告伪造：自我报告、多agent协作、时间戳声明、自称已检查、self-report、fabricated、provenance、multi-agent、transcript、claimed to have checked、trust but verify
- CODE-004 测试通过≠正确：修复完成声明、测试全绿、CI 通过、回归验证、tests pass、all green、unit test、ci pass、coverage、tests green、all tests、ship it、绿了、全绿
- SCI-001 训练/测试数据泄漏：数据泄漏、训练测试、验证分数、leakage、data leakage、train test split、cross validation、target leakage、overfitting、auc、model training、ml pipeline
- CODE-006 不可逆操作无确认：删除、覆盖写入、force push、重置、资金操作、对外发送、delete、drop、deploy、publish、migration、irreversible
- CODE-026 破坏性操作连带摧毁恢复路径：删库、备份、生产环境、凭据授权、快照、delete database、backup destroyed、production credentials、snapshot、irreversible deletion、rm production
- RD-011 AI 的附和不是认可：你觉得呢、这个方案行吗、靠谱吗、sycophancy、agreeable、validation seeking、yes man、do you think、is this good、confirm my plan
- RD-008 裸「验证通过」：verified、works fine、all clear、trust me、recommendation、验证通过
- CODE-033 幻觉包名被抢注：依赖安装、幻觉包名、装包、slopsquatting、hallucinated package、typosquat、dependency install、npm install、pypi、supply chain
- SEC-003 间接提示注入致命三要素：提示注入、工单、issue、PR、私有仓库、生产凭据、prompt injection、untrusted input、privileged access、exfiltration、issue triage、customer ticket
- MATH-001 循环论证：证明题、恒等式推导、解方程后验根、算法正确性证明、proof、circular reasoning、identity
- MATH-012 统计推断误用：假设检验、A/B 实验、相关性分析、研究报告、数据驱动决策、hypothesis test、p-value、ab test、correlation
- CODE-037 过早多 Agent 化：多agent、编排、multi-agent、orchestration、agent 团队、swarm、子agent、subagent、agent 架构、agent architecture
- CODE-038 上下文逐跳衰减与漂移：多agent协作、长任务、会话过长、context drift、long session、handoff、交接、指令遗忘、multi-agent coordination、long running task
