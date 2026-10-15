# 交接文档 HANDOFF（v0.5.8，2026-10-15）

> 新会话从这里开始。本文是踩坑专家（pitfall-expert）的全部现状、验证方法与已定裁决——**先读本文再动手**，特别是「不可推翻的裁决」一节，防止走回头路。

## 一句话

AI 任务执行前的系统性坑点预检：对照 77 张带出处坑卡（五域，中英双语触发），输出三态诚实报告（✅验证过的/❓没验的/🚫看不见的），每条真坑绑定可执行验证器。**完成=披露完整，漏报可原谅，谎报不可原谅。**

## 当前状态

- 版本 v0.5.8，24 commits，独立 git 仓库（`/Users/m1/Downloads/踩坑专家项目/`），工作区干净
- 测试 15/15（引擎）· 自检 30 项 · dsh 8/8 · hook 双模式 · 全绿
- 卡库 **77 张五域全激活**：code 43 / math 12 / research-decision 11 / agent-security 6 / science 5
- 证据等级：empirical 5 张（USENIX/Science 2026/PMC/Anthropic/MAST 系）、A 级官方 issue 4 张、三源交叉 4 张，全部带出处可追溯
- 已发布就绪：install.sh 一键装卸（3 外壳实测）、CI workflow、双语 README、SECURITY/CHANGELOG/issue 模板、About/topics/Release 文案（见对话记录或 git log）——**GitHub 建仓未做**（用户指示先不建）

## 目录导览

```
cards/*.yaml            坑卡库单一真源（77 张，schema 见下）
skills/pitfall-expert/   技能包（SKILL.md 主流程 L0–L5 + M1–M13 + references/ 五件 + scripts/）
engine/                  MCP 扫描引擎 + CLI（scanner.js 评分匹配 / report.js 三区报告 / gate-core.cjs 门控）
hooks/                   PreToolUse 门控（默认 report，block 模式拦破坏命令）+ UserPromptSubmit
dsh-plugin/              DeepSeek Harness 适配（8 测试，未真机验证）
docs/                    方法论 v0.3 + 四份设计文档 + 案例库 + 自举回放 + 核心卡评审存档
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
6. **测完再提交**：本会话曾先 commit 后看测试挂了 1 个（顺序失误，已修正）。

## 卡格式（四件套硬标准）

`cards/<domain>.yaml`，12 必填字段：id/title/description/symptom/severity{S,O,D}/evidence{source,level}/fix/**verifier**/confidence/pass_k_relevant/triggers（**强制中英双语**）+ 可选扩展（hazard_type/latent_condition/source_ref）。evidence.level：empirical > case > consensus > opinion。详见 `skills/pitfall-expert/references/card-format.md`。校验：引擎 loadCards 一票准入。

## 已知边界 / 下一步候选

1. **卡内容正文中文**（triggers 已双语，功能不受影响）——英文化在路线图，等国际用户信号；
2. **匹配是关键词级**（无词干化：agents≠agent），语义匹配在路线图——取向「宁漏报不错报」；
3. **dsh 插件仅 mock 测试**，未真机；
4. **真实用户零**：所有验证都是自举/外部考题——最缺的是真实任务回写（元坑⑭「知卡而踩」的长期解在 hooks 写入侧拦截，未做）；
5. 创意/写作、决策/战略域未建卡；AMiner 报告还有两章未挖（提示词方法论、OWASP 组织落地）；
6. 元坑登记簿现 **16 条**（`references/meta-pitfalls.md`）——方法论自身的翻车记录，新会话继续写。

## 七轮采集方法论（已验证有效，可复用）

搜「结果+情绪词」不搜概念（"AI deleted my database" 而非 "AI 风险"）；GitHub issue 找证据链、Reddit/HN 找现场、事故博客找根因；**入卡前过 M3/M4 信源分级**；同坑多报=一张卡+高 O 值不新增卡。每轮产量约 2–4 新卡。信源速查：claude-code#92732（自我报告伪造）、codex#28224（遥测 640TB）、UpGuard 六案、USENIX slopsquatting、Science 2026 谄媚（DOI:10.1126/science.aec8352）。
