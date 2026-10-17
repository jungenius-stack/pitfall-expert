# CI workflow 参考副本（未激活）

> 本仓库当前**没有**激活 GitHub Actions：首发推送用的凭证只有 `repo` 权限、无 `workflow` scope，GitHub 拒绝携带 `.github/workflows/` 的推送，故该目录已从历史剥离，配置保存在此。
>
> **重新启用（二选一，约 1 分钟）**：
> 1. 网页端：仓库页 → Add file → Create new file → 命名 `.github/workflows/ci.yml` → 粘贴下方内容 → Commit（网页端不受 token scope 限制）；
> 2. 本地：`gh auth login`（或任何带 `workflow` scope 的 PAT）→ 把本文件复制回 `.github/workflows/ci.yml` → commit + push。
>
> 激活后可在 README 徽章区补 CI 状态徽章。

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: engine/package-lock.json
      - name: 引擎测试（含 MCP stdio 冒烟）
        working-directory: engine
        run: |
          npm ci
          npm test
      - name: 坑卡库严格校验（四件套 + 枚举 + S/O/D）
        run: |
          node -e "const {loadCards}=require('./engine/src/scanner'); const r=loadCards('./cards'); console.log(r.cards.length+' cards'); if(r.errors.length){console.error(JSON.stringify(r.errors,null,2)); process.exit(1)}"
      - name: 技能自检（结构 + 双语冒烟 + DoD 机检自测）
        run: sh skills/pitfall-expert/scripts/selfcheck.sh
      - name: hook 冒烟（block 拦破坏性 / 放行只读）
        run: |
          set +e
          echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | PITFALL_HOOK_MODE=block sh hooks/pre-tool-use.sh >/dev/null 2>&1
          BLOCK_RC=$?
          echo '{"tool_name":"Read","tool_input":{}}' | sh hooks/pre-tool-use.sh >/dev/null 2>&1
          READ_RC=$?
          set -e
          [ "$BLOCK_RC" -eq 2 ] || { echo "block 未拦截（rc=$BLOCK_RC）"; exit 1; }
          [ "$READ_RC" -eq 0 ] || { echo "只读未放行（rc=$READ_RC）"; exit 1; }
          echo "hook 双模式 ✓（block rc=$BLOCK_RC / read rc=$READ_RC）"
```
