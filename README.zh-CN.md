# 踩坑专家（pitfall-expert）· 中文说明

> 在正式用 AI 解决任何需求之前，先让踩坑专家把该任务背后的隐性坑点提前踩一遍。输出不是「放心吧没问题」，而是三区诚实报告：✅ 验证过的真坑（带证据链）/ ❓ 怀疑但没验出来（带 5 分钟补验动作）/ 🚫 系统性看不见的盲区（显式声明），外加一份**可执行验证器清单**。
>
> **完成 = 披露完整，而非结果完美。漏报可原谅，谎报不可原谅。**

英文主文档见 [README.md](README.md)（面向国际用户）。

## 为什么需要它

AI 助手有两个结构性缺陷：**附和倾向**（顺着你的方案说没问题）和**验证边界不透明**（说「验证通过」时分不清哪些真验过、哪些是猜的）。学界实证佐证：54.9% 的 WebArena 失败是 agent 把可做的事判成「做不到」；MAST 记录了「宣称完成但环境未变」；SWE-bench 里 7.8% 「通过」的补丁实际是错的；τ-bench 显示单次 60% 成功率的 agent 八次全对不足 25%——这些结论本身就是本库的种子坑卡。另外社区实测 skill 自动激活率仅 20–50%，所以本项目同时提供**强制层**（hooks 门控）。

## 四层架构（按需安装）

| 层 | 目录 | 职责 | 强制力 |
|---|---|---|---|
| 核 | `engine/` | 坑卡库 + 扫描引擎（MCP server + CLI），确定性匹配 | 被调用 |
| 壳 | `skills/pitfall-expert/` | 流程人格：L0–L5 流水线 + M1–M13 机制 + 档位协商 + DoD 机检 | 建议式（skill） |
| 闸 | `hooks/` | PreToolUse 门控 + UserPromptSubmit 注入；默认先报告后放行，`PITFALL_HOOK_MODE=block` 硬拦破坏性命令 | **强制（hook）** |
| 第四端 | `dsh-plugin/` | DeepSeek Harness 适配 | 强制 |

## 快速开始

```bash
# 引擎测试（15 场景，含 MCP stdio 全链路）
cd engine && npm install && npm test

# 扫一个任务（中英文任务均可命中）
node engine/src/cli.js "帮我把 users.csv 按省份汇总人数，注意空值" --tier standard

# 技能自检（29 项断言）
sh skills/pitfall-expert/scripts/selfcheck.sh

# 装成技能（任何读 ~/.agents/skills/ 或 SKILL.md 的外壳）
cp -r skills/pitfall-expert ~/.agents/skills/
```

## 坑卡库（43 张，单一真源 cards/）

| 领域 | 文件 | 张数 | 种子来源 |
|---|---|---|---|
| 代码/工程 | `code.yaml` | 23 | agent 失败实证研究（WebArena/MAST/τ-bench/SWE-bench/awesome-falsehood）+ 真实案例卡 CI-001~005 |
| 数学 | `math.yaml` | 12 | 经典证明错误目录（循环论证、逆否命题、归纳跳步、概率陷阱） |
| 调研/决策 | `research-decision.yaml` | 8 | 真实翻车案例回放 D1–D8（样本坑/口径坑/信源坑/隐性条款坑） |

每张卡四件套齐全：描述 + 证据（empirical/case/consensus 分级）+ 规避动作 + **可执行验证器**（没有验证器的坑卡只是一条担忧）。triggers 强制双语，英文任务照样命中。科学/ML、创意、战略域为显式占位——没有卡就明说，不越格承诺。

## 报告长什么样

每条陈述落入且仅落于一态，空区也必须显式写空并给依据；发现分四级：🐯 真坑（阻断级，**必须**绑定可执行验证器，绑不上降级 ❓）/ 🟡 中风险 / 🐘 大象（潜伏，附触发信号）/ 🐺 纸老虎（识别后不设防，防清单通胀）。写完过 `dod_check.py` 六条机检。示例见 `docs/示例报告_代码域.md`。

## 出身（诚实声明）

v0.4（2026-10-15）是**两个并行独立实现在同一需求下的合并版**（ZCode 侧 + WorkBuddy 侧）。两边独立收敛到同一套诚实公理（三区披露、完成=披露完整、内省不算验证、双许可）——独立收敛是这个核心设计正确的最强证据。ZCode 线贡献了带证据链的调研文档、案例驱动坑卡（D1–D8）、M1–M12 机制与报告机检；WorkBuddy 线贡献了引擎/hooks/dsh 强制栈、文献驱动坑卡与验证器铸造概念。融合过程自身踩的坑记录在 `skills/pitfall-expert/references/meta-pitfalls.md`（⑨⑩⑪）。

## 许可

代码（engine/skills/hooks/dsh-plugin）**MIT**；坑卡数据与文档（cards/docs）**CC BY 4.0**——救命清单不该被锁起来。

## 贡献

坑卡是核心资产：四件套 + 证据分级；新领域激活三件套（能力边界 + ≥5 张带溯源卡 + ≥1 条案例回放）；**未遂坑优先**（海因里希 1:29:300）。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。
