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
  for dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.workbuddy/skills"; do
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
for dir in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.workbuddy/skills"; do
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
say "升级 = 重新跑本脚本；卸载 = sh install.sh --uninstall（门控注册在 settings.json 里，需手动移除）"

# 引擎依赖引导（2026-11-02 干净克隆实测：node engine/src/cli.js 崩 Cannot find module 'js-yaml'——
# 作者机永远装着依赖，此坑只在新用户机器上可见）。原则：有 node+npm 就装；没有就明说；
# 任何失败都不阻塞技能安装——技能是模型读卡模式，不依赖引擎。
say ""
if command -v node >/dev/null 2>&1; then
  if node -e "require('$REPO_ROOT/engine/src/scanner.js')" >/dev/null 2>&1; then
    say "✓ 引擎依赖已就绪：命令行扫描 node engine/src/cli.js \"任务\" --tier standard ｜ MCP 见 README"
  elif command -v npm >/dev/null 2>&1; then
    say "… 安装引擎依赖（npm install，运行依赖两个包）"
    NPM_LOG="$(cd "$REPO_ROOT" && npm install --omit=dev --no-audit --no-fund 2>&1)"
    if node -e "require('$REPO_ROOT/engine/src/scanner.js')" >/dev/null 2>&1; then
      say "✓ 引擎依赖已安装：命令行扫描 node engine/src/cli.js \"任务\" --tier standard ｜ MCP 见 README"
    else
      say "⚠ npm install 未成功（网络/registry？）——技能已装好可用；引擎需手动：cd \"$REPO_ROOT\" && npm install"
      printf '%s\n' "$NPM_LOG" | tail -3 | sed 's/^/    /'
    fi
  else
    say "⚠ 有 node 无 npm——技能已装好可用；引擎需手动装依赖（js-yaml、@modelcontextprotocol/sdk）"
  fi
else
  say "提示：未检测到 node——技能可用（模型读卡），引擎/门控需要 Node ≥18"
fi

# 门控（踏板）注册片段：只打印，不写用户的 settings.json——拦人的东西不静默装（设计原则，见 hooks/README.md）。
# 格式为 Claude Code 官方 matcher-group 形式（code.claude.com/docs/en/hooks，2026-11-02 核验；
# 省略 matcher = 对该事件全部触发）；其他 harness 字段名以其官方文档为准。路径已填好并加引号（含空格也安全）。
say ""
say "可选强化——门控（强制拦截，不靠自觉）：把下面这段合并进 ~/.claude/settings.json 的 \"hooks\"（其他 harness 见 hooks/README.md）："
cat <<EOF
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "'$REPO_ROOT/hooks/user-prompt-submit.sh'" } ] }
    ],
    "PreToolUse": [
      { "hooks": [ { "type": "command", "command": "PITFALL_HOOK_MODE=report '$REPO_ROOT/hooks/pre-tool-use.sh'" } ] }
    ]
  }
}
EOF
say "  PITFALL_HOOK_MODE=report 只警告不拦（默认）；改成 block 才真拦 rm -rf / git push --force / 密钥落盘。"
exit 0
