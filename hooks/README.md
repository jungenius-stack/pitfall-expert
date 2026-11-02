# pitfall-expert hooks —— 强制门控层

架构位置：三层混合中的**闸**。知识活在 skill 层，强制活在这一层——skill 激活率只有 20-50%（社区实测），hook 才是确定性执行。

## 两个钩子

| 钩子 | 事件 | 职责 | 放行/阻断语义 |
|---|---|---|---|
| `user-prompt-submit.sh` | UserPromptSubmit | 每次用户提交 prompt 前注入"值班指令 + ⚡快扫预报告" | stdout 追加进模型上下文（官方语义） |
| `pre-tool-use.sh` | PreToolUse | 工具调用前分级判定：硬规则拦/软规则警告/放行 | exit 0 放行；exit 2 阻断（stderr 回给模型） |

## 安装（Claude Code 格式已核验；WorkBuddy 以其官方文档为准）

**最省事**：跑一遍 `sh install.sh`，末尾会打印一段**已填好绝对路径**的注册片段，合并进 `~/.claude/settings.json`（用户级）或项目的 `.claude/settings.json` 即可。手写则照下面：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "'/绝对路径/pitfall-expert/hooks/user-prompt-submit.sh'" } ] }
    ],
    "PreToolUse": [
      { "hooks": [ { "type": "command", "command": "PITFALL_HOOK_MODE=block '/绝对路径/pitfall-expert/hooks/pre-tool-use.sh'" } ] }
    ]
  }
}
```

> **格式要点（2026-11-02 按 code.claude.com/docs/en/hooks 核验）**：每个事件数组的元素是一个「组」——`{ "matcher": …, "hooks": [ {handler}, … ] }`，handler 不能直接放进事件数组（扁平写法注册不上，这是本文件 2026-10-14～11-02 版本的错误样例，已改）。省略 `matcher`（或写 `"*"`）= 该事件全部触发；PreToolUse 可写 `"matcher": "Bash"` 只盯命令。
> 路径必须绝对路径且建议加单引号（含空格安全）；环境变量可内联在 command 里。
> WorkBuddy（workbuddy.cn/docs/cli/hooks）字段名未实测，以其文档为准；若事件名/字段不同，改 `hooks/*.sh` 里的 exec 一行即可，核心逻辑在 `lib/gate.js`。

## 为什么不自动写 settings.json（设计原则，2026-11-02 收口）

`install.sh` 只打印片段、不替用户写配置。这不是没做完，是定下来的原则：

1. **拦人的东西不静默装**——门控会 exit 2 踩停工具调用，用户必须知道自己装了什么、装的哪一档（report/block）；
2. **settings.json 是用户的文件**——各 harness 路径与 schema 不同（Claude Code 为 group 形式，已实测；WorkBuddy 未实测），写坏一份配置文件比少装一道门更糟；
3. **降摩擦走「填好路径的片段」**，不走「替你写入」。将来若做 `install.sh --with-hooks`，前提是对目标 harness 的 schema 做过真机实测并带备份与 JSON 校验。

v0.7.8 曾写「自动注册留待一周真机数据后决定」；该决定于 2026-11-02 按上述原则收口（当日 hook 日志目录被误删，数据路线不可用，详见 CHANGELOG）。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PITFALL_HOOK_MODE` | `report` | report=先报告后放行（默认）；block=硬规则命中才拦 |
| `PITFALL_HOOK_TIER` | `quick` | 扫描档位，控时延；报告内容完整审查请用 skill 升档 |
| `PITFALL_HOOK_DISABLE` | `0` | 1= kill switch，全部放行 |
| `PITFALL_HOOK_LOG` | `0` | 1= 拦截日志（本地 JSONL，见下节；默认关以兑现 PRIVACY.md 零写入承诺） |
| `PITFALL_HOOK_LOG_FILE` | `~/.pitfall-expert/hook-log.jsonl` | 日志路径（测试/自定义用） |
| `PITFALL_ENGINE_DIR` | 自动定位 | 指向 engine/ 目录 |
| `NODE_BIN` | `node` | node 可执行文件路径 |

## 分级判据（v0.7.8：阻断权只给确定性规则）

**硬阻断（exit 2，仅 block 模式）**——坑卡 `intercept` 字段的确定性规则命中，每条可解释「拦了哪张卡哪条规则」：

- **CODE-006 不可逆操作**（Bash 命令）：`rm -r*` / `rm -f /…`、`git push --force|-f`（**安全变体 `--force-with-lease`/`--force-if-includes` 放行**）、`git reset --hard`、`git clean -f*`、`find … -delete`、`shred`、`kubectl delete ns`、`aws s3 rb|rm`、`DROP/TRUNCATE TABLE`（SQL 客户端语境）、`UPDATE/DELETE` 无 `WHERE`（psql/mysql/mariadb/sqlite3）、`mkfs`、`dd if=`、写块设备、`chmod -R 777 /`；
- **CODE-027 密钥写入**（Write/Edit/MultiEdit/NotebookEdit 的**写入内容**）：`sk-…`、`AKIA…`、`-----BEGIN … PRIVATE KEY-----`、`gh?_…`、`xox?-…`——真实密钥落盘那一刻拦下，不等 gitleaks 事后扫。

**软警告（放行 + stderr 显著提示 + 日志）**：

- CODE-006 软规则：`curl|sh`/`wget|bash` 管道执行远程脚本、`>`/`>>` 覆盖 `.env`；
- 扫描型高危卡（S≥4 且 O≥3，**词面匹配**）：v0.7.8 起从阻断降级——词面匹配不配阻断权（实测一份普通文档可命中 9 张词面高危卡，照拦就是在训练用户拆门）。block 模式下报告头部有一行提示，report 模式只在报告正文。

**规则同源**：拦截规则活在 `cards/*.yaml` 的 `intercept` 字段（格式见 `skills/pitfall-expert/references/card-format.md`），经 `loadCards` 校验后由 `engine/src/gate-core.cjs` 统一消费——加一张带规则的卡，门自动多认一种危险。每条规则必须在 `engine/test/gate-core.test.js` 有正反例 + 良性语料回归（误拦一条，用户拆一次门）。

## 拦截日志（选开）

`PITFALL_HOOK_LOG=1` 时每次非跳过的门控决策追加一行 JSONL 到 `~/.pitfall-expert/hook-log.jsonl`（字段：ts/mode/decision/tool/rules/cards/input 摘要≤200 字符）。**默认关**——扫描零写入是 PRIVACY.md 的硬承诺；日志只写本机 home 目录、永不入库。聚合查看：`node hooks/log-summary.js`（决策分布/规则频次/软警告暴露序号——后者是评测协议 §八.2 习惯化测量的数据出口）。

## 跳过启发式（门控防自我瘫痪——元坑①的自指应用）

- 只读工具直接跳过：Read / Grep / Glob / LS / WebSearch 等；
- 琐碎命令跳过：ls / cat / pwd / echo / git status 等（白名单制，宁漏不错过）；
- 提取不到 ≥4 字符的任务描述 → 跳过。
- **顺序纪律（CODE-018）**：确定性规则判定先于跳过启发式——`git push --force` 首词是 git，先查琐碎表会静默放过。

## 已知边界（诚实披露）

1. **fail-open 是官方明示边界**：hook 自身超时/崩溃/输入解析失败一律放行，绝不让门控成为阻塞源；但引擎扫描失败会显式输出披露，不允许被理解为"没有坑"。
2. PreToolUse 的 report 模式下，stdout 在部分 harness 版本中只进 transcript 不进模型上下文——上下文注入以 UserPromptSubmit 为准（该语义经官方文档核验）；如需稳定进上下文，请用 UserPromptSubmit 钩子。
3. 用户可全局关停 hooks（`disableAllHooks` 类设置）——门控是提高默认安全性的层，不是信任根。
4. 规则表是白名单不是全量防线：不在 `intercept` 字段里的危险操作不会拦——这是刻意取舍（拦截须可解释），不是覆盖承诺。
