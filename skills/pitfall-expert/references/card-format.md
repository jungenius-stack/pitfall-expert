# 坑卡字段规范与回写流程（cards/*.yaml）

> 单一真源：仓库根 `cards/<domain>.yaml`，技能与引擎共用。任何格式变更必须先过引擎校验器（见文末）。

## 文件结构

每个领域一个 yaml 文件：文件头（version/domain/updated/card_count）+ `cards:` 数组。

```yaml
version: "0.4.0"
domain: code            # code | math | research-decision | …
updated: "2026-10-15"
card_count: 23
cards:
  - id: CODE-001        # 前缀=来源族（CODE 文献卡 / CI 案例卡 / RD 调研决策 / MATH 数学），全库唯一
    title: 虚假不可能性
    description: …      # ① 描述：这个坑是什么、为什么会发生
    symptom: …          # 症状：什么迹象说明正在踩（供人工对照）
    severity: {S: 4, O: 3, D: 4}   # FMEA：S 伤害 / O 发生率 / D 隐蔽度，0–10
    evidence: {source: "Zhou et al., WebArena, ICLR 2024 (arXiv:2307.13854)", level: empirical}
    fix: …              # ② 规避动作：可执行的防御
    verifier: …         # ③ 验证器：一条可执行的检查/命令/可观测信号（M13）
    confidence: backed_by_context  # backed_by_context | needs_verification | assumption
    pass_k_relevant: true   # 该坑是否与复跑一致性相关（pass^k）
    triggers: [方案选型, feasibility, impossible]   # ④ 触发词：强制双语（中文+英文）
    # —— 可选扩展字段（引擎不校验，供溯源）——
    hazard_type: 事实性陷阱      # 常见错误/隐含前提/易错环节/工具链环境/事实性陷阱/逻辑漏洞/隐性条款坑
    latent_condition: …          # 长期隐患（潜伏条件）
    source_ref: cases/D1         # 案例溯源（ZCode 案例库）
```

## 四件套 = 入库硬标准

一张卡必须同时有：**描述（description+symptom）、证据（evidence，带等级）、规避动作（fix）、验证器（verifier）**。缺任何一件不许入库——没有验证器的坑卡只是一条担忧，担忧不改变失败概率。

- `evidence.level`：`empirical`（实证研究）/ `case`（真实翻车案例）/ `consensus`（社区共识）/ `opinion`（观点，尽量不用）；
- `triggers` 双语是硬要求（元坑⑩）：中文任务靠中文词、英文任务靠英文词，缺一边就是半个盲区；
- `confidence` 表达当前把握：`needs_verification` 的卡命中时只能进 ❓ 区；

## 回写流程（L5）

1. 报告「回写预告」节列出草案 → 用户确认；
2. 按上述 schema 写入对应 `cards/<domain>.yaml`（新领域先建文件并在 SKILL.md 能力表登记）；
3. 新领域激活三件套：capability 边界 + ≥5 张带溯源坑卡 + ≥1 条案例回放；
4. **未遂坑优先**（海因里希 1:29:300）：被拦下的坑、低损害小坑优先入卡；
5. 入库前跑校验（不通过不入库）：

```bash
node -e "const {loadCards}=require('./engine/src/scanner'); const r=loadCards('./cards'); console.log(r.cards.length+' cards', r.errors.length? JSON.stringify(r.errors):'✓ no errors')"
```
