# Releasing / 发布指南

面向维护者。**发布到 npm 是唯一需要你亲手做的一步**——它必须用你的 npm 账号，任何人（包括 AI）都不能代劳。

## 为什么必须发布

在发布之前，全世界没有任何人能安装本工具：

- `npx pitfall-expert` → `404 Not Found`（registry 上没有这个包）
- 唯一可行的方式只剩 `git clone` + `sh install.sh`，门槛极高

`registry.npmjs.org/pitfall-expert` 目前返回 **404**，即包名**可用**（没被抢注）。

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
