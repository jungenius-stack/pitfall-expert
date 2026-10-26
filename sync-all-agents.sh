#!/bin/sh
# pitfall-expert 全 agent 同步器（个人机版，install.sh 的超集；仓库是真源，本脚本只做分发）
# 用法：sh sync-all-agents.sh            同步（幂等；无漂移的目标零写入）
#       sh sync-all-agents.sh --check    只报告漂移，不写任何东西
# 组装规则与 install.sh 完全一致：skills/pitfall-expert/* + 仓库根 cards/ → 目标/pitfall-expert/cards/
# 新 agent 落地后：其家目录存在即自动纳入（TARGET_PARENTS 加一行）。
set -u

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILL_SRC="$REPO_ROOT/skills/pitfall-expert"
CARDS_SRC="$REPO_ROOT/cards"
NAME="pitfall-expert"
CHECK_ONLY="${1:-}"
BACKUP_ROOT="$HOME/.pitfall-sync-backups"
KEEP_BACKUPS=24

# 目标 = 父目录（agent 家目录）存在即同步其 skills/。映射依据见 docs/cases 与提交记录：
#   ~/.agents        ZCode（读此标准目录）
#   ~/.claude        Claude Code
#   ~/.dsh           DeepSeek harness（asar 证实扫 ~/.dsh/skills 与 ~/.agents/skills）
#   ~/.codex         codex
#   ~/.workbuddy     workbuddy 中国版（com.tencent.workbuddy.mac，renderer 5.8.3 ↔ app 5.8.3）
#   ~/.workbuddy-ai  workbuddy 国际版（com.workbuddy.workbuddy-ai，renderer 5.8.4 ↔ app 5.8.4）
#   ~/.agnes         Agnes code（agnesd 二进制原文：saves to ~/.agnes/skills，$name 调用）
#   豆包 agent_mode 真技能目录 .skills/（含 111 个官方技能；路径含空格——列表必须按行读）
# 注意：~/Doubao/skills 是死目录（豆包自建后从未使用），已从目标移除
# 列表项 = 技能目录全路径（非父目录），豆包的 .skills 带点前缀由此直接表达
TARGET_SKILL_DIRS="$HOME/.agents/skills
$HOME/.claude/skills
$HOME/.dsh/skills
$HOME/.codex/skills
$HOME/.workbuddy/skills
$HOME/.workbuddy-ai/skills
$HOME/.agnes/skills
$HOME/Library/Application Support/Doubao/Profile 1/.doubao/agent_mode/workspace/.skills"

fail() { printf '同步失败：%s\n' "$*" >&2; exit 1; }

[ -f "$SKILL_SRC/SKILL.md" ] || fail "真源缺失 $SKILL_SRC/SKILL.md（请在仓库根目录运行）"
[ -d "$CARDS_SRC" ] || fail "卡库缺失 $CARDS_SRC"

# 组装本次待分发内容（.DS_Store 不参与漂移判定）
STAGE="$(mktemp -d)" || fail "mktemp"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$SKILL_SRC" "$STAGE/$NAME" || fail "复制技能源失败"
cp -R "$CARDS_SRC" "$STAGE/$NAME/cards" || fail "复制卡库失败"
find "$STAGE" -name .DS_Store -delete

CARD_TOTAL="$(awk '/^card_count:/{s+=$2} END{print s+0}' "$STAGE/$NAME/cards"/*.yaml 2>/dev/null)"
STAMP="SKILL.md $(shasum "$STAGE/$NAME/SKILL.md" | cut -c1-12) | cards ${CARD_TOTAL} 张/$(ls "$STAGE/$NAME/cards"/*.yaml 2>/dev/null | wc -l | tr -d ' ') 域（动态读 card_count，不写死） | $(date '+%F %T')"
printf '真源版本：%s\n' "$STAMP"

# 源健康门（红队对抗 2026-10-26 补：坏源曾可直通分发到全部目标）
# 门1 卡库非空；门2 frontmatter 严格可解析（js-yaml 可达时），降级=冒号启发式并声明
[ "${CARD_TOTAL:-0}" -gt 0 ] || fail "卡库为空（card_count 求和=0）——拒绝分发空库"
JSYAML=""
if command -v node >/dev/null 2>&1; then
  for c in "$REPO_ROOT/engine/node_modules/js-yaml" "$(npm root -g 2>/dev/null)/js-yaml"; do
    [ -d "$c" ] && JSYAML="$c" && break
  done
fi
if [ -n "$JSYAML" ]; then
  node -e "const y=require('$JSYAML');const fs=require('fs');y.load(fs.readFileSync('$STAGE/$NAME/SKILL.md','utf8').split(/^---\$/m)[1])" \
    || fail "源健康门：SKILL.md frontmatter 严格 YAML 解析失败——拒绝分发坏源（常见因：纯量含 ASCII ': '）"
  printf '源健康门：严格解析通过（js-yaml）\n'
else
  desc_line="$(grep -m1 '^description:' "$STAGE/$NAME/SKILL.md")"
  case "$desc_line" in
    description:\ \'*) printf '源健康门：冒号启发式通过（降级——未找到 js-yaml）\n' ;;
    *": "*) fail "源健康门：description 疑似含未加引号 ASCII ': '（降级启发式命中）——拒绝分发坏源" ;;
    *) printf '源健康门：冒号启发式通过（降级——未找到 js-yaml）\n' ;;
  esac
fi

sync_one() {
  skills_dir="$1"; parent="$(dirname "$skills_dir")"; target="$skills_dir/$NAME"
  if [ ! -d "$parent" ]; then
    printf 'SKIP(无此agent目录) %s\n' "$parent"
    return 0
  fi
  if [ ! -d "$target" ]; then
    drift=ABSENT   # 没装 ≠ 无漂移（缺省行为陷阱：不存在必须显式区分）
  elif diff -rq -x .DS_Store "$STAGE/$NAME" "$target" >/dev/null 2>&1; then
    drift=CLEAN
  else
    drift=DRIFT
  fi
  [ "$drift" = CLEAN ] && { printf 'OK(无变化)    %s\n' "$target"; return 0; }
  [ "$CHECK_ONLY" = "--check" ] && { printf '%s(待处理) %s\n' "$drift" "$target"; return 0; }

  # 覆盖前留档（旧副本整目录快照，防本地私改被静默冲掉；标签用去斜杠路径防重名）
  # fail-closed：备份不成功就不覆盖（2026-10-26 08:33 备份静默缺失实录——2>/dev/null 吞错曾使失败不可见）
  if [ -d "$target" ]; then
    label="$(printf '%s' "$skills_dir" | sed "s|^$HOME/||; s|/|_|g")"
    bdir="$BACKUP_ROOT/$(date '+%Y%m%d-%H%M%S')-${label}"
    if ! { mkdir -p "$bdir" && cp -R "$target" "$bdir/$NAME"; } 2>/dev/null; then
      printf 'BACKUP-FAIL    %s（留档失败，跳过覆盖保住旧副本；请人工检查 %s）\n' "$target" "$BACKUP_ROOT"
      return 0
    fi
  fi
  mkdir -p "$skills_dir" || fail "无法创建 $skills_dir"
  # 原地更新（rsync -c 按校验和跳过未变文件）：目标目录 inode 不换、未变文件不触碰——
  # 运行中 agent 的技能目录 watcher 不会看到「卸载再安装」（rm -rf+cp 窗口曾致 DSH 目录条目丢失，2026-10-26 上午实录）
  if command -v rsync >/dev/null 2>&1; then
    rsync -a -c --delete --exclude='.DS_Store' "$STAGE/$NAME/" "$target/" || fail "rsync 写入 $target 失败"
  else
    rm -rf "$target"
    cp -R "$STAGE/$NAME" "$target" || fail "写入 $target 失败（无 rsync，退化 rm+cp——目标 agent 若在运行可能丢目录条目）"
  fi
  # 写后即验（M11）：分发副本必须与组装内容逐字节一致
  if diff -rq -x .DS_Store "$STAGE/$NAME" "$target" >/dev/null 2>&1; then
    printf 'SYNCED        %s\n' "$target"
  else
    printf 'VERIFY-FAIL   %s\n' "$target"
    exit 1
  fi
}

# IFS=仅换行：按行取目标（路径含空格安全），且 for 在当前 shell 跑——VERIFY-FAIL 的 exit 1 熔断有效
OLD_IFS="$IFS"
IFS='
'
for p in $TARGET_SKILL_DIRS; do
  [ -n "$p" ] && sync_one "$p"
done
IFS="$OLD_IFS"

# 备份轮转：按份数留档。KEEP 必须大于目标数（一轮全量刷新就产生 8 份，
# 留太少会把本轮刚生成的备份在同一轮里删掉——2026-10-25 首跑实测踩过）
# 备份轮转：只留最近 KEEP_BACKUPS 份
if [ -d "$BACKUP_ROOT" ]; then
  ls -1t "$BACKUP_ROOT" 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | while IFS= read -r old; do
    rm -rf "$BACKUP_ROOT/$old"
  done
fi
printf 'DONE %s\n' "${CHECK_ONLY:+(check-only)}"
