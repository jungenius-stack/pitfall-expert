# Releasing / 发布指南

面向维护者。**发布到 npm 是可选的**：不注册账号也能通过 GitHub 安装使用（见下节）。
但如果你希望用短命令 `npx pitfall-expert`、或希望被 npm 搜索到，就必须发布——这一步需要你的 npm 账号，任何人（包括 AI）都不能代劳。

## 先看这条：不注册 npm 也能用

**发布到 npm 不是必需的**。以下两条路径已实测可用，零注册：

```bash
# A. 直接跑（最简，无需装任何东西）
npx --yes github:jungenius-stack/pitfall-expert "重构支付模块" --tier quick

# B. 装成依赖，之后三个 bin 都在 PATH 上
npm install github:jungenius-stack/pitfall-expert
```

代价与 npm 发布的差别：

| | GitHub 直跑 | npm 发布 |
|---|---|---|
| 需要 npm 账号 | ❌ 不需要 | ✅ 需要 |
| 首次安装速度 | 慢些（拉整个仓库） | 快（拉精简 tarball） |
| 命令长度 | `npx --yes github:...` 较长 | `npx pitfall-expert` |
| 被发现/被搜索 | ❌ 搜不到 | ✅ npm 搜索可见 |
| M8ven 能否识别 | ❓ 未验证 | 可能填上 `npm_name` |

**结论**：只想让人能用 → GitHub 直跑够了；想被陌生人发现 → 才需要发 npm。

## 发布到 npm（可选）

发布前，全世界只能通过 GitHub 方式安装——`npx pitfall-expert` 会 404。



在发布之前，全世界没有任何人能安装本工具：

- `npx pitfall-expert` → `404 Not Found`（registry 上没有这个包）
- 唯一可行的方式只剩 `git clone` + `sh install.sh`，门槛极高

`registry.npmjs.org/pitfall-expert` 目前返回 **404**，即包名**可用**（没被抢注），等你注册后即可占用。

## 一次性准备（只做一次）

```bash
npm login
# 浏览器会打开，用你的 npm 账号授权
npm whoami          # 打印你的用户名，确认已登录
```

没有 npm 账号就先在 <https://www.npmjs.com/signup> 注册。建议顺手开启 2FA（npm 对热门包强制要求，早开早省事）。

## 发布（每次发版）

```bash
cd pitfall-expert

# 1. 确认工作区干净、CI 绿
git status                          # 应无未提交改动
gh run list --limit 1               # 或用网页看 Actions

# 2. 本地验证包内容（不发布，只看清单）
npm pack --dry-run
#   必须能看到：engine/src/、cards/ 下 7 个 yaml、PRIVACY.md、LICENSE
#   若 cards/ 不在清单里 → 停止，检查 package.json 的 files 字段

# 3. 真发布
npm publish --access public
```

发布成功后验证：

```bash
npm view pitfall-expert version      # 应显示刚发布的版本
npx pitfall-expert@latest --help     # 全新目录里跑一次
```

## 发版前检查清单

- [ ] `package.json` 与 `engine/package.json` 版本号已递增
- [ ] `engine/package-lock.json` 版本已同步（`cd engine && npm install --package-lock-only`）
- [ ] `CHANGELOG.md` 有对应版本条目
- [ ] 卡库实数与 README/CHANGELOG 里写的数字一致（`node -e "console.log(require('./engine/src/scanner').loadCards('./cards').cards.length)"`）
- [ ] 引擎测试全绿（`npm test`）
- [ ] `sh skills/pitfall-expert/scripts/selfcheck.sh` 全过
- [ ] `npm pack --dry-run` 里 `cards/` 在清单中
- [ ] 在干净目录 `npm install <tarball>` 后 CLI 与 MCP 都能跑

## 为什么 `cards/` 必须在包里

`engine/src/scanner.js` 里写死了：

```js
const DEFAULT_CARDS_DIR = path.resolve(__dirname, '../../cards');
```

即「engine 的上两级目录下的 cards」。npm 打包会保留 `package.json` 里 `files` 声明的相对结构，所以 `cards/` 与 `engine/` 必须**同级**入包。

**如果打歪了，工具不会报错**——它会静默地加载 0 张卡，然后产出「本次没有任何坑」的空报告。这是最危险的失败模式：看起来在工作，其实什么都没查。所以发版前一定要跑一次真实安装验证。

## 撤销发布

npm 的 `unpublish` 有严格限制（发布 72 小时后基本不能删）。发错了优先**发一个新的 patch 版本**覆盖，不要依赖删除：

```bash
npm deprecate pitfall-expert@"<0.7.6" "superseded by 0.7.6 — see CHANGELOG"
```

## 发布之后：M8ven 会怎样

详见 README 与 `CHANGELOG.md` 的历史记录。简短版：

- M8ven 的 `npm_name` 字段目前是 `null`（它只从 GitHub 抓到了仓库）
- 有 npm 包之后，它需要**重新发现**这个包才可能把 `npm_name` 填上
- 它的分级规则写着「新项目封顶 C，直到积累 adoption（采用度）」
- **发布本身不等于获得 adoption**；adoption 需要真实的下载量/使用记录
