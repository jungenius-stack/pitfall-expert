'use strict';
/** 压平引擎时的引用改写（由 pack-engine-flat.sh 调用）：只改目标副本，不碰仓库源码。 */
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
if (!dir) { console.error('用法：node flatten-rewrite.cjs <目标engine目录>'); process.exit(2); }

for (const f of ['scanner.js', 'report.js', 'cli.js']) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  const notes = [];

  // 1) js-yaml → 同目录单文件版
  const t1 = s.replace(/require\((['"])js-yaml\1\)/g, 'require("./js-yaml.cjs")');
  if (t1 !== s) notes.push('js-yaml');
  s = t1;

  // 2) ../package.json → ./version.json
  const t2 = s.replace(/require\((['"])\.\.\/package\.json\1\)/g, 'require("./version.json")');
  if (t2 !== s) notes.push('version');
  s = t2;

  // 3) 卡库默认路径：仓库是 engine/src → ../../cards；压平后是 engine → ../cards
  const t3 = s.replace(/path\.resolve\(__dirname,\s*'\.\.\/\.\.\/cards'\)/g, "path.resolve(__dirname, '../cards')");
  if (t3 !== s) notes.push('cardsDir');
  s = t3;

  // 4) __dirname 基准的仓库根推断（report/feedback 里可能用到）
  const t4 = s.replace(/path\.resolve\(__dirname,\s*'\.\.\/\.\.\/'\)/g, "path.resolve(__dirname, '../')");
  if (t4 !== s) notes.push('repoRoot');
  s = t4;

  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log(`改写引用: ${f} (${notes.join(', ')})`);
  }
}
