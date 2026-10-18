# 评测语料来源台账（eval/sources.md）

> 纪律：**每一条都要先验证 URL 可达、拿到许可证/使用条款，才能被 `eval/tasks/` 引用**。
> 未验证 = ❓，不得写进测试集。本文件本身就是「不凭记忆声称数据集公开」的防线。

## 状态图例

- ✅ 已验证可达 + 条款清楚
- ❓ 待验证（有出处但未实测）
- ⛔ 已验证不可用 / 条款不允许

## 一、代码 & Agent 判定

| 来源 | 论文 | 声称地址 | 数据形态 | 状态 | 验证动作 |
|---|---|---|---|---|---|
| AgentRewardBench | COLM 2025 | `agent-reward-bench.github.io` | 1302 条专家标注轨迹（成功/副作用/重复性） | ✅ HTTP 200（2026-10-18）；许可证待查 | curl 首页 + 查 license |
| CUAVerifierBench | COLM 2026 | 见论文（AMiner 页面 404 风险） | 轨迹过程+结果双标签 | ❓ | 先定位 arXiv 号再查 |
| AppWorld | ACL 2024 | 见论文 | 457 API / 750 交互式任务 | ❓ | 官方站点 |

## 二、建议/决策质量

| 来源 | 论文 | 声称地址 | 数据形态 | 状态 | 验证动作 |
|---|---|---|---|---|---|
| BFF-Bench（No Free Labels） | COLM 2026 | arXiv 标题验真通过（2026-10-18） | 160 题 + 1200 条专家 VERDICTS | ❓ 论文存在，数据地址未定 | 读 arXiv 全文找数据声明 |
| ResearchRubrics | ICLR 2026 | arXiv 标题验真通过（2026-10-18） | prompt + 2500+ 专家 rubric + 代码 | ❓ 论文存在，仓库地址未定 | 读 arXiv 全文找 GitHub 链接 |

## 三、通用助手任务

| 来源 | 论文 | 地址 | 数据形态 | 状态 |
|---|---|---|---|---|
| GAIA | ICLR 2024 | HF `gaia-benchmark` | 466 题（300 题答案公开，其余留榜） | ✅ HTTP 200（2026-10-18） |
| MT-Bench | NeurIPS 2023 | GitHub `lm-sys/FastChat` | 80 题多轮 + 3K 专家票 | ✅ HTTP 200（2026-10-18） |

## 四、本仓库自带

| 来源 | 位置 | 用途 | 状态 |
|---|---|---|---|
| 10 任务噪音电池 | `eval/battery.json` | 域判定回归、跨域误命中守门 | ✅ 已验证（第⑰号门实测 0 增） |

## 五、处置规则

1. 任一条目在所有 `eval/tasks/*.yaml` 中被引用时，状态必须是 ✅；引用 ❓ 条目的任务文件不得进 `eval/run.js`。
2. 许可证不明 → 只能「本地读，不重分发」；任务文本转写进仓库即视为重分发，**必须**条款允许。
3. 每个来源至少记录：原始 URL、抓取日期、条款原文摘录、引用下的任务数。

## 六、本轮实测记录（2026-10-18）

| 检查 | 结果 |
|---|---|
| `agent-reward-bench.github.io` | HTTP 200 |
| `huggingface.co/datasets/gaia-benchmark/GAIA` | HTTP 200 |
| `github.com/lm-sys/FastChat` | HTTP 200 |
| arXiv `ti:"ResearchRubrics"` | 命中，标题一致 |
| arXiv `ti:"No Free Labels"` | 命中，标题一致（另一命中为无关论文，已排除） |
| arXiv API 使用注意 | `export.arxiv.org` 会 301 到 https，必须带 `-L`，否则静默返回空——**曾因此误判为「查不到」** |
