#!/bin/sh
# PreToolUse hook —— 踩坑专家门控（默认先报告后放行）
# 语义：exit 0=放行（stdout 进 transcript）；exit 2=阻断且 stderr 回给模型（官方文档核验，2026-10-14）
# 注册：settings.json 的 hooks.PreToolUse，命令指向本脚本
set -u
HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="${NODE_BIN:-node}"
exec "$NODE_BIN" "$HOOKS_DIR/lib/gate.js" PreToolUse
