# pitfall-expert-engine

踩坑专家扫描引擎 —— AI 任务执行前的系统性风险预判（MCP server）。

架构位置：混合三层中的**核**。坑卡库 + 扫描逻辑收敛在此，一次实现、四端复用
（Claude Code / Codex / WorkBuddy / DeepSeek harness 均有 MCP 接入）。

## 能力

- `scan_task(task, domain?, tier?, cards_dir?)`：对任务描述做领域路由 → 坑卡逐条对照 → 三区诚实报告
  - ✅ 已查证区：命中的 backed_by_context 级坑卡（症状/证据/规避/置信度/命中依据）
  - ❓ 未验证区：低置信度命中项 + 档位限制声明
  - 🚫 盲区声明：未建卡领域、未知的未知、信源边界、跨域弱信号
  - 验证器清单（标准/深审档）：每条 🔴 绑定可执行检查——预踩坑的产出物以此计量
  - 深审档附加：FMEA RPN 排序（带批评注记）+ Tiger 三分类 + 对抗追问

## 运行

```bash
npm install
npm start          # stdio MCP server
npm test           # 7 个回放场景（含 MCP 全链路冒烟）
```

## 接入（以 WorkBuddy 为例）

`~/.workbuddy/mcp.json`：

```json
{
  "mcpServers": {
    "pitfall-expert": {
      "command": "node",
      "args": ["/绝对路径/pitfall-expert/engine/src/index.js"]
    }
  }
}
```

Claude Code：`claude mcp add pitfall-expert node /绝对路径/pitfall-expert/engine/src/index.js`
Codex CLI：`~/.codex/config.toml` 的 `[mcp_servers.pitfall-expert]`（command + args 同构）

## 设计纪律（来自方法论 v0.3）

- 引擎只铸造验证器，不代为执行——执行结果回写后才能进 ✅ 区（3.0 验证器优先）
- 三区任何一区不允许空着不写（6.1 防线 2）
- 坑卡加载失败显式披露为信源故障，绝不静默跳过（元坑⑧）
- 空/过短任务按 grill-me 退回，不猜需求（SOP 第 1 步）
- hook 超时/崩溃默认放行（fail-open）是官方明示边界，硬策略需另走权限系统（5.5）

## 坑卡格式

见 `../cards/*.yaml` 与 `../docs/踩坑专家方法论_v0.3.md` 第 9.1 条。
新增领域：在 `cards/` 下加 `{domain}.yaml`（文件级 `domain:` 字段下发缺省卡），
引擎启动时自动加载并做字段断言校验。
