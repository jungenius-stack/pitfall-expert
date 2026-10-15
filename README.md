<div align="center">

**English** · [简体中文](README.zh-CN.md)

# pitfall-expert: Check the Pitfalls Before Your Agent Starts

### One pre-task risk scan for AI agents across code, math, and decisions.

**See a task you want done. Know where it breaks, before it starts.**

[![License: MIT](https://img.shields.io/badge/code-MIT-f4c430?style=flat-square)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/cards_&_docs-CC_BY_4.0-3f9f7f?style=flat-square)](LICENSE-CONTENT.md)
[![Skill](https://img.shields.io/badge/form-skill_+MCP_engine_+hooks-5c4ee5?style=flat-square)](#architecture)
[![Cards](https://img.shields.io/badge/pitfall_cards-64-cb3837?style=flat-square)](cards/)

[Quick start](#quick-start) · [How it works](#how-it-works) · [What it can catch](#what-it-can-catch) · [Battle record](#battle-record) · [FAQ](#faq) · [Documentation](#documentation)

```bash
sh install.sh
```

</div>

---

AI coding agents have two structural flaws that bite *before* work starts: they **agree with your plan** (sycophancy), and when they say "verified" you **can't tell what was actually tested vs. guessed**. Independent research confirms the failure modes: agents declare solvable tasks impossible (54.9% of WebArena failures), claim completion while the environment is unchanged (MAST), pass weak test suites (7.8% of "passing" SWE-bench patches are wrong), and mistake single-run luck for reliability (pass^8 < 25%). Those exact findings are seed cards in this library.

pitfall-expert runs a systematic pitfall scan **before** the task starts: it matches the task against a 64-card domain library (code / math / research-decisions / agent-security), binds every blocking pit to an **executable verifier**, and outputs a **three-zone honest report** — ✅ verified (with evidence chains) / ❓ unverified (with 5-minute follow-up actions) / 🚫 declared blind spots.

> **Done = fully disclosed, not perfect. Missed pits are forgivable; false "verified" claims are not.**
> 完成等于披露完整，而非结果完美。漏报可原谅，谎报不可原谅。

## Quick start

### Install the skill

```bash
git clone <this-repo> && cd pitfall-expert
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

## How it works

Your agent (or the CLI) scans the task against `cards/<domain>.yaml` — every card matched with evidence, every blocking pit bound to a runnable verifier. The skill persona (L0–L5 pipeline, 13 mechanisms) runs the parts engines can't: assumption dumping, pre-mortem, user-constraint profiling. Then the report passes a six-item DoD machine check (`dod_check.py`). Skill = the instructions, engine = the muscle, hooks = the seatbelt.

## What it can catch

| Domain | Cards | Catches | Honest "cannot" |
|---|---|---|---|
| Code / engineering | `code.yaml` (27) | hallucinated completion, flaky-passing-as-stable, weak test suites, irreversible ops, default-behavior traps, type coercion, falsehoods (time/names/i18n), cascade failures, hidden business rules, no-impact-analysis changes, error-process automation, unisolated parallel agents | architecture taste, business-logic correctness, closed-source internals |
| Math | `math.yaml` (12) | circular proofs, converse confusion, induction gaps, unit/sign errors, boundary misses, probability & p-value traps | open conjectures |
| Agent security | `agent-security.yaml` (5) | MCP supply-chain poisoning, OAuth adapter RCE, indirect prompt injection triad, zero tool-call visibility, sampling reverse control | physical isolation, zero-days |
| Research / decisions | `research-decision.yaml` (8) | "not-found ≠ non-existent" false negatives, unit-of-account mismatches, small-sample capacity claims, rumor-driven analysis, hidden clause layers, advantage misattribution | predicting the future, competitors' plans |
| Science/ML · creative · strategy | — | placeholder, runs generic mechanisms only, **promises nothing** | — |

Card counts live in `cards/` — trust the directory, not this table. Science/ML, creative and collaboration-management domains are declared placeholders: no cards means no cards, stated out loud in every report's blind-spot zone.

## Battle record

Numbers, not adjectives — every claim replay-tested:

- **10/10** real failure-case replays passed (cards distilled from a 56K-char incident log);
- **12/13** coverage on an *external* blind test — 13 real-world pitfalls from two practitioner talk transcripts (one uncovered item = collaboration-management domain, exactly where the capability table said "no cards");
- **4 meta-pitfalls caught on ourselves** during development (e.g. an allow-list rule that silently passed `git push --force`) — logged openly in the [meta-pitfall registry](skills/pitfall-expert/references/meta-pitfalls.md), now 13 entries;
- Two independent implementations (built in parallel on two platforms) converged on the same honesty axioms — merged in v0.4. A 240K-star tool ([REA](https://github.com/morluto/rea)) independently ships the same skill+engine+plugin distribution shape.

## FAQ

<details>
<summary><strong>Which agents/harnesses can use it?</strong></summary>

Any harness that scans a skills directory for SKILL.md: ZCode, DeepSeek Harness (`~/.agents/skills/`), Claude Code (`~/.claude/skills/`), WorkBuddy. The engine additionally speaks MCP; the hooks follow the Claude Code / WorkBuddy hook contract.

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
