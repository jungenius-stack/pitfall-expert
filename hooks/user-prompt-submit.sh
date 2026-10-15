#!/bin/sh
# UserPromptSubmit hook —— 踩坑专家值班注入
# 语义：stdout 纯文本追加进模型上下文（官方文档核验，2026-10-14）
# 注册：settings.json 的 hooks.UserPromptSubmit，命令指向本脚本
set -u
HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="${NODE_BIN:-node}"
exec "$NODE_BIN" "$HOOKS_DIR/lib/gate.js" UserPromptSubmit
