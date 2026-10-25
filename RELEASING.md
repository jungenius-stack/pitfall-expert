# Releasing / 发布指南

面向维护者。**npm 是主分发渠道**（v0.7.9 起已上线：`npx pitfall-expert` 可用、npm 搜索可见、有下载量数据）；GitHub 直跑降级为兜底路径（registry 不可达 / 想跑未发布的 main 时）。

## 两条安装路径（均已实测）

```bash
# A. npm（主路径——对外文案一律写这个）
npx pitfall-expert "重构支付模块" --tier quick
npm install pitfall-expert

# B. GitHub 直跑（兜底）
npx --yes github:jungenius-stack/pitfall-expert "重构支付模块" --tier quick
```

| | npm | GitHub 直跑 |
|---|---|---|
| 命令长度 | `npx pitfall-expert` | `npx --yes github:...` 较长 |
| 首次安装速度 | 快（精简 tarball） | 慢（拉整个仓库） |
| 被发现/被搜索 | ✅ npm 搜索可见 | ❌ |
| 下载量数据（M8ven 采用度等） | ✅ | ❌ |
| 可跑未发布的 main | ❌（只有已发布版） | ✅ |

## 发布到 npm（每次发版）

**现行流程（v0.7.10 起定型，staged publishing 时代）**——npm 已停掉老客户端的直发协议（npm 10 直发 PUT 会撞 404），发布必须走「staging → 网页批准」：

1. 网页生成 **stage-only granular token**（npmjs.com → 头像 → Access Tokens → Granular：只勾 pitfall-expert、Read and write (stage only)、90 天）。**验收点：Summary 必须显示 access to 1 package**——0 packages 的 token 是废的
2. `npm config set //registry.npmjs.org/:_authToken=<token>`（之后 `config get` 报 protected = 已存上）
3. `npx --yes npm@latest stage publish`（本机 npm 10.x 太老不能用）
4. npmjs.com → 头像 → **Staged Packages** → 等 Validating 自动审查完（几分钟）→ **Approve**（2FA）
5. 验证：`npm view pitfall-expert version` + 干净目录 `npm install pitfall-expert` 真机跑一次

**踩过的坑**：web-login token 一天就过期（报 401 Unable to authenticate = 重走第 1 步换 token）；网络对 registry 抽风（ECONNRESET）重试即可；token 只贴终端不进聊天/代码。

**撤销**：72h 窗口 + name@version 永不可重发；发错优先发新 patch 版本 + `npm deprecate pitfall-expert@"<x.y.z" "superseded"`。

## 发版前检查清单

- [ ] `package.json` 与 `engine/package.json` 版本号已递增
- [ ] `engine/package-lock.json` 版本已同步（`cd engine && npm install --package-lock-only`）
- [ ] `CHANGELOG.md` 有对应版本条目
- [ ] 卡库实数与 README/CHANGELOG 里写的数字一致（`node -e "console.log(require('./engine/src/scanner').loadCards('./cards').cards.length)"`）
- [ ] 引擎测试全绿（`npm test`）
- [ ] `sh skills/pitfall-expert/scripts/selfcheck.sh` 全过
- [ ] `npm pack --dry-run` 里 `cards/` 7 个 yaml 在清单中
- [ ] 在干净目录 `npm install <tarball>` 后 CLI 与 MCP 都能跑

## 为什么 `cards/` 必须在包里

`engine/src/scanner.js` 里写死了：

```js
const DEFAULT_CARDS_DIR = path.resolve(__dirname, '../../cards');
```

即「engine 的上两级目录下的 cards」。npm 打包会保留 `package.json` 里 `files` 声明的相对结构，所以 `cards/` 与 `engine/` 必须**同级**入包。

**如果打歪了，工具不会报错**——它会静默地加载 0 张卡，然后产出「本次没有任何坑」的空报告。这是最危险的失败模式：看起来在工作，其实什么都没查。所以发版前一定要跑一次真实安装验证。

## 已知打包差异（观察中）

npm 11 的 `stage publish` 打出的 tarball 比本机 npm 10 的 `pack` 少 `engine/README.md`（52 vs 53 文件，0.7.10 实测）——功能零影响（引擎不读它），机理待查；发版验证时只需盯死 `cards/` 7 个 yaml 与 `engine/src/` 在清单中。

## 发布之后：M8ven 会怎样

- M8ven 的 `npm_name` 字段此前为 `null`（只从 GitHub 抓到仓库）；有 npm 包后待其重新发现即可填上
- 分级规则：「新项目封顶 C/B，直到积累 adoption（采用度）」——**发布本身不等于获得 adoption**；adoption 需要真实下载量/使用记录，靠发帖引流与目录收录
