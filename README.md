# pitfall-expert · 踩坑专家

> **Pitfall Expert** — a systematic pre-task risk scout for AI coding agents. Before the agent starts any task (coding, research, purchase decisions, API integrations, migrations), it walks the minefield first: matches the task against a domain pitfall-card library, then outputs a **three-zone honest report** — ✅ verified (with evidence chains) / ❓ unverified (with 5-minute follow-up actions) / 🚫 declared blind spots — plus a list of **executable verifiers**.
>
> **Done = fully disclosed, not perfect. Missed pits are forgivable; false "verified" claims are not.**
>
> 在 AI 动手解决任何需求之前，先把该任务背后的坑系统性踩一遍。输出的不是「放心吧没问题」，而是「这三处是验证过的真坑、这两处我怀疑但没验出来、这类坑我系统性地看不见」。

## Why this exists

AI assistants have two structural flaws that bite *before* work starts:

1. **Sycophancy** — the model tends to agree that your plan is fine.
2. **Opaque verification boundaries** — when it says "verified", you can't tell what was actually tested vs. guessed. You find out when the money is spent or the code is live.

Independent research backs this up: agents claim "impossible" on solvable tasks (54.9% of WebArena failures), declare completion while the environment is unchanged (MAST), pass weak test suites (7.8% of "passing" SWE-bench patches are wrong), and conflate single-run luck with reliability (pass^8 < 25% at pass@1 ≈ 60%). Those exact findings are seed pitfall cards here.

Community measurements put skill auto-activation at only 20–50% — which is why this project ships an **enforcement layer** (hooks), not just a skill.

## Architecture — four layers, install what you need

| Layer | Path | Role | Force |
|---|---|---|---|
| Core | `engine/` | Pitfall-card library + scan engine (MCP server + CLI), deterministic matching | called |
| Shell | `skills/pitfall-expert/` | Process persona: L0–L5 pipeline, 13 mechanisms (M1–M13), tier negotiation, DoD machine-check | advisory (skill) |
| Gate | `hooks/` | PreToolUse gate + UserPromptSubmit injection — report-by-default, `PITFALL_HOOK_MODE=block` to hard-block destructive commands | **enforced (hook)** |
| 4th port | `dsh-plugin/` | DeepSeek Harness adapter (tools/pre-execute gate) | enforced |

## Quick start

```bash
git clone <this-repo> && cd pitfall-expert

# 1. Run the engine tests (15 scenarios incl. MCP stdio)
cd engine && npm install && npm test

# 2. Scan a task (works with English and Chinese tasks)
node engine/src/cli.js "migrate our pricing data, careful with timezone and float rounding" --tier standard
node engine/src/cli.js "帮我把 users.csv 按省份汇总人数，注意空值" --tier standard

# 3. Skill self-check (29 assertions: structure, cards, bilingual smoke, DoD tester)
sh skills/pitfall-expert/scripts/selfcheck.sh

# 4. Install as a skill (any harness that reads ~/.agents/skills/ or SKILL.md)
cp -r skills/pitfall-expert ~/.agents/skills/
# 5. Or wire the gate — see hooks/README.md (Claude Code / WorkBuddy) and dsh-plugin/README.md
```

## The pitfall-card library (43 cards, single source of truth in `cards/`)

| Domain | File | Cards | Seeded from |
|---|---|---|---|
| Code / engineering | `code.yaml` | 23 | Empirical agent-failure research (WebArena, MAST, τ-bench, SWE-bench, awesome-falsehood) + real incident cases (CI-001~005) |
| Math | `math.yaml` | 12 | Classic proof-mistake catalogs (circular reasoning, converse confusion, induction gaps, probability traps) |
| Research / decisions | `research-decision.yaml` | 8 | Real failure case replays (D1–D8): sample-size traps, unit-of-account mismatches, unverifiable negative claims, hidden clause layers |

Every card carries the **four essentials**: description + evidence (with level: empirical/case/consensus) + mitigation + **executable verifier** — a pitfall card without a verifier is just a worry. Triggers are bilingual (zh+en) so English tasks actually match (meta-pitfall ⑩). Science/ML, creative writing and strategy domains are declared placeholders — the skill refuses to promise coverage it doesn't have.

## What a report looks like

Every statement lands in exactly one zone; empty zones must be explicitly declared empty with reasons:

- **✅ Verified** — evidence chain: source + method + date
- **❓ Unverified** — why it wasn't verified + a follow-up action runnable in ~5 minutes
- **🚫 Blind spots** — what this task type systematically cannot see; unbuilt domains declared ("no cards", not "no pits")

Findings are graded 🐯 real pit (blocking, **must** bind an executable verifier or get demoted to ❓) / 🟡 medium / 🐘 elephant (dormant, with observable trigger signals) / 🐺 paper tiger (recognized, explicitly *not* defended — anti list-inflation). Then the report passes a six-item DoD machine-check (`scripts/dod_check.py`).

## Mechanisms M1–M13 (distilled from real failures, replay-tested)

User-constraint-profiling first (M1) · unit-of-account audit (M2) · source-grading bound to actions (M3) · high bar for negative claims + "not-found ≠ non-existent" (M4) · mandatory sample-size disclosure (M5) · too-good-to-be-true auto-escalation + clause-layer enumeration (M6) · three-state disclosure contract (M7) · four-way filtering incl. paper tigers (M8) · layered non-overlapping checks (M9) · default-behavior must be tested (M10) · config-is-verification (M11) · card write-back with near-miss priority (M12) · **verifier foundry** (M13). Full rules with sources: `skills/pitfall-expert/references/mechanisms.md`.

## Provenance (honest)

v0.4 (2026-10-15) is a **merger of two independent implementations** built in parallel from the same brief on two platforms (ZCode + WorkBuddy). Both converged on identical honesty axioms (three-zone disclosure, done=disclosed, introspection≠verification, dual licensing) — independent convergence is the strongest evidence the core design is right. Each side contributed what it was best at: the ZCode line contributed the evidence-chained research docs, case-driven cards (D1–D8), M1–M12 mechanisms and the report DoD checker; the WorkBuddy line contributed the engine/hooks/dsh-plugin enforcement stack, literature-driven cards and the verifier-foundry concept. The merger's own stumbles are logged in `skills/pitfall-expert/references/meta-pitfalls.md` (⑨⑩).

## Documentation

- `docs/踩坑专家方法论_v0.3.md` — methodology source of truth (9 layers, self-bootstrap replay, evidence index) — Chinese
- `docs/01..04` — prior-art survey (15 external solutions, gap confirmed), mechanism survey (34 items), design doc (10-case replay 100%), form-factor comparison — Chinese
- `docs/示例报告_代码域.md` — sample engine report · `docs/使用场景示例.md` — 15 usage examples
- `README.zh-CN.md` — 中文版说明

## Roadmap

- [ ] Card content internationalization (titles/descriptions in English; bilingual triggers already shipped)
- [ ] Science/ML domain cards (seed sources locked: ML-leak taxonomy, p-hacking, awesome-falsehood)
- [ ] Semantic matching beyond deterministic keywords (current stance: prefer missing over false-alarming)
- [ ] Real-user task replays feeding the card library (compound interest starts here)

## License

Dual, split by asset class:

- **Code** (engine/, skills/, hooks/, dsh-plugin/) — **MIT**, see [LICENSE](LICENSE)
- **Card data & docs** (cards/, docs/) — **CC BY 4.0**, see [LICENSE-CONTENT.md](LICENSE-CONTENT.md) — life-saving checklists shouldn't be locked up

## Contributing

Pitfall cards are the core asset. New cards need the four essentials with evidence levels; new domains need the activation triple (capability boundary + ≥5 sourced cards + ≥1 case replay). **Near-misses first** — an intercepted pit is the leading indicator of a big one (Heinrich 1:29:300). See [CONTRIBUTING.md](CONTRIBUTING.md).
