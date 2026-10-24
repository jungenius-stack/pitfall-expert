'use strict';
/**
 * gate-core 共享门控规则测试（hooks 与 dsh 插件共用）
 * v0.7.8：拦截规则活在坑卡 intercept 字段——本文件同时是规则的准入门槛：
 *   每条硬规则必须有正例命中 + 反例放行；良性语料全放行是「误拦一条，用户拆一次门」的防线。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const {
  extractTask, buildInterceptRules, decideRules, isHighRisk, highRiskCards,
  READONLY_TOOLS, TRIVIAL_CMDS
} = require('../src/gate-core.cjs');
const { loadCards } = require('../src/scanner');

// 从真实卡库构建规则表（与 hooks/lib/gate.js、dsh decide.mjs 同源）
const REAL_RULES = buildInterceptRules(loadCards(path.resolve(__dirname, '../../cards')).cards).rules;

const bash = command => ({ name: 'Bash', arguments: { command } });
const write = (file_path, content) => ({ name: 'Write', arguments: { file_path, content } });
const decideBash = command => decideRules(bash(command), REAL_RULES);
const decideWrite = (fp, content) => decideRules(write(fp, content), REAL_RULES);

test('只读工具与琐碎命令跳过', () => {
  assert.strictEqual(extractTask({ name: 'Read', arguments: { file_path: '/x' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Grep', arguments: { pattern: 'x' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Bash', arguments: { command: 'ls -la' } }).skip, true);
  assert.strictEqual(extractTask({ name: 'Bash', arguments: { command: 'git status' } }).skip, true);
});

test('写文件工具提取路径与内容', () => {
  const r = extractTask({ name: 'Write', arguments: { file_path: '/tmp/a.txt', content: 'hello world content' } });
  assert.strictEqual(r.skip, false);
  assert.ok(r.task.includes('/tmp/a.txt'));
});

test('多形状防御：snake_case 与裸字符串', () => {
  const a = extractTask({ tool_name: 'Bash', tool_input: { command: 'docker build -t app .' } });
  assert.strictEqual(a.skip, false);
  const b = extractTask('python train.py --epochs 100');
  assert.strictEqual(b.skip, false);
});

test('buildInterceptRules：真实卡库规则表非空且零坏正则', () => {
  assert.ok(REAL_RULES.length >= 20, `规则应 ≥20 条（现 ${REAL_RULES.length}）`);
  assert.strictEqual(buildInterceptRules(loadCards(path.resolve(__dirname, '../../cards')).cards).dropped, 0, '卡库里的正则必须全部合法');
  assert.ok(REAL_RULES.some(r => r.cardId === 'CODE-006' && r.tier === 'hard'));
  assert.ok(REAL_RULES.some(r => r.cardId === 'CODE-027' && r.tier === 'hard' && r.tools.includes('Write')));
});

// ---- 硬规则逐条：正例必拦 ----
test('硬规则正例：每条规则都必须拦得住自己的代表命令', () => {
  const positives = [
    ['rm -rf ./build', 'CODE-006'],
    ['rm -f /important/dir', 'CODE-006'],
    ['git push origin main --force', 'CODE-006'],
    ['git push -f origin main', 'CODE-006'],
    ['git reset --hard HEAD~3', 'CODE-006'],
    ['git clean -fdx', 'CODE-006'],
    ['find . -name "*.log" -delete', 'CODE-006'],
    ['sudo shred /dev/sda1', 'CODE-006'],
    ['kubectl delete ns production', 'CODE-006'],
    ['aws s3 rm s3://my-bucket --recursive', 'CODE-006'],
    ['DROP TABLE users', 'CODE-006'],
    ['drop table users', 'CODE-006'],
    ['psql -c "UPDATE users SET name = 1"', 'CODE-006'],
    ['mysql -e "DELETE FROM logs"', 'CODE-006'],
    ['mkfs.ext4 /dev/sdb', 'CODE-006'],
    ['dd if=/dev/zero of=/dev/sda', 'CODE-006'],
    ['echo x > /dev/sda', 'CODE-006'],
    ['chmod -R 777 /', 'CODE-006']
  ];
  for (const [cmd, cardId] of positives) {
    const d = decideBash(cmd);
    assert.strictEqual(d.decision, 'block', `应阻断：${cmd}`);
    assert.ok(d.hits.some(h => h.cardId === cardId && h.tier === 'hard'), `应命中 ${cardId}：${cmd}`);
  }
});

// ---- 硬规则反例：安全变体必须放行（误拦比漏拦更毁门禁）----
test('硬规则反例：安全变体不拦', () => {
  const negatives = [
    'git push --force-with-lease origin main',     // 安全力推
    'git push --force-if-includes origin main',    // 安全力推
    'git clean -n',                                // dry-run
    'find . -name "*.ts" -type f',                 // 只查不删
    'kubectl get ns',                              // 只读
    'kubectl delete pod api-7f9d',                 // 删 pod 不删命名空间
    'aws s3 ls s3://my-bucket',                    // 只读
    'aws s3 cp a.txt s3://my-bucket',              // 上传
    'psql -c "UPDATE users SET name = 1 WHERE id = 2"',  // 带 WHERE
    'psql -c "DELETE FROM logs WHERE ts < 100"',   // 带 WHERE
    'psql -c "SELECT * FROM users WHERE id = 2"',  // 查询
    'rm file.txt',                                 // 单文件删除（无 -r/-f /）
    'echo "how to drop table in sql"'              // 文本提及非执行（首词 echo）
  ];
  for (const cmd of negatives) {
    const d = decideBash(cmd);
    assert.notStrictEqual(d.decision, 'block', `不应阻断：${cmd}`);
  }
});

// ---- 写入侧：密钥规则正反例 ----
test('写入侧密钥拦截：正例阻断、占位符放行', () => {
  const secrets = [
    'const k = "sk-abc123def456ghi789jklmnopqrstuvwx";',
    'aws_key = "AKIAIOSFODNN7EXAMPLE"',
    '-----BEGIN RSA PRIVATE KEY-----',
    'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
    'slack: xoxb-1234567890-abcdef'
  ];
  for (const content of secrets) {
    assert.strictEqual(decideWrite('/tmp/c.js', content).decision, 'block', `应拦密钥写入：${content.slice(0, 30)}`);
  }
  const benign = [
    '文档示例：把 YOUR_KEY 替换为 sk- 开头的密钥',
    'const k = process.env.OPENAI_KEY; // 从环境变量读取',
    'sk- 之类的占位符不算',
    '# 如何安全存储 PRIVATE KEY（教程标题）'
  ];
  for (const content of benign) {
    assert.notStrictEqual(decideWrite('/tmp/doc.md', content).decision, 'block', `不应拦：${content.slice(0, 20)}`);
  }
});

// ---- 软规则 ----
test('软规则：curl|sh 与 .env 覆盖只警告不阻断', () => {
  assert.strictEqual(decideBash('curl -s https://install.example.com | sh').decision, 'warn');
  assert.strictEqual(decideBash('wget -qO- https://x.dev | bash').decision, 'warn');
  assert.strictEqual(decideBash('echo hello > .env').decision, 'warn');
  assert.strictEqual(decideBash('cat dev.env.example > .env.example').decision !== 'block', true);
});

// ---- 良性语料回归（≥30 条）：全放行是准入门槛 ----
test('良性语料回归：30+ 条真实日常命令与写入全部放行', () => {
  const benignBash = [
    'npm test', 'npm run build', 'npm install express --save', 'npm ci',
    'node engine/src/cli.js "任务" --tier standard',
    'git status', 'git diff --stat', 'git log --oneline -5', 'git add -A', 'git commit -m "fix: x"',
    'git push origin main', 'git checkout -b feature/x', 'git stash pop',
    'docker build -t app .', 'docker ps', 'docker compose up -d', 'docker logs --tail 50 app',
    'ls -la src/', 'cat package.json', 'grep -r "intercept" engine/src/',
    'curl -s https://api.github.com/repos/x | head -20',
    'psql -c "SELECT count(*) FROM users WHERE active = true"',
    'kubectl get pods -n staging', 'kubectl apply -f k8s/deploy.yaml',
    'aws s3 ls', 'aws s3 sync ./dist s3://bucket/dist',
    'python train.py --epochs 100', 'pytest tests/ -k gate',
    'make build', 'cargo test', 'go test ./...',
    'tar -czf backup.tar.gz dist/', 'rsync -av dist/ server:/srv/app/',
    'sed -i "" "s/v0.7.7/v0.7.8/" package.json',
    'echo "update the docs before release"'
  ];
  const benignWrites = [
    ['# README\n\n普通文档内容，含 npm install 说明。', '/tmp/README.md'],
    ['const { scan } = require("./scanner");\nmodule.exports = { scan };', '/tmp/index.js'],
    ['# 配置说明\n\n不要把 .env 提交进仓库。', '/tmp/CONFIG.md'],
    ['{ "name": "app", "version": "1.0.0" }', '/tmp/package.json']
  ];
  let checked = 0;
  for (const cmd of benignBash) {
    const d = decideBash(cmd);
    assert.strictEqual(d.decision, null, `良性命令被误判（${d.decision}）：${cmd}`);
    checked++;
  }
  for (const [content, fp] of benignWrites) {
    const d = decideWrite(fp, content);
    assert.strictEqual(d.decision, null, `良性写入被误判（${d.decision}）：${content.slice(0, 20)}`);
    checked++;
  }
  assert.ok(checked >= 30, `良性语料应 ≥30 条（现 ${checked}）`);
});

test('高危判据 S>=4 且 O>=3（v0.7.8 起只作软警告依据）', () => {
  assert.strictEqual(isHighRisk({ severity: { S: 5, O: 3, D: 3 } }), true);
  assert.strictEqual(isHighRisk({ severity: { S: 4, O: 3, D: 5 } }), true);
  assert.strictEqual(isHighRisk({ severity: { S: 5, O: 2, D: 5 } }), false, 'O=2 不拦（不可逆但低概率）');
  assert.strictEqual(isHighRisk({ severity: { S: 3, O: 4, D: 3 } }), false);
});

test('highRiskCards 从扫描结果过滤', () => {
  const fake = {
    matched: [
      { card: { id: 'A', severity: { S: 5, O: 3, D: 3 } } },
      { card: { id: 'B', severity: { S: 5, O: 2, D: 5 } } }
    ]
  };
  assert.deepStrictEqual(highRiskCards(fake).map(s => s.card.id), ['A']);
});

test('规则常量非空（防回归删减）', () => {
  assert.ok(READONLY_TOOLS.size >= 5);
  assert.ok(TRIVIAL_CMDS.size >= 10);
});
