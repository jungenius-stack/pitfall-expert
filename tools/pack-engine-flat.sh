#!/bin/sh
# 把仓库引擎压平成"两级目录"结构，供 WorkBuddy 市场包使用（2026-11-23）
#
# 为什么需要：市场平台只接受 skill 包内的两级目录（根/二级/文件）。
# 仓库的 engine/src/*.js 是二级（engine/src/file）——等等，这是三级：
#   <skill>/engine/src/scanner.js
# 而 node_modules/js-yaml/dist/js-yaml.cjs.js 是四级。
# 平台拒绝。
#
# 压平方案（不改仓库源码，只在打包 staging 里做）：
#   <skill>/engine/scanner.js        ← engine/src/scanner.js（原地升级一级）
#   <skill>/engine/report.js
#   <skill>/engine/cli.js
#   <skill>/engine/gate-core.cjs
#   <skill>/engine/js-yaml.cjs       ← js-yaml 单文件版（自包含 136KB）
#
# 转换内容：
#   1. require('./scanner') 等相对引用不变（同目录，仍然有效）
#   2. require('js-yaml') → require('./js-yaml.cjs')
#   3. require('../package.json') → 读同目录 engine-version.json，或内联常量
#   4. index.js（MCP server）不带——它需要 28M 的 MCP SDK，市场版用不上
#
# 用法：sh tools/pack-engine-flat.sh <目标engine目录>
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "用法：sh tools/pack-engine-flat.sh <目标engine目录>" >&2; exit 2; }

SRC="$REPO_ROOT/engine/src"
YAML_SINGLE="$REPO_ROOT/engine/node_modules/js-yaml/dist/js-yaml.cjs.js"

[ -f "$SRC/scanner.js" ] || { echo "缺 engine/src/scanner.js" >&2; exit 1; }
[ -f "$YAML_SINGLE" ] || { echo "缺 js-yaml 单文件版：$YAML_SINGLE" >&2; exit 1; }

mkdir -p "$TARGET"

# 1) 复制需要的四个文件（不含 index.js：依赖 MCP SDK）
for f in scanner.js report.js cli.js gate-core.cjs; do
  cp "$SRC/$f" "$TARGET/$f" || { echo "复制 $f 失败" >&2; exit 1; }
done

# 2) js-yaml 单文件版落位（文件名带 .cjs 后缀，明确是 CommonJS）
cp "$YAML_SINGLE" "$TARGET/js-yaml.cjs"

# 3) 版本号内联，替代 require('../package.json')
ENGINE_VER=$(node -e "console.log(require('$REPO_ROOT/engine/package.json').version)")
printf '{ "version": "%s" }\n' "$ENGINE_VER" > "$TARGET/version.json"

# 4) 改写引用（只在目标副本里改，仓库源码不动）
node "$REPO_ROOT/tools/flatten-rewrite.cjs" "$TARGET" || { echo "改写引用失败" >&2; exit 1; }

# 5) 装完立即实测：必须在压平结构下读得出卡库
CARDS_ARG="${2:-}"
if [ -n "$CARDS_ARG" ] && [ -d "$CARDS_ARG" ]; then
  N=$(node -e "
    try {
      const {loadCards} = require('$TARGET/scanner.js');
      const r = loadCards('$CARDS_ARG');
      if (r.errors.length) { console.error(JSON.stringify(r.errors)); process.exit(1); }
      console.log(r.cards.length);
    } catch (e) { console.error(e.message); process.exit(1); }
  " 2>&1) || { echo "压平引擎自检失败：$N" >&2; exit 1; }
  echo "压平引擎就绪（$N 张卡可读）"
else
  echo "压平引擎已生成（未提供卡库目录，跳过实测）"
fi

# 6) 目录层级断言：必须全部是 <target>/<file> 两级
DEEP=$(find "$TARGET" -mindepth 2 -type f | head -5)
[ -z "$DEEP" ] || { echo "目录层级仍超限：" >&2; printf '%s\n' "$DEEP" >&2; exit 1; }
echo "层级检查通过：engine/ 下全部为单层文件"
