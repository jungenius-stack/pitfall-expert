# Privacy Policy / 隐私政策

**Last updated: 2026-10-21** · 中文版见下方 [中文](#中文)

## English

### Summary

pitfall-expert runs **entirely on your machine**. It does not collect, transmit, store, or sell any personal data. There is no account, no telemetry, no analytics, and no network call of any kind during normal operation.

### What the software does with data

The MCP server (`scan_task`) and the CLI read two things, both from your own filesystem:

1. **The pitfall card library** (`cards/*.yaml`), which ships with the package and is read-only.
2. **The task description** you pass as the `task` argument.

The task text is processed **in memory only** for keyword matching against the local card library. It is written to a report and returned to the calling client. **It is never written to disk, logged to an external service, or sent over a network.**

### Network activity

**None.** The engine's only runtime dependencies are `@modelcontextprotocol/sdk` and `js-yaml`. There is no `fetch`, `http`, `https`, `net`, or `dns` usage in the engine source. You can verify this yourself:

```bash
grep -nE "fetch\(|require\('http|require\('https|require\('net|require\('dns" engine/src/*.js
# no output = no network code
```

Note: when *you* run `npm install`, npm itself contacts the registry. That is npm's network activity under npm's privacy policy, not ours.

### Files written

**None during a scan.** The tool path performs only `readdirSync` and `readFileSync`. Verify:

```bash
grep -nE "writeFile|appendFile|mkdir|unlink|rmSync|rename" engine/src/*.js
# no output = read-only tool
```

The optional `install.sh` writes into skill directories under `$HOME` (`.agents/`, `.claude/`, `.workbuddy/`) only when you explicitly run it. `sh install.sh --uninstall` removes those copies.

### Telemetry and third parties

None. No analytics SDK, no crash reporting, no advertising identifier, no third-party data sharing. The project has no servers to receive your data.

### The `--feedback` flag

The CLI offers an optional `--feedback` flag that **prints** a de-identified report skeleton to stdout for you to paste into a GitHub issue yourself. It does not send anything. Without `--with-task` it omits your task text; with `--with-task` it includes it — you decide, and you are the one posting it.

### Children's data

Not applicable; the software collects no data from anyone.

### Changes

Any change to this policy will appear in this file and in `CHANGELOG.md`. Because the software makes no network calls, a privacy-affecting change would require new code, reviewable in the public repository.

### Contact

Open an issue at <https://github.com/jungenius-stack/pitfall-expert/issues>, or use a private security advisory for anything sensitive (see `SECURITY.md`).

---

## 中文

### 一句话

pitfall-expert **完全在你自己的机器上运行**。不收集、不上传、不存储、不贩卖任何个人数据。没有账号、没有遥测、没有统计，正常运行期间**没有任何网络请求**。

### 它读什么

只读两样东西，都在你自己的磁盘上：

1. **坑卡库**（`cards/*.yaml`）—— 随包发布，只读；
2. **你传入的任务描述**（`task` 参数）。

任务文本**只在内存中**参与关键词匹配，生成报告返回给调用方。**不落盘、不外发、不入日志。**

### 网络活动

**零。** 引擎运行期依赖只有 `@modelcontextprotocol/sdk` 和 `js-yaml`，源码中无 `fetch`/`http`/`https`/`net`/`dns`。可自行核验：

```bash
grep -nE "fetch\(|require\('http|require\('https|require\('net|require\('dns" engine/src/*.js
# 无输出 = 无网络代码
```

说明：你执行 `npm install` 时是 **npm 自己**在访问 registry，属 npm 的隐私政策范畴，不是本软件的行为。

### 写文件

**扫描过程零写入。** 工具路径只做 `readdirSync` / `readFileSync`。可自行核验：

```bash
grep -nE "writeFile|appendFile|mkdir|unlink|rmSync|rename" engine/src/*.js
# 无输出 = 纯只读工具
```

可选的 `install.sh` 仅在你显式执行时才写 `$HOME` 下的技能目录（`.agents/`、`.claude/`、`.workbuddy/`），`sh install.sh --uninstall` 可移除。

### 遥测与第三方

无。无统计 SDK、无崩溃上报、无广告标识、不向第三方共享。本项目**没有服务器**，没有地方接收你的数据。

### `--feedback` 参数

仅把脱敏报告**打印到终端**，由你自己粘贴到 GitHub issue，**不会自动发送**。不加 `--with-task` 时不含任务原文；加了才含 —— 由你决定，也由你发布。

### 变更

本政策变更会同时出现在本文件与 `CHANGELOG.md`。由于软件不联网，任何影响隐私的改动都必须新增代码，可在公开仓库中审查。

### 联系

在 <https://github.com/jungenius-stack/pitfall-expert/issues> 开 issue；敏感问题请走私密安全通告（见 `SECURITY.md`）。
