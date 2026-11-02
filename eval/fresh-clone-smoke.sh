#!/bin/sh
# 干净副本冒烟（发版前跑，需网络）——模拟新用户：零依赖目录 → sh install.sh → node engine/src/cli.js
#
# 背景（2026-11-02）：README 快速开始自 v0.4.4 起从未写 npm install，作者机永远装着依赖，
# 「干净克隆跑引擎崩 js-yaml 缺失」在作者机上不可见——只有在没有 node_modules 的目录里才暴露。
# 本脚本把工作树（不含 node_modules/.git）复制到临时目录当"新用户的下载"，所以提交前也能测。
#
# 判定表（前置）：
#   ① 复制后未装依赖，CLI 必须失败      ⇒ 证明依赖确实需要（反向失败=node_modules 泄漏进副本，判定失效）
#   ② install.sh 退出 0 且报告依赖就绪   ⇒ 引导生效
#   ③ 之后 CLI 产出「踩坑报告」          ⇒ 新用户路径打通
#   ④ install.sh 输出含 group 格式注册片段 ⇒ 踏板片段在岗
#   任一不满足 ⇒ exit 1；复制/克隆失败 ⇒ exit 2（未判定，不得当通过）
# 副作用：只写 /tmp 与一个临时 HOME（技能副本装进临时 HOME，不碰真实 ~/.agents 等）；PITFALL_LEDGER=off 不入账本。
set -u
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/pe-fresh.XXXXXX)" || { echo "[未判定] mktemp 失败"; exit 2; }
FAKE_HOME="$TMP/home"; mkdir -p "$FAKE_HOME/.agents" "$TMP/copy"
trap 'rm -rf "$TMP"' EXIT
export PITFALL_LEDGER=off

( cd "$REPO_ROOT" && tar --exclude=node_modules --exclude=.git --exclude='*/node_modules' -cf - . ) | ( cd "$TMP/copy" && tar -xf - ) \
  || { echo "[未判定] 复制工作树失败"; exit 2; }
cd "$TMP/copy" || exit 2
[ -d node_modules ] && { echo "[FAIL] 判定表 ① 失效：副本里带着 node_modules"; exit 1; }

if node engine/src/cli.js "冒烟" --tier quick >/dev/null 2>&1; then
  echo "[FAIL] ① 未装依赖却能跑——依赖从别处泄漏（NODE_PATH？全局模块？），判定失效"; exit 1
fi
echo "[PASS] ① 零依赖目录下 CLI 失败（符合预期：依赖确实需要）"

HOME="$FAKE_HOME" sh install.sh >"$TMP/install.log" 2>&1 || { echo "[FAIL] ② install.sh 退出非 0"; cat "$TMP/install.log"; exit 1; }
grep -q "引擎依赖已安装\|引擎依赖已就绪" "$TMP/install.log" && echo "[PASS] ② install.sh 引导了引擎依赖" \
  || { echo "[FAIL] ② install.sh 未报告依赖就绪（网络？）"; cat "$TMP/install.log"; exit 1; }

OUT=$(node engine/src/cli.js "迁移生产数据库，注意时区" --tier quick 2>&1)
echo "$OUT" | grep -q "踩坑报告" && echo "[PASS] ③ install.sh 之后 CLI 产出报告" || { echo "[FAIL] ③ CLI 无报告：$OUT"; exit 1; }

grep -q '"hooks": \[' "$TMP/install.log" && echo "[PASS] ④ install.sh 打印了 group 格式注册片段" || { echo "[FAIL] ④ 未打印注册片段"; exit 1; }
grep -q "$TMP/copy/hooks/pre-tool-use.sh" "$TMP/install.log" && echo "[PASS] ④ 片段里的路径是绝对路径且指向本副本" || { echo "[FAIL] ④ 片段路径不对"; exit 1; }

echo "== 干净副本冒烟：全部通过 =="
