# pitfall-expert hooks —— 强制门控层

架构位置：三层混合中的**闸**。知识活在 skill 层，强制活在这一层——skill 激活率只有 20-50%（社区实测），hook 才是确定性执行。

## 两个钩子

| 钩子 | 事件 | 职责 | 放行/阻断语义 |
|---|---|---|---|
| `user-prompt-submit.sh` | UserPromptSubmit | 每次用户提交 prompt 前注入"值班指令 + ⚡快扫预报告" | stdout 追加进模型上下文（官方语义） |
| `pre-tool-use.sh` | PreToolUse | 工具调用前扫描；默认只报告，可切阻断 | exit 0 放行；exit 2 阻断（stderr 回给模型） |

## 安装（WorkBuddy / Claude Code 通用，hooks 契约一致）

在项目的 `.claude/settings.json` 或 `.workbuddy/settings.json`（WorkBuddy 为 `.workbuddy/settings.json`，以官方文档为准）加：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "type": "command", "command": "/绝对路径/pitfall-expert/hooks/user-prompt-submit.sh" }
    ],
    "PreToolUse": [
      { "type": "command", "command": "/绝对路径/pitfall-expert/hooks/pre-tool-use.sh" }
    ]
  }
}
```

> 注意：路径必须绝对路径；hook 注册文件的准确字段名以各 harness 官方文档为准
> （WorkBuddy: workbuddy.cn/docs/cli/hooks；Claude Code: code.claude.com/docs/en/hooks）。
> 若所用 harness 的事件名/字段不同，改 `hooks/*.sh` 里的 exec 一行即可，核心逻辑在 `lib/gate.js`。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PITFALL_HOOK_MODE` | `report` | report=先报告后放行（默认）；block=命中高危才拦 |
| `PITFALL_HOOK_TIER` | `quick` | 扫描档位，控时延；报告内容完整审查请用 skill 升档 |
| `PITFALL_HOOK_DISABLE` | `0` | 1= kill switch，全部放行 |
| `PITFALL_ENGINE_DIR` | 自动定位 | 指向 engine/ 目录 |
| `NODE_BIN` | `node` | node 可执行文件路径 |

## 跳过启发式（门控防自我瘫痪——元坑①的自指应用）

- 只读工具直接跳过：Read / Grep / Glob / LS / WebSearch 等；
- 琐碎命令跳过：ls / cat / pwd / echo / git status 等（白名单制，宁漏不错过）；
- 提取不到 ≥4 字符的任务描述 → 跳过。

## 阻断判据（仅 block 模式）

1. **破坏性命令硬拦截**（无视坑卡）：`rm -r*`、`git push --force`、`git reset --hard`、`DROP/TRUNCATE TABLE`、`mkfs`、`dd if=`、写块设备、`chmod -R 777 /`；
2. **高危坑卡**：命中 S≥4 且 O≥3 的坑卡（D 只进报告不参与拦截——防拦截疲劳）。

## 已知边界（诚实披露）

1. **fail-open 是官方明示边界**：hook 自身超时/崩溃/输入解析失败一律放行，绝不让门控成为阻塞源；但引擎扫描失败会显式输出披露，不允许被理解为"没有坑"。
2. PreToolUse 的 report 模式下，stdout 在部分 harness 版本中只进 transcript 不进模型上下文——上下文注入以 UserPromptSubmit 为准（该语义经官方文档核验）；如需稳定进上下文，请用 UserPromptSubmit 钩子。
3. 用户可全局关停 hooks（`disableAllHooks` 类设置）——门控是提高默认安全性的层，不是信任根。
