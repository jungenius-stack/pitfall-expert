# 贡献指南 / Contributing

欢迎贡献坑卡、案例与机制改进。本项目的核心资产是**坑卡库**——每张坑卡背后必须有真实踩坑记录或可靠证据，宁缺毋滥。

## 坑卡贡献（cards/*.yaml）

格式规范见 [`skills/pitfall-expert/references/card-format.md`](skills/pitfall-expert/references/card-format.md)，要点：

- **四件套硬标准**：description（+symptom）、evidence（带等级）、fix、**verifier**——没有验证器的坑卡只是一条担忧，不入库；
- `evidence.level`：`empirical`（实证研究）/ `case`（真实翻车案例）/ `consensus`（社区共识）/ `opinion`（尽量不用）；
- `triggers` **强制双语**（中文+英文各若干）——缺一边就是对一半用户的系统性漏报（元坑⑩）；
- `confidence` 如实标注：`needs_verification` 的卡命中时只能进报告 ❓ 区。

提交前必跑校验（不通过不入库）：

```bash
node -e "const {loadCards}=require('./engine/src/scanner'); const r=loadCards('./cards'); console.log(r.cards.length+' cards', r.errors.length? JSON.stringify(r.errors):'✓')"
```

## 新领域激活三件套（占位 → 激活的硬条件）

1. **capability 边界声明**：能防什么、不能防什么（更新 SKILL.md 领域能力表）——不许只写能防；
2. **≥5 张带溯源坑卡**：`cards/<domain>.yaml` 新建，每张卡证据可追溯；
3. **≥1 条真实案例回放**：用真实任务验证「这套坑卡当时能防住」（`docs/cases/` + PR 给出回放推演）。

## 证据分级说明（诚实分级是本项目的立身之本）

| 等级 | 含义 | 准入 |
|---|---|---|
| `empirical` | 有实证研究支撑（论文/基准测试） | 附 arXiv/DOI 链接 |
| `case` | 有真实翻车案例回放验证 | 引用案例 ID（cases/D1…）或事故报告 |
| `consensus` | 社区共识（如 awesome-falsehood 清单） | 附仓库/文档链接，未核验的在 PR 说明 |
| `opinion` | 经验性条目 | 允许存在但消费方会降权；能升级就升级 |

**禁止**：把 `opinion` 的卡写成确定语气；把「搜到的博客说的」冒充 `consensus/empirical`。

## 其他贡献类型

- **机制改进（M1–M13）**：先开 Issue 提案，说明「哪个真实案例防不住」再动手；
- **报告模板/机检脚本**：改完必须附双样例测试（合格 + 不合格各一，见 `tests/`），跑 `sh skills/pitfall-expert/scripts/selfcheck.sh` 全绿；
- **案例库**：新增踩坑案例（含回放协议）是最高价值贡献——**未遂坑优先**（被拦下的坑、低损害小坑都是大坑的先导，海因里希 1:29:300）；
- **元坑**：本技能/引擎/方法论自身翻车的记录，入 `references/meta-pitfalls.md`，不与用户任务坑混流。

## 复盘纪律

- 漏报（当时 ❓ 区如实披露，事后发现漏了）→ 可原谅，正常回写；
- 谎报（声称 ✅ 但无证据链）→ 不可原谅，追流程根因（5 Whys）；
- 对事不对人：坑卡永远描述「什么条件下会发生」，不描述「谁犯了错」。

## 语言

仓库工作语言：中英双语。README（英文主）/README.zh-CN.md（中文）；坑卡 triggers 双语硬要求，卡内容当前中文、英文化在路线图（欢迎翻译 PR）。
