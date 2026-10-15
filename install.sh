#!/bin/sh
# pitfall-expert 一键安装 / uninstall（抄 REA 的作业：安装零门槛是第一转化率）
# 用法：sh install.sh            安装/更新（幂等，重复跑=升级）
#       sh install.sh --uninstall
# 技能装到所有检测到的外壳技能目录；卡库随技能目录带副本（仓库是唯一真源）。
set -u

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILL_SRC="$REPO_ROOT/skills/pitfall-expert"
NAME="pitfall-expert"

say() { printf '%s\n' "$*"; }

uninstall() {
  found=0
  for dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.workbuddy/skills"; do
    if [ -d "${dir}/${NAME}" ]; then
      rm -rf "${dir}/${NAME}"
      say "已移除 $dir/${NAME}"
      found=1
    fi
  done
  [ "$found" = "1" ] || say "未发现已安装的 ${NAME}"
  exit 0
}

[ "${1:-}" = "--uninstall" ] && uninstall

if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
  say "错误：$SKILL_SRC/SKILL.md 不存在——请在仓库根目录运行本脚本" >&2
  exit 1
fi

installed=0
for dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.workbuddy/skills"; do
  parent="$(dirname "$dir")"
  # 目录已存在（= 用户在用该外壳）才安装；不替用户凭空创建外壳目录
  if [ -d "$parent" ]; then
    mkdir -p "$dir"
    rm -rf "${dir}/${NAME}"
    cp -r "$SKILL_SRC" "${dir}/${NAME}"
    cp -r "$REPO_ROOT/cards" "$dir/$NAME/cards"
    installed=$((installed + 1))
    say "✓ 已安装到 ${dir}/${NAME}（含卡库副本）"
  fi
done

if [ "$installed" = "0" ]; then
  mkdir -p "$HOME/.agents/skills"
  rm -rf "$HOME/.agents/skills/${NAME}"
  cp -r "$SKILL_SRC" "$HOME/.agents/skills/${NAME}"
  cp -r "$REPO_ROOT/cards" "$HOME/.agents/skills/$NAME/cards"
  installed=1
  say "✓ 未检测到已知外壳目录，默认安装到 ~/.agents/skills/${NAME}（ZCode / dsh 等共享此目录）"
fi

say ""
say "装好了。对话里说「先踩坑：我要 <任务>」或英文 'pitfall-check this: <task>' 即可触发。"
say "可选强化（强制门控，不靠自觉）：hooks/README.md ｜ 命令行扫描：node engine/src/cli.js \"任务\" --tier standard"
say "升级 = 重新跑本脚本；卸载 = sh install.sh --uninstall"
command -v node >/dev/null 2>&1 || say "提示：未检测到 node——技能可用（模型读卡），引擎/门控需要 Node ≥18"
exit 0
