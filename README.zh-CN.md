<div align="center">

**简体中文** · [English](README.md)

# 踩坑专家：AI 开工前，先把坑踩一遍

### 一个给 AI 代理用的任务前风险扫描，覆盖代码、数学、调研决策、Agent 安全、科学/ML 与创意写作六域。

**看到一件想让它干的活，先知道它会在哪翻车。**

[Quick start](#快速开始) · [工作原理](#工作原理) · [能防什么](#能防什么) · [战绩](#战绩) · [FAQ](#faq)

```bash
sh install.sh
```

</div>

---

AI 编程代理有两个结构性缺陷，都在动手**前**咬人：**附和你的方案**（谄媚），以及说「验证通过」时你**分不清哪些真验了哪些是猜的**。学界实证：agent 把可做的任务判成「做不到」占 WebArena 失败的 54.9%；宣称完成但环境没变（MAST）；弱测试假绿（SWE-bench 7.8%「通过」补丁是错的）；单次走运当稳定（pass^8 < 25%）。这些结论本身就是本库的种子坑卡。

踩坑专家在任务开始前跑系统性预检：对照 `cards/` 六域坑卡（实数以目录为准，v0.7 起 90+ 张），每条阻断级坑绑定**可执行验证器**（判定表前置+执行结果回填），输出**三区诚实报告**——✅ 已查证（带证据链+可复核原文引用）/ ❓ 未验证（带 5 分钟补验动作）/ 🚫 盲区声明。

> **完成 = 披露完整，而非结果完美。漏报可原谅，谎报不可原谅。**

## 快速开始

**装技能**（一条命令，装到检测到的所有外壳目录）：

```bash
git clone <本仓库> && cd pitfall-expert && sh install.sh
```

兼容 ZCode / DeepSeek Harness（`~/.agents/skills/`）、Claude Code（`~/.claude/skills/`）、WorkBuddy。卸载：`sh install.sh --uninstall`。

**对话里说**：

```text
先踩坑：我打算把生产数据库从 MySQL 迁到 PostgreSQL
```

**命令行扫**：

```bash
node engine/src/cli.js "把 users.csv 导入 SQLite，注意空值和编码" --tier standard
```

**装门控（推荐）**——技能自动激活率只有 20–50%，门控不靠任何人的自觉：见 [hooks/README.md](hooks/README.md)（默认先报告后放行；`PITFALL_HOOK_MODE=block` 硬拦 `rm -rf`、`git push --force`）与 [dsh-plugin/README.md](dsh-plugin/README.md)。

**不装也行**——零安装入门版：一段提示词贴进任何聊天模型，保命机制全保留（[docs/入门版-贴即用.md](docs/入门版-贴即用.md)）。

## 工作原理

agent（或 CLI）拿任务对照 `cards/<domain>.yaml` 扫描——每张命中带证据，每条真坑绑可运行验证器。技能人格（L0–L5 流水线 + M1–M13 机制）跑引擎跑不了的部分：假设倾倒、预验尸、用户约束画像。报告写完过六条 DoD 机检（`dod_check.py`）。**技能=说明书，引擎=肌肉，门控=安全带。**

## 能防什么

| 领域 | 卡库 | 能防 | 诚实声明「不能防」 |
|---|---|---|---|
| 代码/工程 | code.yaml | 幻觉式完成、复跑不一致、测试假绿、不可逆操作、缺省行为坑、类型强转、falsehoods、级联失败、LLM 评代码不可靠 | 架构品味、业务逻辑正确性、闭源内部 |
| 数学 | math.yaml | 循环论证、逆否命题混淆、归纳跳步、量纲误用、边界遗漏、概率/p 值陷阱 | 开放猜想 |
| Agent 安全 | agent-security.yaml | MCP 供应链投毒、OAuth 适配层 RCE、间接提示注入三要素、工具调用零可见性、sampling 反向操控、agent 身份权限滥用 | 物理隔离、零日漏洞 |
| 调研/决策 | research-decision.yaml | 「搜不到≠不存在」误判、口径坑、小样本容量结论、传言驱动分析、隐性条款层、优势归属错配、AI 谄媚与判断偏差系（稳定≠正确/裁判抓不出坏答案/自纠幻觉/权威偏置） | 预测未来、对手策略 |
| 科学/ML | science.yaml | 训练/测试泄漏、join 行爆炸/丢行、口径不一、回测未来数据、准确率悖论、事实一致性打分失效 | 特征工程陷阱、实验设计 |
| 创意/写作 | creative.yaml | 长篇一致性漂移、中段遗忘、风格趋同/AI 味、AI 评委弱区、结构计划失守 | 真实读者偏好、原创性判断 |
| 决策/战略 | — | 占位，只跑通用机制，**不做任何承诺** | — |

卡数以 `cards/` 目录实数为准（勿信写死的数字）。未建卡领域在每份报告的盲区区显式声明。

## 战绩（数字说话）

- **10/10** 真实翻车案例回放通过（源自 56K 字事故记录精读）；
- **12/13** 外部盲测覆盖——两份实战分享 13 条坑，唯一没接住的恰好落在能力表声明过的盲区；
- **4 次开发实盘自我抓坑**（如「白名单规则放过 git push --force」）——公开记录在[元坑登记簿](skills/pitfall-expert/references/meta-pitfalls.md)（现 17 条，含两次「看似纯增益、当日回滚」的匹配实验）；
- **双源红队评审**（v0.6）：同源局外人子代理 + 异源 GLM-4.6 各攻击一轮，20+ 失效场景全部落档、已修 13 条（[红队评审](docs/红队评审-v1.md)/[沉思评审](docs/沉思评审-v1.md)）；
- 两个并行独立实现收敛到同一套诚实公理（v0.4 合并）；24 万 star 的 [REA](https://github.com/morluto/rea) 独立选了同样的「技能+引擎+插件」分发形态。

## 反馈漏报 / 误报

卡库靠真实案例升级。踩了坑没拦住（漏报）或不相干任务被命中（误报），重跑一次带 `--feedback`：输出脱敏反馈包——卡 ID、分数、卡库/引擎版本、域判定；**默认不含任务原文**（附原文加 `--with-task`，提交前自查敏感信息）——直接贴进[漏报](.github/ISSUE_TEMPLATE/false-negative.md)/[误报](.github/ISSUE_TEMPLATE/false-positive.md) issue 模板。每个案例都会变成噪音电池与评测集的回归样本。

```bash
node engine/src/cli.js "你的任务" --tier standard --feedback
```

## FAQ

<details>
<summary><strong>哪些外壳能用？</strong></summary>

任何扫描技能目录读 SKILL.md 的外壳：ZCode、DeepSeek Harness、Claude Code、WorkBuddy。引擎另支持 MCP；hooks 遵循 Claude Code / WorkBuddy 契约。

</details>

<details>
<summary><strong>必须装 Node 吗？</strong></summary>

技能不用（模型直接读卡）。引擎/CLI/hooks 需要 Node ≥18（一个依赖）。资源缺失一律显式声明降级，绝不静默、绝不虚构。

</details>

<details>
<summary><strong>门控会拖慢我的 agent 吗？</strong></summary>

门控跑快扫档（亚秒级本地关键词匹配）。默认模式只报告不拦；block 模式只拦破坏性命令。急停开关：`PITFALL_HOOK_DISABLE=1`。

</details>

<details>
<summary><strong>这和「风险清单」模板有什么区别？</strong></summary>

三个区别：每条真坑必须绑**可执行验证器**（判定表前置、执行结果回填——绑不上降级 ❓ 区，担忧不算数）；发现四分级，纸老虎**判狼须 A 级一手证据**且可被重新质疑（防清单通胀也防错判免疫）；报告结构有机检脚本把关。没有验证器的清单只是愿望清单。

</details>

<details>
<summary><strong>漏了坑 / 出了 bug？</strong></summary>

漏坑是预期内的（公理 1），[报 issue](../../issues) 回写坑卡就是贡献（未遂坑优先）；谎报是最严重的 bug，追根因。提交前先跑 `sh skills/pitfall-expert/scripts/selfcheck.sh`。

</details>

## 文档

- [SKILL.md](skills/pitfall-expert/SKILL.md)——流程本体（L0–L5、M1–M13、迷你样例）
- [方法论 v0.3](docs/踩坑专家方法论_v0.3.md)——真源（九层结构+自举回放）
- [docs/cases/](docs/cases/)——回放考题档案（真实案例+外部盲测）
- [CONTRIBUTING.md](CONTRIBUTING.md)——坑卡贡献：四件套、双语 triggers、证据分级

## 出身（诚实声明）

v0.4+ 是**两个并行独立实现的合并**（ZCode 线 + WorkBuddy 线，同一需求两平台各跑全程），双方独立收敛到同一套诚实公理，各贡献所长。融合过程自己踩的坑登记为元坑 ⑨–⑫，不藏。欢迎贡献更多语言翻译。

## 许可

代码（engine/ skills/ hooks/ dsh-plugin/）：**MIT**。坑卡数据与文档（cards/ docs/）：**CC BY 4.0**——救命清单不该被锁起来。
