<div align="center">

**English** · [简体中文](README.zh-CN.md)

# pitfall-expert: Check the Pitfalls Before Your Agent Starts

### One pre-task risk scan for AI agents across seven domains: code, math, decisions, agent security, science/ML, creative writing, strategy.

**See a task you want done. Know where it breaks, before it starts.**

[![CI](https://github.com/jungenius-stack/pitfall-expert/actions/workflows/ci.yml/badge.svg)](https://github.com/jungenius-stack/pitfall-expert/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-f4c430?style=flat-square)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/cards_&_docs-CC_BY_4.0-3f9f7f?style=flat-square)](LICENSE-CONTENT.md)
[![Skill](https://img.shields.io/badge/form-skill_+MCP_engine_+hooks-5c4ee5?style=flat-square)](#architecture)
[![Cards](https://img.shields.io/badge/pitfall_cards-120-cb3837?style=flat-square)](cards/)

[Quick start](#quick-start) · [How it works](#how-it-works) · [What it can catch](#what-it-can-catch) · [Battle record](#battle-record) · [FAQ](#faq) · [Documentation](#documentation)

```bash
sh install.sh
```

</div>

---

Your agent said **"done"** — and the migration isn't. It agreed with the doomed plan, called single-run luck "reliable", and you found out when the bill arrived.

**pitfall-expert** scans the task **before work starts**: it matches the task against a six-domain library of 100+ pitfall cards in `cards/` — each distilled from real incidents and peer-reviewed research — binds every blocking pit to an **executable verifier** (pre-declared decision table + executed-result write-back), and outputs a **three-zone honest report**: ✅ verified (evidence chains, quotable sources) / ❓ unverified (5-minute follow-up actions) / 🚫 declared blind spots.

The failure modes come with receipts, because they've been measured: agents declare solvable tasks impossible (54.9% of WebArena failures), claim completion while the environment is unchanged (MAST), pass weak test suites (7.8% of "passing" SWE-bench patches are wrong), mistake single-run luck for reliability (pass^8 < 25%), and side with a wrong user over half the time (*Science*, 2026: 51%). Those exact findings are seed cards in this library — card counts live in `cards/`; trust the directory over any number in prose.

Everything runs locally: a keyword scan over YAML cards, no network calls, no task text leaving your machine.

> **Effect ceiling (honest disclosure, added 2026-10-18)**: the evidence for comparable checklist interventions is **split**. WHO surgical checklist cut mortality with RR≈0.53 across 8 hospitals (Haynes, NEJM 2009) — but Ontario's mandatory rollout across 101 hospitals with n≈215,000 operations showed **zero effect** (death OR=0.91, P=0.13; Urbach, NEJM 2014). The mediating variable is **implementation fidelity** (a Norwegian stepped-wedge RCT found the effect only where all three parts were actually done). So this tool's benefit depends on whether you actually execute the blocking todos in the report; under checkbox compliance the effect can collapse to zero. We do not promise "installing this makes you safer" — we promise you can tell checked from guessed.

<details>
<summary><strong>What your agent hands back</strong> — real output, abbreviated (report skeleton is Chinese-native; fields translated here)</summary>

```text
# 踩坑报告 · ⚡ 快扫
- 任务：aggregate users.csv by province, mind nulls and duplicate rows
- 领域判定：code (medium) · 120 cards checked one by one, 100% coverage

## ✅ 已查证区（4 项）
### [CODE-014] CSV/数据解析
- 症状信号：row counts off; a column suddenly all-empty; mojibake; precision loss
- 证据：awesome-falsehood (CSV) — consensus
- 规避动作：use a real parser; declare encoding (utf-8-sig for BOM); read numerics as strings first
- 命中依据：trigger `csv` + fields fix/triggers
### [CODE-013] 空值与边界输入 …
### [CODE-036] 代码正确 ≠ 数据正确（静默列错位与不可能值）…

## ❓ 未验证区（0 项）
## 🚫 盲区声明
- 未建卡领域：决策/战略 —— "no cards" ≠ "no pits"
```

</details>

> **Done = fully disclosed, not perfect. Missed pits are forgivable; false "verified" claims are not.**
> 完成等于披露完整，而非结果完美。漏报可原谅，谎报不可原谅。

## Quick start

### Install the skill

```bash
git clone https://github.com/jungenius-stack/pitfall-expert.git && cd pitfall-expert
sh install.sh          # installs to every detected agent's skills dir, cards included
```

Works with any harness that reads `~/.agents/skills/` (ZCode, DeepSeek Harness), `~/.claude/skills/` (Claude Code), or `~/.workbuddy/skills/`. Uninstall: `sh install.sh --uninstall`.

### Ask your agent

```text
先踩坑：我打算把生产数据库从 MySQL 迁到 PostgreSQL
Pitfall-check this before you start: I'm about to migrate our pricing data pipeline
```

You get a three-zone report like the mini-sample at the bottom of [`skills/pitfall-expert/SKILL.md`](skills/pitfall-expert/SKILL.md).

### Use the terminal

```bash
node engine/src/cli.js "migrate users.csv into SQLite, watch nulls and encodings" --tier standard
```

### Make it mandatory (recommended)

Skills auto-activate only 20–50% of the time (community measurements). The gate doesn't rely on anyone's discipline — see [`hooks/README.md`](hooks/README.md) (PreToolUse: report-by-default, `PITFALL_HOOK_MODE=block` hard-blocks `rm -rf` / `git push --force`) and [`dsh-plugin/README.md`](dsh-plugin/README.md).

### Zero-install tryout

No harness? Paste the lite prompt from [`docs/入门版-贴即用.md`](docs/入门版-贴即用.md) into any chat model — it keeps the four survival mechanisms (tier gate, specificity filter, three-zone disclosure, blocking checklist); card matching and verifiers are full-version features.

## How it works

Your agent (or the CLI) scans the task against `cards/<domain>.yaml` — every card matched with evidence, every blocking pit bound to a runnable verifier. The skill persona (L0–L5 pipeline, 13 mechanisms) runs the parts engines can't: assumption dumping, pre-mortem, user-constraint profiling. Then the report passes a six-item DoD machine check (`dod_check.py`). Skill = the instructions, engine = the muscle, hooks = the seatbelt.

## What it can catch

| Domain | Cards | Catches | Honest "cannot" |
|---|---|---|---|
| Code / engineering | `code.yaml` | hallucinated completion, flaky-passing-as-stable, weak test suites, irreversible ops, default-behavior traps, type coercion, falsehoods, cascade failures, LLM code-review misjudgment | architecture taste, business-logic correctness, closed-source internals |
| Math | `math.yaml` | circular proofs, converse confusion, induction gaps, unit/sign errors, boundary misses, probability & p-value traps; LLM-era quantitative pitfalls: middle-digit arithmetic collapse, complexity-cliff breakdown, mixed-notation/order-of-magnitude slips, digit-perturbation fragility, un-externalized computation | open conjectures |
| Agent security | `agent-security.yaml` | MCP supply-chain poisoning, OAuth adapter RCE, indirect prompt injection triad, zero tool-call visibility, sampling reverse control, agent identity/credential abuse | physical isolation, zero-days |
| Research / decisions | `research-decision.yaml` | "not-found ≠ non-existent" false negatives, unit-of-account mismatches, small-sample claims, rumor-driven analysis, hidden clause layers, advantage misattribution, judge-bias family (stable ≠ correct, judges miss bad answers, self-correction illusion, authority bias) | predicting the future, competitors' plans |
| Science/ML | `science.yaml` | train/test leakage, join explosion/loss, cross-dashboard mismatch, backtest look-ahead, accuracy paradox, factuality scoring failure; table value misalignment, chart-contradiction non-refusal, statistical-test applicability errors, command-parameter mismatches, chart misreading with misleading-chart pre-checks | feature-engineering traps, experiment design |
| Creative writing | `creative.yaml` | long-form consistency drift, lost-in-the-middle, slop/style convergence, weak AI judging of creative work, structure/pacing collapse | real reader taste, originality |
| Strategy | `strategy.yaml` | advice omission bias (no inaction baseline/exit conditions), tone-framing sensitivity, uncalibrated self-reported confidence, automation bias (independent judgment first), game-theoretic opponent assumptions & AI-drafted commitments | real probability forecasting, non-public terms, replacing human accountability |

Card counts live in `cards/` — trust the directory, not this table. What each domain can and cannot catch is maintained in `references/capability.md`.

## Battle record

Numbers, not adjectives — every claim replay-tested:

- **10/10** real failure-case replays passed (cards distilled from a 56K-char incident log);
- **12/13** coverage on an *external* blind test — 13 real-world pitfalls from two practitioner talk transcripts (one uncovered item = collaboration-management domain, exactly where the capability table said "no cards");
- **4 meta-pitfalls caught on ourselves** during development (e.g. an allow-list rule that silently passed `git push --force`) — logged openly in the [meta-pitfall registry](skills/pitfall-expert/references/meta-pitfalls.md), now 17 entries including two "looked like pure gain, rolled back same day" matching experiments;
- **Dual-source red-team reviews** (v0.6): a fresh-context subagent and an out-of-family GLM-4.6 each attacked the design; 20+ failure modes archived, 13 fixed ([red team](docs/红队评审-v1.md) / [adversarial review](docs/沉思评审-v1.md));
- Two independent implementations (built in parallel on two platforms) converged on the same honesty axioms — merged in v0.4. A 240K-star tool ([REA](https://github.com/morluto/rea)) independently ships the same skill+engine+plugin distribution shape.

## Report misses & false hits

The library upgrades on real cases. If a pit wasn't caught (false negative) or an irrelevant card fired (false positive), rerun the scan with `--feedback`: it emits a de-identified bundle — card IDs, scores, library/engine versions, domain verdict; **no task text by default** (`--with-task` to include, review before posting) — ready to paste into the [false-negative](.github/ISSUE_TEMPLATE/false-negative.md) / [false-positive](.github/ISSUE_TEMPLATE/false-positive.md) issue templates. Every case becomes a regression sample in the noise battery and the eval set.

```bash
node engine/src/cli.js "your task" --tier standard --feedback
```

> **Showcase**: if it caught a real pit for you, open an issue labeled `showcase` — real cases become new cards, credited in `source_ref`.

## FAQ

<details>
<summary><strong>Which agents/harnesses can use it?</strong></summary>

Any harness that scans a skills directory for SKILL.md: ZCode, DeepSeek Harness (`~/.agents/skills/`), Claude Code (`~/.claude/skills/`), WorkBuddy. The engine additionally speaks MCP; the hooks follow the Claude Code / WorkBuddy hook contract.

</details>

<details>
<summary><strong>Does it upload my task or collect telemetry?</strong></summary>

No. Matching is a local keyword scan over YAML card files — the engine makes no network calls. The opt-in `--feedback` bundle excludes task text by default (card IDs, scores and versions only).

</details>

<details>
<summary><strong>A match looks wrong</strong></summary>

Update first — `git pull`. The card library evolves, and stale cards cause most weird matches. Still wrong? Attach the `--feedback` bundle and file a false-positive issue; every case becomes a regression sample.

</details>

<details>
<summary><strong>Do I need Node.js?</strong></summary>

No for the skill (the model reads cards directly). Yes for the engine, CLI and hooks (Node ≥18, one dependency). Everything degrades loudly, never silently: missing resources are declared, never fabricated.

</details>

<details>
<summary><strong>Will the gate slow my agent down?</strong></summary>

The gate runs a quick-tier scan (sub-second keyword matching, local only). Default mode only reports; block mode only stops destructive patterns. Kill switch: `PITFALL_HOOK_DISABLE=1`.

</details>

<details>
<summary><strong>Is this another "risk checklist" template?</strong></summary>

No — three differences: every blocking pit must bind an **executable verifier** (or be demoted to the unverified zone — worries don't count), findings are four-way graded including "paper tigers" that get explicitly *not* defended, and the report's structure is machine-checked. A checklist without verifiers is a wish list.

</details>

<details>
<summary><strong>Hit a bug / missed a pit?</strong></summary>

Missed pits are expected and forgivable — please [report them](../../issues) so the card gets written back (near-misses first: Heinrich 1:29:300). False "verified" claims are bugs of the worst kind; those get root-caused. Run `sh skills/pitfall-expert/scripts/selfcheck.sh` before filing.

</details>

## Documentation

- [`skills/pitfall-expert/SKILL.md`](skills/pitfall-expert/SKILL.md) — the pipeline itself (L0–L5, M1–M13 mechanisms, mini sample)
- [`docs/踩坑专家方法论_v0.3.md`](docs/踩坑专家方法论_v0.3.md) — methodology source of truth (9 layers, self-bootstrap replay) · Chinese
- [`docs/cases/`](docs/cases/) — the replay exam archive (real failure cases + external blind tests)
- [`docs/01..04`](docs/) — prior-art survey (15 external solutions, gap confirmed), 34-item mechanism survey, design doc, form-factor comparison · Chinese
- [CONTRIBUTING.md](CONTRIBUTING.md) — card contributions: four essentials, bilingual triggers, evidence levels

## Provenance (honest)

v0.4+ is a **merger of two independent implementations** built in parallel from one brief on two platforms (ZCode + WorkBuddy). Both converged on identical honesty axioms; each side contributed what it was best at. The merger's own stumbles are logged as meta-pitfalls ⑨–⑫, not hidden. Translations beyond English/Chinese welcome — see CONTRIBUTING.

## License

Code (engine/, skills/, hooks/, dsh-plugin/): **MIT**. Pitfall-card data & docs (cards/, docs/): **CC BY 4.0** — life-saving checklists shouldn't be locked up.
