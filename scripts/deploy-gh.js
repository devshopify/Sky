import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/** GitHub Pages 目标仓库与分支 */
const REPO = process.env.GH_PAGES_REPO || 'https://github.com/devshopify/Sky-removal-json.git';
const BRANCH = 'gh-pages';

/** 发布基址：跟 .env.ghpages 里的 VITE_BASE 保持一致，避免日志写死过期 */
function readBase() {
  const envFile = path.join(ROOT, '.env.ghpages');
  if (!fs.existsSync(envFile)) return './';
  const matched = fs.readFileSync(envFile, 'utf8').match(/^\s*VITE_BASE\s*=\s*(\S+)/m);
  return matched ? matched[1] : './';
}

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log(`▸ 构建（base = ${readBase()}）`);
run('npx vite build --mode ghpages');

// Jekyll 会把下划线开头的文件吃掉，禁用它
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

/**
 * 在系统临时目录里建仓推送。
 * 不要在 dist 里 git init —— 那样编辑器会把 dist 当成第二个仓库。
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-pages-'));

try {
  console.log('▸ 准备发布内容');
  fs.cpSync(DIST, tmp, { recursive: true });

  console.log('▸ 推送到 gh-pages');
  run('git init -q', tmp);
  run(`git remote add origin ${REPO}`, tmp);
  run('git add -A', tmp);
  run('git -c core.autocrlf=false commit -q -m "deploy: GitHub Pages build"', tmp);
  run(`git push -f origin HEAD:${BRANCH}`, tmp);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('');
console.log('完成。约 30~60 秒后生效：');
console.log('  https://devshopify.github.io/Sky-removal-json/');
