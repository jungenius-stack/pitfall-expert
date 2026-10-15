# 备选路径：dsh hooks 桥接

如果不想装 Cordis 插件（或 dsh 插件 API 因 preview 变动而失效），用官方桥接器跑本仓库现成的 hooks 脚本——零新代码，且与 Claude Code / WorkBuddy 端完全同源。

## 原理

dsh 官方仓库提供 `dsh-hooks-claude-code` / `dsh-hooks-codex` 桥接包（packages/hooks），把钩子配置文件映射到 `tools/pre-execute` 等扩展点。本仓库 `hooks/` 目录的脚本即 Claude Code 方言：

- stdin 收 hook JSON（`tool_name` / `tool_input`）
- exit 0 = 放行；exit 2 = 阻断（stderr 作为阻断原因回给模型）
- `user-prompt-submit.sh`：UserPromptSubmit 语义，stdout 注入上下文

## 配置

1. 确认 dsh 侧启用了 hooks 桥接（官方包 `@deepseek-ai/dsh-hooks-claude-code` 或等价市场插件）；
2. 在桥接的钩子配置里指向本仓库脚本（绝对路径）：

```json
{
  "hooks": {
    "PreToolUse": [
      { "type": "command", "command": "/绝对路径/pitfall-expert/hooks/pre-tool-use.sh" }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": "/绝对路径/pitfall-expert/hooks/user-prompt-submit.sh" }
    ]
  }
}
```

3. 环境变量契约与插件层一致：`PITFALL_HOOK_MODE` / `PITFALL_HOOK_TIER` / `PITFALL_HOOK_DISABLE` / `PITFALL_ENGINE_DIR` / `NODE_BIN`。

## 注意

- 桥接包的确切配置字段以 dsh 官方文档为准（2026-10 核验时官方文档站 404，文档在 GitHub 仓库 docs/ 与 packages/hooks/）；
- 与 Cordis 插件二选一，同时启用会双重扫描；
- 该路径的 fail-open 语义由桥接层决定，本仓库脚本自身的异常处理（见 hooks/README.md）不变。
