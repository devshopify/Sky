import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/** GitHub Pages 目标仓库与分支 */
const REPO = process.env.GH_PAGES_REPO || 'https://github.com/devshopify/Sky.git';
const BRANCH = 'gh-pages';

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log('▸ 构建（base = /Sky/）');
run('npx vite build --mode ghpages');

// Jekyll 会把下划线开头的文件吃掉，禁用它
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log('▸ 推送到 gh-pages');
run('git init -q', DIST);
run('git add -A', DIST);
run('git -c core.autocrlf=false commit -q -m "deploy: GitHub Pages build"', DIST);
run(`git push -f ${REPO} HEAD:${BRANCH}`, DIST);

console.log('');
console.log('完成。约 30~60 秒后生效：');
console.log('  https://devshopify.github.io/Sky/');
