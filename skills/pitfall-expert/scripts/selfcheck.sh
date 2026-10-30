#!/bin/sh
# pitfall-expert skill 自检入口（融合版 v0.5，零外部依赖，需 node + sh + python3）
# 检查链：目录完整性 → frontmatter → 版本一致性 → 坑卡库加载（引擎严格校验）→ 卡数一致性 → 冒烟扫描 → 三区齐备断言 → 报告机检自测
# 退出码：0=全部通过；1=有失败项（逐项打印 [FAIL]）
set -u

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
ENGINE_DIR="${PITFALL_ENGINE_DIR:-$REPO_ROOT/engine}"
CARDS_DIR="${PITFALL_CARDS_DIR:-$REPO_ROOT/cards}"
NODE_BIN="${NODE_BIN:-node}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FAIL=0

fail() { echo "[FAIL] $1"; FAIL=1; }
pass() { echo "[PASS] $1"; }

echo "== pitfall-expert selfcheck（融合版 v0.5）=="

# 1. 目录完整性（融合版结构：references 五件 + scripts + tests + 仓库根 cards）
for f in "SKILL.md" "references/mechanisms.md" "references/card-format.md" "references/report-template.md" "references/dod.md" "references/meta-pitfalls.md" "scripts/dod_check.py" "scripts/selfcheck.sh" "tests/sample-pass.md" "tests/sample-fail.md"; do
  [ -f "$SKILL_DIR/$f" ] && pass "存在 $f" || fail "缺失 $f"
done

# 2. frontmatter：name=目录名 + 双语 description + user-invocable
NAME_FIELD=$(grep -m1 '^name:' "$SKILL_DIR/SKILL.md" | sed 's/^name:[[:space:]]*//')
[ "${NAME_FIELD}" = "$(basename "$SKILL_DIR")" ] && pass "name 字段=目录名（${NAME_FIELD}）" || fail "name 字段(${NAME_FIELD})≠目录名($(basename "$SKILL_DIR"))"
grep -q '^description:' "$SKILL_DIR/SKILL.md" && grep -q 'Pitfall Expert' "$SKILL_DIR/SKILL.md" && pass "description 双语（中英混合命中）" || fail "description 缺失或无英文段"
grep -q '^user-invocable: true' "$SKILL_DIR/SKILL.md" && pass "user-invocable: true" || fail "缺 user-invocable: true"

# 2b. 版本一致性（元坑⑲：frontmatter version 必须 == CHANGELOG 最新版号；技能副本无 CHANGELOG 时跳过）
SKILL_VERSION=$(grep -m1 '^  version:' "$SKILL_DIR/SKILL.md" | sed 's/^  version:[[:space:]]*//')
if [ -f "$REPO_ROOT/CHANGELOG.md" ]; then
  CHANGELOG_VERSION=$(grep -m1 '^## v' "$REPO_ROOT/CHANGELOG.md" | sed 's/^## v\([0-9.]*\).*/\1/')
  [ "${SKILL_VERSION}" = "${CHANGELOG_VERSION}" ] && pass "版本一致：SKILL ${SKILL_VERSION} = CHANGELOG 最新 ${CHANGELOG_VERSION}" || fail "版本漂移：SKILL ${SKILL_VERSION} ≠ CHANGELOG 最新 ${CHANGELOG_VERSION}（元坑⑲：漏 bump）"
  # 2026-10-31 深审扩门：manifest.json/package.json 各带独立 version 字段，手工对齐必漏（⑲同类）——统一以 SKILL_VERSION 为基准比对
  VER_EXTRA_OK=1
  for vf in "$REPO_ROOT/skills/pitfall-expert/manifest.json" "$REPO_ROOT/package.json"; do
    if [ -f "$vf" ]; then
      VV=$(sed -n 's/.*"version":[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$vf" | head -1)
      if [ "${VV}" != "${SKILL_VERSION}" ]; then
        fail "版本漂移：$(basename "$vf") ${VV} ≠ SKILL ${SKILL_VERSION}（元坑⑲：多版本字段手工对齐必漏）"
        VER_EXTRA_OK=0
      fi
    fi
  done
  [ $VER_EXTRA_OK -eq 1 ] && pass "版本一致：manifest.json/package.json = SKILL ${SKILL_VERSION}"
else
  pass "版本一致性：无 CHANGELOG（技能副本），已跳过（本副本 version ${SKILL_VERSION}）"
fi

# 2c. frontmatter 严格 YAML 可解析（2026-10-26 事故回写：description 纯量含 ASCII ': ' → js-yaml 报
#     bad indentation → DSH/Agnes/豆包整技能静默拒绝；ZCode 宽松解析器照常显示=分发假阳性，门必须用严格解析器）
JSYAML_PATH=""
if [ -d "$ENGINE_DIR/node_modules/js-yaml" ]; then
  JSYAML_PATH="$ENGINE_DIR/node_modules/js-yaml"
elif [ -d "$(npm root -g 2>/dev/null)/js-yaml" ]; then
  JSYAML_PATH="$(npm root -g 2>/dev/null)/js-yaml"
fi
if [ -n "$JSYAML_PATH" ]; then
  if node -e "const y=require('$JSYAML_PATH');const fs=require('fs');y.load(fs.readFileSync('$SKILL_DIR/SKILL.md','utf8').split(/^---\$/m)[1])" 2>/dev/null; then
    pass "frontmatter 严格 YAML 解析通过（js-yaml）"
  else
    fail "frontmatter 严格 YAML 解析失败——严格解析器（DSH/Agnes/豆包等）会整技能静默拒绝；常见因：纯量含 ASCII ': '（修法：值整体加单引号）"
  fi
else
  # 降级门（无 js-yaml）：description 值须引号开头或不含 ASCII ': '；降级须声明，不静默跳过
  desc_line="$(grep -m1 '^description:' "$SKILL_DIR/SKILL.md")"
  case "$desc_line" in
    description:\ \'*) pass "frontmatter 冒号启发式通过（description 已引号包裹；无 js-yaml 降级门）" ;;
    *":\ "*) fail "description 疑似含未加引号的 ASCII ': '（降级启发式命中；装 js-yaml 或在仓库跑 selfcheck 精确判定）" ;;
    *) pass "frontmatter 冒号启发式通过（未见 ASCII ': '；无 js-yaml 降级门）" ;;
  esac
fi

# 2d. 本机副本一致性（元坑⑲副本滞后两次发作均靠体检发现；CI/无副本环境自动跳过）
#     2026-10-26 升级：仓库环境下比整文件 shasum（version 行相同但内容旧的副本曾静默过门——~/Doubao 残留实录）
if [ -f "$REPO_ROOT/CHANGELOG.md" ] && [ -n "${SKILL_VERSION:-}" ]; then
  COPY_FOUND=0; COPY_BAD=0
  SRC_SKILL="$REPO_ROOT/skills/pitfall-expert/SKILL.md"
  # 门清单与 sync-all-agents.sh 的 TARGET_SKILL_DIRS 必须同源（元坑⑲：两处硬编码=两个漂移面，本行已三次发作）
  for cdir in "$HOME/.agents/skills/pitfall-expert" "$HOME/.claude/skills/pitfall-expert" "$HOME/.workbuddy/skills/pitfall-expert" "$HOME/.workbuddy-ai/skills/pitfall-expert" "$HOME/.dsh/skills/pitfall-expert" "$HOME/.codex/skills/pitfall-expert" "$HOME/.agnes/skills/pitfall-expert" "$HOME/Library/Application Support/Doubao/Profile 1/.doubao/agent_mode/workspace/.skills/pitfall-expert"; do
    if [ -d "$cdir" ] && [ -f "$cdir/SKILL.md" ]; then
      COPY_FOUND=$((COPY_FOUND + 1))
      if [ -f "$SRC_SKILL" ] && command -v shasum >/dev/null 2>&1; then
        # 仓库环境：整文件比对（内容盲区关闭）
        if [ "$(shasum "$cdir/SKILL.md" | cut -d' ' -f1)" != "$(shasum "$SRC_SKILL" | cut -d' ' -f1)" ]; then
          fail "副本内容漂移：${cdir}/SKILL.md 与仓库源不一致——重跑 sync-all-agents.sh（version 相同内容旧也会被抓）"
          COPY_BAD=1
        fi
      else
        # 副本环境降级：比 version 行（无源可比）
        CV=$(grep -m1 '^  version:' "$cdir/SKILL.md" 2>/dev/null | sed 's/^  version:[[:space:]]*//')
        if [ -n "${CV:-}" ] && [ "$CV" != "$SKILL_VERSION" ]; then
          fail "副本版本漂移：${cdir} 停在 ${CV} ≠ 仓库 ${SKILL_VERSION}——重跑 install.sh 刷新（元坑⑲：副本滞后静默发作）"
          COPY_BAD=1
        fi
      fi
    fi
  done
  if [ $COPY_FOUND -eq 0 ]; then
    pass "副本一致性：本机无已装副本（CI 环境），跳过"
  elif [ $COPY_BAD -eq 0 ]; then
    if [ -f "$SRC_SKILL" ]; then
      pass "副本一致性：${COPY_FOUND} 个本机副本 SKILL.md 与仓库源逐字节一致（shasum）"
    else
      pass "副本一致性：${COPY_FOUND} 个本机副本全部 = ${SKILL_VERSION}"
    fi
  fi
fi

# 3. 机制与硬约束锚点（M13 验证器铸造 + 元坑登记簿为融合版独有）
for anchor in "M13 | 验证器铸造" "元坑登记簿" "纸老虎"; do
  grep -q "$anchor" "$SKILL_DIR/SKILL.md" && pass "SKILL.md 含关键锚点：$anchor" || fail "SKILL.md 缺锚点：$anchor"
done

# 4. node 可用 + 引擎存在（技能副本不随附引擎——副本环境跳过引擎项；常红的门会教人无视红灯，同 ⑰号门副本跳过先例）
command -v "$NODE_BIN" >/dev/null 2>&1 && pass "node 可用（${NODE_BIN}）" || fail "找不到 node（可用 NODE_BIN 指定路径）"
if [ -f "$REPO_ROOT/CHANGELOG.md" ]; then
  [ -f "$ENGINE_DIR/src/cli.js" ] && pass "引擎 CLI 存在" || fail "引擎缺失：$ENGINE_DIR/src/cli.js（可用 PITFALL_ENGINE_DIR 指定）"
else
  [ -f "$ENGINE_DIR/src/cli.js" ] && pass "引擎 CLI 存在（副本环境外挂引擎）" || pass "引擎检查：技能副本不随附引擎（模型读卡模式不受影响），已跳过"
fi

# 5. 坑卡库加载（引擎严格校验：12 必填字段 + 枚举值 + S/O/D）
if command -v "$NODE_BIN" >/dev/null 2>&1 && [ -f "$ENGINE_DIR/src/scanner.js" ]; then
  OUT=$("$NODE_BIN" -e "const{loadCards}=require('$ENGINE_DIR/src/scanner.js');const r=loadCards('$CARDS_DIR');console.log(r.cards.length);if(r.errors.length){console.error(JSON.stringify(r.errors));process.exit(1)}" 2>&1)
  RC=$?
  if [ $RC -eq 0 ]; then
    CARD_COUNT="$OUT"
    pass "坑卡库加载：${OUT} 张全部通过严格校验"
  else
    fail "坑卡校验失败：${OUT}"
  fi
  [ "${OUT:-0}" -ge 40 ] && pass "坑卡规模 ≥40（当前 ${OUT}）" || fail "坑卡规模异常：${OUT}（预期 ≥40）"
fi

# 5b. 卡数一致性（元坑⑲同类第二案：v0.7.7 卡库 121→125，8 个文件 11 处写死 120 静默漂移——README、package.json、
#     引擎英文报告 glossary、MCP 工具描述、⑰号门电池元数据全在列。基准是上面 loadCards 实数，不引入第二个手工数字；无引擎的副本环境跳过（同 ⑰号门先例）。
#     2026-10-31 第三案扩门：v0.7.13 新增的市场字段（SKILL.md description_zh/_en + manifest.json description）当时不在门内，
#     RD-030 补记「全仓 117→118」扫了门内 7 文件漏了门外 2 文件——写死面新增位置必须同步进本门清单）
if [ -n "${CARD_COUNT:-}" ]; then
  README_COUNT_BAD=0
  for rf in "$REPO_ROOT/README.md" "$REPO_ROOT/README.zh-CN.md" "$REPO_ROOT/package.json" \
            "$REPO_ROOT/engine/src/report.js" "$REPO_ROOT/engine/src/index.js" "$REPO_ROOT/eval/battery.json" \
            "$REPO_ROOT/docs/入门版-贴即用.md" \
            "$REPO_ROOT/skills/pitfall-expert/SKILL.md" "$REPO_ROOT/skills/pitfall-expert/manifest.json"; do
    [ -f "$rf" ] || continue
    # 已知写死形态：徽章 pitfall_cards-N｜N 张坑卡｜N pitfall cards｜N cards checked｜N evidence-backed pitfall cards｜
    # N-card library｜卡库 N 张｜library (N cards)｜_cardCount: N｜N 张带出处的坑卡（市场文案）｜N evidence-backed cards（市场文案）
    # （「100+ 张」非精确表述不匹配、不管）
    for num in $(sed -n \
      -e 's/.*pitfall_cards-\([0-9][0-9]*\).*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\)[[:space:]]*张坑卡.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\)[[:space:]]*张带出处的坑卡.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\) pitfall cards.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\) cards checked.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\) evidence-backed pitfall cards.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\) evidence-backed cards.*/\1/p' \
      -e 's/.*[^0-9]\([0-9][0-9]*\)-card .*/\1/p' \
      -e 's/.*卡库[[:space:]]*\([0-9][0-9]*\)[[:space:]]*张.*/\1/p' \
      -e 's/.*library (\([0-9][0-9]*\) cards).*/\1/p' \
      -e 's/.*_cardCount": \([0-9][0-9]*\).*/\1/p' \
      "$rf" | sort -u); do
      [ "$num" = "$CARD_COUNT" ] || { fail "卡数漂移：$(basename "$rf") 写死 ${num} ≠ loadCards 实数 ${CARD_COUNT}（元坑⑲）"; README_COUNT_BAD=1; }
    done
  done
  [ $README_COUNT_BAD -eq 0 ] && pass "卡数一致：README*/package.json/引擎/电池/入门版/市场文案(SKILL+manifest) 写死数字全部 = ${CARD_COUNT}"
fi

# 6. 冒烟扫描（英文任务 + 中文任务各一次，验证双语 triggers）+ 三区齐备断言
if [ -f "$ENGINE_DIR/src/cli.js" ] && command -v "$NODE_BIN" >/dev/null 2>&1; then
  OUT=$("$NODE_BIN" "$ENGINE_DIR/src/cli.js" "帮我把 users.csv 按省份汇总人数，注意空值和重复行" --tier standard 2>&1)
  RC=$?
  [ $RC -eq 0 ] && pass "冒烟扫描（中文任务）退出码 0" || fail "冒烟扫描失败（exit=${RC}）：${OUT}"
  for zone in "✅" "❓" "🚫"; do
    echo "$OUT" | grep -q "$zone" && pass "报告含三区标记 $zone" || fail "报告缺三区标记 $zone"
  done
  echo "$OUT" | grep -q "CODE-013" && pass "冒烟任务命中预期坑卡 CODE-013" || fail "冒烟任务未命中 CODE-013"
  # 英文任务：验证英文 triggers 生效（元坑⑩回归测试）
  OUT_EN=$("$NODE_BIN" "$ENGINE_DIR/src/cli.js" "migrate our pricing data, careful with timezone and float rounding" --tier standard 2>&1)
  RC_EN=$?
  [ $RC_EN -eq 0 ] && pass "冒烟扫描（英文任务）退出码 0" || fail "英文任务扫描失败（exit=${RC_EN}）：${OUT_EN}"
  echo "$OUT_EN" | grep -qE "CODE-00[19]|CODE-011" && pass "英文任务命中预期坑卡（timezone/float）" || fail "英文任务未命中 CODE-009/CODE-011（双语 triggers 失效？）"
fi

# 7. 报告机检自测（合格样例应通过，不合格样例应被拒，T0 紧凑样例应通过）
if command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  "$PYTHON_BIN" "$SKILL_DIR/scripts/dod_check.py" "$SKILL_DIR/tests/sample-pass.md" >/dev/null 2>&1 && pass "dod_check：合格样例通过" || fail "dod_check：合格样例被误判失败"
  "$PYTHON_BIN" "$SKILL_DIR/scripts/dod_check.py" "$SKILL_DIR/tests/sample-fail.md" >/dev/null 2>&1 && fail "dod_check：不合格样例被误判通过" || pass "dod_check：不合格样例正确被拒"
  "$PYTHON_BIN" "$SKILL_DIR/scripts/dod_check.py" "$SKILL_DIR/tests/sample-t0.md" >/dev/null 2>&1 && pass "dod_check：T0 紧凑样例通过（豁免逻辑正确）" || fail "dod_check：T0 样例被误判失败（豁免逻辑坏）"
else
  fail "找不到 python3（可用 PYTHON_BIN 指定路径）"
fi

# 8. ⑰号门回归（跨域误命中不增；元坑⑰）
# 仅在仓库根运行时做（技能目录副本里没有 eval/，跳过是正确行为，不是失败）
REPO_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
if [ -f "$REPO_ROOT/eval/gate.js" ] && [ -f "$REPO_ROOT/eval/battery.json" ]; then
  GATE_OUT=$("$NODE_BIN" "$REPO_ROOT/eval/gate.js" 2>&1)
  GATE_RC=$?
  if [ $GATE_RC -eq 0 ]; then
    pass "⑰号门：跨域误命中增量 0"
  else
    fail "⑰号门失败（exit=${GATE_RC}）：$(echo "$GATE_OUT" | tail -3)"
  fi
else
  pass "⑰号门：无 eval/ 目录（技能副本），已跳过"
fi

echo "== 结果：$([ $FAIL -eq 0 ] && echo 全部通过 || echo 存在失败项) =="
exit $FAIL
