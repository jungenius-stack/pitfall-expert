# 交接文档 HANDOFF（v0.6.0，2026-10-16）

> 新会话从这里开始。本文是踩坑专家（pitfall-expert）的全部现状、验证方法与已定裁决——**先读本文再动手**，特别是「不可推翻的裁决」一节，防止走回头路。

## 一句话

AI 任务执行前的系统性坑点预检：对照 92 张带出处坑卡（六域全激活，中英双语触发），输出三态诚实报告（✅已查证到/❓没验的/🚫看不见的），每条真坑绑定可执行验证器（判定表前置+执行结果回填）。**完成=披露完整，漏报可原谅，谎报不可原谅。** v0.6 起四个纯模型判断点获得结构性防线（红队+沉思双评审驱动）。

## 当前状态

- 版本 v0.7.3（第七域激活 + 120 卡 + 评测协议 v0.2 + ⑰号门进 CI），独立 git 仓库（`/Users/m1/Downloads/踩坑专家项目/`）
- 测试 15/15（引擎）· 自检 30 项 · dsh 8/8 · hook 双模式 · 全绿
- 卡库 **92 张六域全激活**：code 44 / math 12 / research-decision 18 / agent-security 7 / science 6 / creative 5（战略域占位）
- 证据等级：empirical 占比过半，关键批次已做 arXiv 出处核验（docs/出处核验记录-判断可靠性批次.md）
- 已发布就绪：install.sh、CI workflow、双语 README（v0.7 已清除全部写死卡数）、零安装入门版（docs/入门版-贴即用.md）——**GitHub 建仓未做**（用户指示先不建）
- 评审存档：docs/红队评审-v1.md（同源局外人）+ docs/沉思评审-v1.md（GLM-4.6 异源）+ docs/判断层硬化-v0.1.md（六裁决记录）

## 目录导览

```
cards/*.yaml            坑卡库单一真源（77 张，schema 见下）
skills/pitfall-expert/   技能包（SKILL.md 主流程 L0–L5 + M1–M13 + references/ 七件 + scripts/）
  references/tier-triggers.md  L0 升档触发器 9 类显式清单（v0.6 新）
  references/capability.md     领域能力边界表（v0.6 自 SKILL.md 移出）
engine/                  MCP 扫描引擎 + CLI（scanner.js 评分匹配 / report.js 三区报告 / gate-core.cjs 门控）
hooks/                   PreToolUse 门控（默认 report，block 模式拦破坏命令）+ UserPromptSubmit
dsh-plugin/              DeepSeek Harness 适配（8 测试，未真机验证）
docs/                    方法论 v0.3 + 设计文档 + 案例库 + 自举回放 + 红队评审 + 判断层硬化 + 核心卡评审存档
docs/reference/          AMiner DeepDive 报告 81KB（第 2/5 章未挖尽）
install.sh               一键安装/卸载（技能+卡库副本 → 各外壳目录）
.github/workflows/ci.yml 推上 GitHub 即生效（测试+卡校验+selfcheck+hook 冒烟）
```

## 验证命令（改任何东西后必跑）

```bash
cd engine && npm test                          # 15 场景（MCP stdio 全链路）
sh skills/pitfall-expert/scripts/selfcheck.sh  # 结构+双语冒烟+DoD 机检自测
node engine/src/cli.js "任意任务" --tier standard  # 手动扫一个看效果
```

## ⚠ 不可推翻的裁决（都是踩过坑换来的）

1. **匹配必须纯准，禁止任何重要性加权**（元坑⑯）：core 加权机制试验一天即全量回滚——副作用是跨域门槛暗降、域判定扭曲、分数语义污染。分数只回答「这任务和这卡多相关」。想让重要卡先被看见，唯一正道是**补触发词口语变体**（tests green/全绿/ship it 这类）；
2. **T0 摩擦必须轻**（元坑①②复发教训）：快扫档免机检/免回写/紧凑三行表——流程再胖用户就绕开它；
3. **卡数不写死**：任何文档里「N 张」以 `cards/` 目录实数为准（写死数字已三次变谎言）；
4. **资源缺失显式声明**：SKILL.md 引用的文件读不到就声明降级，禁止凭记忆构造卡内容；
5. **禁虚构引擎报告**：没有真实工具输出一律视为引擎不可用；
6. **测完再提交**：本会话曾先 commit 后看测试挂了 1 个（顺序失误，已修正）；
7. **判断层六裁决（2026-10-16 用户确认）**：①纸老虎留桶但判狼须可查证据+摘免死金牌 ②三区强制出现保留、空区依据必须本次具体 ③预验尸与假设倾倒维持两路不并 ④规则三层去重但不并层 ⑤主文件瘦身但资源缺失兜底节保留 ⑥大象补监控者三问、答不出并入 🐯（不删档）。

## 卡格式（四件套硬标准）

`cards/<domain>.yaml`，12 必填字段：id/title/description/symptom/severity{S,O,D}/evidence{source,level}/fix/**verifier**/confidence/pass_k_relevant/triggers（**强制中英双语**）+ 可选扩展（hazard_type/latent_condition/source_ref）。evidence.level：empirical > case > consensus > opinion。详见 `skills/pitfall-expert/references/card-format.md`。校验：引擎 loadCards 一票准入。

## 已知边界 / 下一步候选

1. **P2 评测实施是最高优先级**（协议已到 v0.2：docs/评测协议-v0.2.md，骨架已落地 eval/）：红队+沉思三条结构弱点的共同根治全指向它；哨兵卡/反作弊样本/三臂+A0 对照测完，四项裁决（语义匹配/100%义务/机检语义层/档位摩擦）才有数据。**2026-10-18 进展**：①协议 v0.2 把「手工出 40 题」改为「从公开基准借任务+借人类标注」（出题人≠标注人纪律）；②`eval/sources.md` 语料台账已建，5 条 URL 实测可达（AgentRewardBench/GAIA/FastChat 均 HTTP 200，ResearchRubrics 与 No Free Labels 经 arXiv 标题验真），许可证仍待查；③`eval/gate.js` 把第⑰号门自动化并接了 CI。**下一步**：逐条核许可证 → 借入任务 → 造 3 张哨兵卡 → 三臂+A0 首跑
2. **卡内容正文中文**（triggers 已双语）——英文化等国际用户信号；
3. **匹配已到触发词词形变体**（字段层归一因跨域噪音回滚，元坑⑰）；语义匹配的判定表就位，等评测数据触发；
4. **dsh 插件仅 mock 测试**，未真机；
5. **真实用户零**：所有验证都是自举/外部考题/文献——最缺真实任务回写；hooks 写入侧拦截（弱点二完全解）未做；
6. 战略/决策域占位；「AI 战略建议正面偏差」待一手研究源；RD-018 源论文未定位（已声明）；SEC-007 待 OWASP 一手核实；
7. 元坑登记簿现 **17 条**（`references/meta-pitfalls.md`）——方法论自身的翻车记录，新会话继续写。
8. **外部认证路线第四步（2026-10-25 已完成，当日闭环）——CodeQL SAST 接入**：起手 Scorecard 5.5/10、SAST=0；终态 **6.1/10、SAST=10**（"SAST tool detected: CodeQL"），CodeQL 首跑绿。经过：本地起草 codeql.yml（codeql-action v4.39.1 SHA 固定）→ 推送被令牌 scope 墙拒（钥匙串 OAuth 令牌无 workflow 权限，实测报文入卡候选 CODE-041）→ 用户网页直建（f8c5c7f，与本地逐字节一致）→ 本地重组纯文档提交对齐（be851f5）。**量纲教训**：实测 +6 分（百分制）而非预估 +9~+11——SAST 有效权重低于 Critical 档假设，单点反推的权重模型误差要给宽区间。遗留：dependabot 3 个 PR 待合并（合并时验证 CODE-042 注释漂移）；分支保护 2 分钟可选项未做；CI-Tests=-1 待首个 PR 合并自然恢复。
9. **分数冲刺可行集与远期路线（2026-10-25 扫描，报告 docs/踩坑报告-分数冲刺-2026-10-25.md）**：基线 6.1/10。今日集（用户网页操作卡已给，预期 6.6~7.3 区间、复扫为准）：分支保护三勾（不勾 Require PR，保单人直推）+ 合并 3 个 dependabot PR（CI 已验全绿；每单先 Approve 再 Squash merge，攒 Code-Review 首个 approved changeset）。**明确不做**（裁决+理由）：License 换 OSI 文本（法律决策换 ~0.03 分）、Fuzzing/OSS-Fuzz（投入产出不成比例）、SECURITY.md 深挖（Low 权重上限 +0.2，缺项不明）；**自愈项**：Maintained 2027-01 前后过 90 天线。**远期三项**：① npm 发布进 CI + OIDC 受信发布（Packaging -1→10，RELEASING.md 五步流程是底子）；② GitHub Release + 签名产物（Signed-Releases）；③ CII badge 自证申请（30-60 分钟表格）。

## 七轮采集方法论（已验证有效，可复用）

搜「结果+情绪词」不搜概念（"AI deleted my database" 而非 "AI 风险"）；GitHub issue 找证据链、Reddit/HN 找现场、事故博客找根因；**入卡前过 M3/M4 信源分级**；同坑多报=一张卡+高 O 值不新增卡。每轮产量约 2–4 新卡。信源速查：claude-code#92732（自我报告伪造）、codex#28224（遥测 640TB）、UpGuard 六案、USENIX slopsquatting、Science 2026 谄媚（DOI:10.1126/science.aec8352）。
