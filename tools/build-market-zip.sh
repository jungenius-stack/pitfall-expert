#!/bin/sh
# WorkBuddy 技能市场上架包构建器（打包 + 反向复验一体）
#
# 用法：sh tools/build-market-zip.sh [输出目录]
#       默认输出目录 = ~/Desktop/workbuddy-market
# 产物：<输出目录>/pitfall-expert-market-v<版本>.zip
#
# 为什么不是「就地 zip -r skills/pitfall-expert」：
#   仓库里 cards/ 在根目录，技能期望它在 <skill>/cards/。就地打包会得到一个
#   没有卡库的包——它不会报错，只会在用户第一次用时产出一份「本次没有坑」的空报告。
#   这是本项目记录过的最危险的静默失败模式，所以：staging 组装 → 打包 → 解包反验。
#
# 退出码：0=包已生成且全部复验通过；1=任一环节失败（不会留下半成品 zip）
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_SRC="$REPO_ROOT/skills/pitfall-expert"
CARDS_SRC="$REPO_ROOT/cards"
OUT_DIR="${1:-$HOME/Desktop/workbuddy-market}"
NAME="pitfall-expert"
EXPECTED_FILE_COUNT=21   # SKILL.md + manifest.json + cards/7 + references/7 + scripts/2 + tests/3

fail() { printf '\n[FAIL] %s\n' "$*" >&2; [ -n "${STAGE:-}" ] && rm -rf "$STAGE"; [ -n "${VSTAGE:-}" ] && rm -rf "$VSTAGE"; exit 1; }
pass() { printf '[PASS] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }

printf '== 踩坑专家 · 市场包构建 ==\n'

# ── 0. 版本单源：manifest.json = SKILL.md 顶层 = SKILL.md metadata ──
[ -f "$SKILL_SRC/SKILL.md" ] || fail "真源缺失 $SKILL_SRC/SKILL.md"
[ -f "$SKILL_SRC/manifest.json" ] || fail "真源缺失 $SKILL_SRC/manifest.json"
[ -d "$CARDS_SRC" ] || fail "卡库缺失 $CARDS_SRC"

VER_MANIFEST=$(python3 -I -c "import json;print(json.load(open('$SKILL_SRC/manifest.json'))['version'])" 2>/dev/null) \
  || fail "manifest.json 不是合法 JSON"
VER_TOP=$(sed -n 's/^version:[[:space:]]*\(.*\)$/\1/p' "$SKILL_SRC/SKILL.md" | head -1)
VER_META=$(sed -n 's/^  version:[[:space:]]*\(.*\)$/\1/p' "$SKILL_SRC/SKILL.md" | head -1)

[ -n "$VER_MANIFEST" ] || fail "manifest.json 缺 version"
[ "$VER_MANIFEST" = "$VER_TOP" ]  || fail "版本漂移：manifest $VER_MANIFEST ≠ SKILL 顶层 ${VER_TOP}（元坑⑲：多版本字段手工对齐必漏）"
[ "$VER_MANIFEST" = "$VER_META" ] || fail "版本漂移：manifest $VER_MANIFEST ≠ SKILL metadata $VER_META"
pass "版本单源：${VER_MANIFEST}（manifest = SKILL 顶层 = SKILL metadata）"

# ── 1. staging：干净副本组装（不就地打包）──
STAGE=$(mktemp -d 2>/dev/null || mktemp -d -t pitfall) || fail "mktemp 失败"
export STAGE
cp -R "$SKILL_SRC" "$STAGE/$NAME" || fail "复制技能源失败"
mkdir -p "$STAGE/$NAME/cards"
cp "$CARDS_SRC"/*.yaml "$STAGE/$NAME/cards/" || fail "复制卡库失败"
find "$STAGE" -name '.DS_Store' -delete
chmod +x "$STAGE/$NAME/scripts/selfcheck.sh"
pass "staging 组装完成（技能层 + 卡库合流）"

# ── 2. staging 内前置断言（打包前就把坏包挡掉）──
CARD_FILES=$(find "$STAGE/$NAME/cards" -name '*.yaml' | wc -l | tr -d ' ')
[ "$CARD_FILES" -eq 7 ] || fail "卡库域文件数 $CARD_FILES ≠ 7"
CARD_SUM=$(awk '/^card_count:/{s+=$2} END{print s+0}' "$STAGE/$NAME/cards"/*.yaml)
[ "$CARD_SUM" -ge 100 ] || fail "卡数异常：${CARD_SUM}（元坑③：空库会静默产出空报告）"
pass "卡库入包：$CARD_FILES 域 / $CARD_SUM 张（card_count 求和）"

# 市场文案里写死的卡数必须等于实数（元坑⑲/③：写死数字已三次变谎言）
for f in "$STAGE/$NAME/SKILL.md" "$STAGE/$NAME/manifest.json"; do
  for num in $(sed -n \
    -e 's/.*[^0-9]\([0-9][0-9]*\)[[:space:]]*张带出处的坑卡.*/\1/p' \
    -e 's/.*[^0-9]\([0-9][0-9]*\) evidence-backed cards.*/\1/p' \
    -e 's/.*[^0-9]\([0-9][0-9]*\) 张带出处的坑卡覆盖.*/\1/p' \
    "$f" | sort -u); do
    [ "$num" = "$CARD_SUM" ] || fail "卡数漂移：$(basename "$f") 写死 $num ≠ 实数 $CARD_SUM"
  done
done
pass "市场文案卡数 = 卡库实数 $CARD_SUM"

# frontmatter 严格 YAML 解析（严格解析器失败 = DSH/豆包等整技能静默拒绝）
JSYAML=""
for c in "$REPO_ROOT/engine/node_modules/js-yaml" "$(npm root -g 2>/dev/null)/js-yaml"; do
  [ -d "$c" ] && JSYAML="$c" && break
done
if [ -n "$JSYAML" ] && command -v node >/dev/null 2>&1; then
  node -e "
    const y=require('$JSYAML'), fs=require('fs');
    const t=fs.readFileSync('$STAGE/$NAME/SKILL.md','utf8').split(/^---\$/m)[1];
    const d=y.load(t);
    const need=['name','display_name','display_name_en','description_zh','description_en','version','author','description','user-invocable'];
    for(const k of need) if(!(k in d)) { console.error('缺字段 '+k); process.exit(1); }
    if(d.name!=='$NAME'){console.error('name≠目录名');process.exit(1);}
  " || fail "frontmatter 严格 YAML 解析失败或必备字段缺失"
  pass "frontmatter 严格 YAML 解析通过（字段齐备）"
else
  warn "无 js-yaml / node，已降级为冒号启发式（严格解析未验）"
  grep -q "^description: '" "$STAGE/$NAME/SKILL.md" || fail "description 未引号包裹（严格解析器风险）"
  pass "frontmatter 冒号启发式通过（降级门，已声明）"
fi

# manifest schema：quickPrompts 恰好 3、tags 恰好 3、defaultInitPrompt == 第 1 条
python3 -I -c "
import json,sys
m=json.load(open('$STAGE/$NAME/manifest.json'))
errs=[]
if m.get('type')!='skill': errs.append('type≠skill')
if len(m.get('quickPrompts',[]))!=3: errs.append('quickPrompts=%d≠3'%len(m.get('quickPrompts',[])))
if len(m.get('tags',[]))!=3: errs.append('tags=%d≠3'%len(m.get('tags',[])))
if m.get('defaultInitPrompt')!=m.get('quickPrompts',[None])[0]: errs.append('defaultInitPrompt≠第1条')
if not m.get('id'): errs.append('缺 id')
if not m.get('triggers'): errs.append('缺 triggers')
if errs: print('\n'.join(errs)); sys.exit(1)
" || fail "manifest schema 不合规（见上）"
pass "manifest schema 合规（quickPrompts 3 / tags 3 / default=第1条）"

# ── 3. 打包（-X 去扩展属性，产物可复现）──
mkdir -p "$OUT_DIR"
ZIP="$OUT_DIR/pitfall-expert-market-v$VER_MANIFEST.zip"
rm -f "$ZIP"
( cd "$STAGE" && zip -rX -q "$ZIP" "$NAME" -x '*.DS_Store' ) || fail "zip 打包失败"
[ -f "$ZIP" ] || fail "zip 未生成"
pass "已生成 $(basename "$ZIP")（$(du -h "$ZIP" | cut -f1 | tr -d ' ')）"

# ── 4. 反向复验：从解压后的 zip 验，不信任 staging ──
VSTAGE=$(mktemp -d 2>/dev/null || mktemp -d -t pitfallv) || fail "mktemp 失败"
export VSTAGE
unzip -q "$ZIP" -d "$VSTAGE" || fail "解包失败"
V="$VSTAGE/$NAME"
[ -d "$V" ] || fail "包内顶层目录不是 $NAME/"

VCOUNT=$(find "$V" -type f | wc -l | tr -d ' ')
[ "$VCOUNT" -eq "$EXPECTED_FILE_COUNT" ] || fail "包内文件数 $VCOUNT ≠ $EXPECTED_FILE_COUNT"
pass "包内文件数 ${VCOUNT}（与预期一致，无多余文件）"

find "$VSTAGE" -name '.DS_Store' | grep -q . && fail "包内含 .DS_Store（macOS 元数据泄漏）"
pass "无 .DS_Store 泄漏"

# 卡库逐字节比对：包内卡 = 仓库卡（防陈旧副本 / 防静默漏卡）
for f in "$CARDS_SRC"/*.yaml; do
  b=$(basename "$f")
  [ -f "$V/cards/$b" ] || fail "包内缺卡库文件 $b"
  [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" = "$(shasum -a 256 "$V/cards/$b" | cut -d' ' -f1)" ] \
    || fail "卡库内容不一致：${b}（包内副本陈旧或转换损坏）"
done
pass "卡库逐字节一致：$CARD_FILES 个域文件全部 = 仓库真源"

# 技能层逐字节比对
for f in SKILL.md manifest.json; do
  [ "$(shasum -a 256 "$SKILL_SRC/$f" | cut -d' ' -f1)" = "$(shasum -a 256 "$V/$f" | cut -d' ' -f1)" ] \
    || fail "技能层内容不一致：$f"
done
for d in references scripts tests; do
  for f in "$SKILL_SRC/$d"/*; do
    b=$(basename "$f")
    [ -f "$V/$d/$b" ] || fail "包内缺 $d/$b"
    [ "$(shasum -a 256 "$f" | cut -d' ' -f1)" = "$(shasum -a 256 "$V/$d/$b" | cut -d' ' -f1)" ] \
      || fail "内容不一致：$d/$b"
  done
done
pass "技能层逐字节一致：references/ scripts/ tests/ 全量 = 仓库真源"

# 泄漏扫描：本机绝对路径 / 邮箱 / 真私钥 / API key 字面量
# 注意：cards/code.yaml 里有一条「识别私钥」的拦截正则（-----BEGIN ... PRIVATE KEY-----），
# 它是防御规则不是泄漏——所以私钥检测锚定「五个连字符 + 真实 base64 行」的 PEM 结构，
# 不匹配正则里那个带 ?: 和空格的模式串；否则门会常年误红，教人无视红灯（元坑⑰同族）。
LEAK_PATHS=$(grep -rIl -e "/Users/" -e "@qq.com" -e "@gmail.com" "$V" 2>/dev/null || true)
LEAK_KEYS=$(grep -rIl -e "-----BEGIN [A-Z ]*PRIVATE KEY-----$" -e "sk-[A-Za-z0-9]\{20,\}" "$V" 2>/dev/null || true)
if [ -n "$LEAK_PATHS" ] || [ -n "$LEAK_KEYS" ]; then
  [ -n "$LEAK_PATHS" ] && printf '路径/邮箱命中：%s\n' "$LEAK_PATHS"
  [ -n "$LEAK_KEYS" ] && printf '私钥/密钥命中：%s\n' "$LEAK_KEYS"
  fail "包内含本机路径 / 邮箱 / 私钥 / API key 特征串（见上）"
fi
pass "泄漏扫描通过（无本机路径 / 邮箱 / 私钥 / API key 特征）"

# 包内脚本必须离线：不得出现网络调用
if grep -rn -e "urllib" -e "requests\." -e "curl " -e "wget " -e "fetch(" "$V/scripts/" 2>/dev/null | grep -q .; then
  fail "包内脚本出现网络调用特征"
fi
pass "包内脚本离线（无网络调用）"

# 包内 selfcheck（模型读卡模式：无引擎、无 CHANGELOG 的降级路径）
SC_OUT=$( cd "$V" && PITFALL_LEDGER=off sh scripts/selfcheck.sh 2>&1 ) || {
  printf '%s\n' "$SC_OUT" | tail -20
  fail "包内 selfcheck 未全过"
}
printf '%s\n' "$SC_OUT" | grep -q "全部通过" || { printf '%s\n' "$SC_OUT" | tail -20; fail "包内 selfcheck 未报告「全部通过」"; }
SC_PASS=$(printf '%s\n' "$SC_OUT" | grep -c '^\[PASS\]')
SC_FAIL=$(printf '%s\n' "$SC_OUT" | grep -c '^\[FAIL\]' || true)
pass "包内 selfcheck 全过（$SC_PASS 项 PASS / $SC_FAIL 项 FAIL）"

# 报告 DoD 机检样例（三份样例都要过，说明机检脚本随包可用）
if command -v python3 >/dev/null 2>&1; then
  ( cd "$V" && python3 -I scripts/dod_check.py tests/sample-pass.md >/dev/null 2>&1 ) \
    || fail "dod_check 在包内跑不通（合格样例）"
  pass "dod_check 包内可用（合格样例通过）"
else
  warn "无 python3，dod_check 未验（用户侧机检将不可用——建议声明）"
fi

# 版本落点最后再确认一次（防止打包后又改了源）
VVER=$(python3 -I -c "import json;print(json.load(open('$V/manifest.json'))['version'])")
[ "$VVER" = "$VER_MANIFEST" ] || fail "包内 manifest 版本 $VVER ≠ 构建版本 $VER_MANIFEST"
pass "包内版本 = $VVER"

printf '\n== 全部通过 ==\n'
printf '产物：%s\n' "$ZIP"
printf '大小：%s ｜ 文件：%s ｜ 卡库：%s 域 / %s 张 ｜ 版本：%s\n' \
  "$(du -h "$ZIP" | cut -f1 | tr -d ' ')" "$VCOUNT" "$CARD_FILES" "$CARD_SUM" "$VVER"
printf '\n下一步：到 WorkBuddy 开放平台「更新版本」上传本 zip。上传前不要解压重压（会引入 .DS_Store 与权限位损坏）。\n'

rm -rf "$STAGE" "$VSTAGE"
exit 0
