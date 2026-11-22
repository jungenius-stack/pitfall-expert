# Privacy Policy / 隐私政策

**Last updated: 2026-11-19** · 中文版见下方 [中文](#中文)

## English

### Summary

pitfall-expert's engine runs **locally on your machine**, without an account or telemetry uploads. Scans write a local hit ledger by default, which supports local statistics and ticket checks; this is not a promise of zero writes or no local statistics. The project does not receive or sell your task data. Reports returned to your AI client are subject to that client's handling and privacy policy.

**Source-only change, not released:** the new ledger defaults below describe the source change being prepared, not an already published release. Installed copies have not been synchronized and may still save task prefixes and trigger text under the old behavior. Existing records are kept unchanged; the new default does not redact them.

### What the software does with data

The MCP server (`scan_task`) and CLI read the local pitfall card library (`cards/*.yaml`) and the task description you supply. Matching is local. **Normal reports still contain the full task**: the CLI prints them to stdout, and MCP returns them to the calling AI client. That client may retain or transmit the report; stdout redirection, terminal/session capture, and client logs may also save it. The dsh adapter logs pre-reports through the harness logger, independently of the optional hook decision log.

### Network activity

The engine does not upload tasks, ledgers, or statistics and makes no network requests for matching. This does not constrain your AI client or harness. Running `npm install` or `npx` may contact the registry; that is npm's network activity under npm's privacy policy, not engine telemetry.

### Files written

**Local hit ledger (on by default):** scans append to `~/.pitfall-expert/hits.jsonl`. The new default record contains only `schemaVersion: 2`, `ts`, `ticket`, `source`, `tier`, `domain`, `taskHash` (SHA-256 of the **complete** task), and `hits` entries containing only `id` and `score`. No task text or `trig` trigger text is stored by default. `taskHash` is an **unsalted matching digest**, not anonymization, tamper protection, or protection against dictionary guessing.

- `PITFALL_LEDGER_TASK=on` explicitly adds a `task` field containing the first **60 UTF-16 code units** of the task. Even this short prefix may disclose secrets; do not publish it or the ledger without reviewing it.
- `PITFALL_LEDGER=off` disables ledger writes **and ticket issuance**. It does not delete or rewrite old records, suppress the report's full task, or disable the separate hook/client logs.
- New ledger directories are created with mode `0700` and new ledger files with `0600` (subject to the process umask). Existing directories/files are **not chmod'ed**; inspect their permissions yourself. This is not a guarantee about optional hook logs or client-created files.

**Ticket checks:** new tickets require a matching digest of the complete task. Legacy tickets can only be checked by exact equality of the first 60 UTF-16 code units and must be labeled as legacy with limited assurance; different tasks sharing that prefix cannot be distinguished. Verification output does not echo task text. File mode expects an engine report with one unambiguous metadata header; for a rewritten report, provide the ticket and complete task explicitly. Command-line task arguments may be retained by shell history or visible to the system. Tickets are **not cryptographic signatures**; possessing one does not prove that a verifier was executed.

**Optional hook decision log (off by default):** `PITFALL_HOOK_LOG=1` (or dsh `config.log: true`) enables local JSONL logging to `~/.pitfall-expert/hook-log.jsonl`, overridable with `PITFALL_HOOK_LOG_FILE`. Records include time, decision, rule/card IDs and an input excerpt of up to **200 UTF-16 code units**, which may contain sensitive task text. This is separate from the hit ledger: turning off hook logging does not stop ledger writes, reports, or harness logs. Neither local ledger is automatically uploaded. `node hooks/log-summary.js` aggregates the hook log locally.

The optional `install.sh` writes into skill directories under `$HOME` (`.agents/`, `.claude/`, `.workbuddy/`, etc.) only when you explicitly run it. `sh install.sh --uninstall` removes installed copies; do not assume it removes ledgers or client logs.

### Telemetry and third parties

No telemetry/analytics SDK, crash-report upload, advertising identifier, or automatic third-party data sharing is built into the engine. Local statistics are not telemetry. The project operates no server to receive your scan data; AI-client services and anything you choose to post are outside that boundary.

### The `--feedback` flag

The CLI offers an optional `--feedback` flag that **prints** a report skeleton to stdout for you to paste into a GitHub issue yourself. It does not send anything. Without `--with-task` it omits your task text; with `--with-task` it includes it. Review the entire output before posting; omission of task text is not a guarantee of anonymity. Feedback output does not disable the scan's local hit ledger.

### Children's data

There is no separate collection service or age-based tracking. Local records and client-handled reports follow the same behavior described above regardless of age.

### Changes

Privacy-affecting source changes can be reviewed in the public repository. Check the release and installed code you actually use; updating this document does not update installed copies.

### Contact

Open an issue at <https://github.com/jungenius-stack/pitfall-expert/issues>, or use a private security advisory for anything sensitive (see `SECURITY.md`). Do not post sensitive tasks or raw local logs publicly.

---

## 中文

### 一句话

pitfall-expert 引擎**在你自己的机器上本地运行**，没有账号，不上传遥测。扫描默认写本地命中账本，用于本地统计和验票；这不是「零写入」或「无本地统计」的承诺。项目方不接收、不贩卖你的任务数据。返回给 AI 客户端的报告由该客户端处理，适用其隐私政策。

**仅源码变更，尚未发版**：下述新账本默认行为是正在准备的源码变更，不代表已发布版本；已安装端尚未同步，仍可能按旧行为保存任务前缀和触发词。旧记录原样保留，新默认不会替你清理历史原文。

### 它读什么

MCP 服务（`scan_task`）与 CLI 读取本地坑卡库（`cards/*.yaml`）和你传入的任务描述，在本地匹配。**普通报告仍含完整任务**：CLI 打印到 stdout，MCP 返回给调用它的 AI 客户端。客户端可能留存或传输报告；stdout 重定向、终端/会话记录及客户端日志也可能保存报告。dsh 适配层会通过外壳 logger 记录预报告，与可选的 hook 决策日志无关。

### 网络活动

引擎不上传任务、账本或统计，匹配不发起网络请求。这不约束 AI 客户端或外壳的联网行为。执行 `npm install` 或 `npx` 时可能由 npm 访问 registry，适用 npm 的隐私政策，不是引擎遥测。

### 写文件

**本地命中账本（默认开）**：扫描向 `~/.pitfall-expert/hits.jsonl` 追加记录。新默认记录仅含 `schemaVersion: 2`、`ts`、`ticket`、`source`、`tier`、`domain`、`taskHash`（**完整任务**的 SHA-256），以及仅含 `id`、`score` 的 `hits` 条目。默认不存任务原文，也不再存 `trig` 触发词。`taskHash` 是**无盐匹配摘要**，不是匿名化、防伪或抗字典猜测措施。

- 显式设置 `PITFALL_LEDGER_TASK=on`，才额外保存 `task` 字段，内容为任务前 **60 个 UTF-16 码元**。这么短的前缀也可能泄密，不建议公开；分享账本前必须审查。
- `PITFALL_LEDGER=off` 关闭账本写入，**同时不签发票据**；不删除或改写旧记录，不去除报告中的完整任务，也不关闭独立的 hook/客户端日志。
- 新建账本目录使用 `0700`，新建账本文件使用 `0600`（受进程 umask 约束）；**不对既有目录/文件执行 chmod**，既有权限需自行检查。这不保证可选 hook 日志或客户端创建文件的权限。

**验票边界**：新票需完整任务摘要匹配。旧票只能精确匹配前 60 个 UTF-16 码元，并须标明「旧票、能力有限」；相同前缀的不同任务无法区分。验票输出不回显任务。文件模式要求有唯一、无歧义元数据头的引擎报告；重写过的报告可改用显式票据加完整任务。命令行任务参数可能被 shell 历史留存或被系统查看。票据**不是密码学签名**，有票不证明 verifier 已执行。

**hook 决策日志（默认关）**：`PITFALL_HOOK_LOG=1`（或 dsh `config.log: true`）开启本地 JSONL 日志，默认路径 `~/.pitfall-expert/hook-log.jsonl`，可用 `PITFALL_HOOK_LOG_FILE` 覆盖。记录含时间、决策、规则/卡 ID 和输入摘要（实为前缀，最多 **200 个 UTF-16 码元**），可能含敏感任务文本。它与命中账本独立：关闭 hook 日志不等于关闭账本写入、报告或外壳日志。两种本地账本都不会自动上传。`node hooks/log-summary.js` 可本地聚合 hook 日志。

可选的 `install.sh` 仅在你显式执行时才写 `$HOME` 下的技能目录（`.agents/`、`.claude/`、`.workbuddy/` 等）；`sh install.sh --uninstall` 可移除安装副本，不应假定它会清理账本或客户端日志。

### 遥测与第三方

引擎没有遥测/统计 SDK、崩溃上传、广告标识或自动第三方数据共享。本地统计不等于遥测。项目方没有接收扫描数据的服务器；AI 客户端服务及你自行公开的内容不在此边界内。

### `--feedback` 参数

CLI 仅把反馈报告骨架**打印到 stdout**，由你自己粘贴到 GitHub issue，**不会自动发送**。不加 `--with-task` 时不含任务原文，加了才含。发布前应检查完整输出；去除原文不保证匿名。反馈输出不关闭本次扫描的本地命中账本。

### 儿童数据

没有独立的数据收集服务或按年龄跟踪机制。本地记录与客户端处理的报告适用上面同样的行为说明，不因年龄改变。

### 变更

涉及隐私的源码变更可在公开仓库审查。请核对实际使用的发行版和已安装代码；更新本文不等于更新已安装端。

### 联系

在 <https://github.com/jungenius-stack/pitfall-expert/issues> 开 issue；敏感问题请走私密安全通告（见 `SECURITY.md`）。不要公开敏感任务或未经审查的本地日志。
