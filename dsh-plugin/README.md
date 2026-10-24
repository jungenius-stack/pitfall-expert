# pitfall-expert dsh 插件

DeepSeek Harness（dsh）适配层——三层混合架构的第四端。复用同一引擎（engine/），不重复造扫描逻辑。

## 能力

1. **tools/pre-execute 门禁**（官方核验的瀑布式拦截点）：每次工具执行前分级判定
   - `report` 模式（默认）：先报告后放行，报告进 dsh 日志；硬规则命中加 🔴 提示
   - `block` 模式：**确定性硬规则命中**（坑卡 intercept 字段：rm 类/force push/密钥写入…）返回 `{ kind: 'deny', reason }` 阻断；软规则与词面高危卡放行+警告（v0.7.8 分级语义，与 hooks 层一致）
2. **pitfall_scan 工具**（defineTool 注册）：面向模型的显式扫描，模型可自主调用

## 安装

**方式一：常驻注册（推荐，真机验证于 2026-10-24）**——编辑 dsh profile 的 patch 层 `~/.dsh/profiles/<profile>/cordis.patch.yml`（数组末尾追加；改前先备份），插件路径必须是绝对路径：

```yaml
- id: pitfall-expert
  name: '/绝对路径/pitfall-expert/dsh-plugin/src/index.mjs'
  config:
    mode: block    # report（默认）| block
    log: true      # 选开拦截日志（与 hooks 层同一账本 ~/.pitfall-expert/hook-log.jsonl）
```

config 优先级：cordis config > 环境变量 > 默认。web/desktop 两个 profile 都要覆盖就各写一份。

**方式二：启动时覆盖层**——临时试用：

```sh
pnpm dsh web --patch /绝对路径/pitfall-expert/dsh-plugin/cordis.yml
```

引擎定位顺序：`PITFALL_ENGINE_DIR`（显式设置时权威且独占，无效则降解告警）→ 相对本插件的 monorepo 路径（`dsh-plugin/src → ../../engine`）。本插件自带测试：`node --test test/*.test.mjs`（mock ctx，不需要真实 dsh）。

> 与 hooks 桥接路径（见 hooks-bridge/README.md）**二选一，不要同时开**——会双重扫描。

## 配置（环境变量，与 hooks 层同一契约）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PITFALL_HOOK_MODE` | `report` | report=先报告后放行；block=硬规则命中才拦（v0.7.8 分级语义，可被 cordis config.mode 覆盖） |
| `PITFALL_HOOK_TIER` | `quick` | quick/standard/deep |
| `PITFALL_HOOK_LOG` | `0` | 1=拦截日志写 `~/.pitfall-expert/hook-log.jsonl`（与 hooks 层同一账本；cordis config.log: true 等效） |
| `PITFALL_ENGINE_DIR` | 自动定位 | 引擎目录（显式设置时独占，无效不静默回退） |

## API 依据与风险披露

- `ctx.on('tools/pre-execute', async (exec, next) => ...)`、`{ kind: 'deny', reason }`、`defineTool`、cordis.yml `insert` 覆盖层——均于 2026-10-14 拉取 deepseek-ai/deepseek-harness 官方仓库文档核验（官方文档站当时 404，文档在仓库 docs/ 目录）。
- **dsh 为 developer preview，官方明示会有破坏性变更**。本插件对 API 形状做防御式读取（exec.name/arguments 多形状兜底、defineTool 动态加载失败则跳过工具注册只留门禁、扫描异常 fail-open 放行+告警）。官方 API 变更时，优先坏在“放行+告警”，不坏在“误拦”。
- 升级路径（未实装，待官方形状确认）：`tools/pre-execute` 的 `ask` 决策类型（官方功能映射提到“返回 ask 并通过 ctx.approval 应答”但未给出返回形状）——可用于 report 模式下的高危询问，比纯日志更贴近“先合同后干活”。

## 备选路径：hooks 桥接（不装本插件也能用）

dsh 官方提供 `dsh-hooks-claude-code` 桥接器，把 Claude Code 方言的钩子配置映射到上述扩展点。本仓库 `hooks/` 下的脚本正是该方言（stdin JSON + exit 0/2）。配置方法见 `hooks-bridge/README.md`。两条路径任选其一，不要同时开（会双重扫描）。
