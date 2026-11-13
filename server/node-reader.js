import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode',
  '.cache', '__pycache__', '.workbuddy', '.sass-cache', 'dist', 'build',
]);

function walk(dir, root, out, depth = 0) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || depth > 12) continue;
      walk(abs, root, out, depth + 1);
    } else if (e.isFile()) {
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      out.push({
        rel: path.relative(root, abs).split(path.sep).join('/'),
        size: st.size,
        mtime: st.mtimeMs,
      });
    }
  }
}

export function createNodeReader(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) throw new Error(`目录不存在：${root}`);
  if (!fs.statSync(root).isDirectory()) throw new Error(`不是目录：${root}`);
  const writable = options.writable !== false;

  const resolveInside = (rel) => {
    const abs = path.resolve(path.join(root, rel));
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`路径越界：${rel}`);
    return abs;
  };

  return {
    label: path.basename(root),
    root,
    async list() {
      const out = [];
      walk(root, root, out);
      return out;
    },
    async readText(rel) {
      return fs.readFileSync(resolveInside(rel), 'utf8');
    },
    async readBytes(rel) {
      return new Uint8Array(fs.readFileSync(resolveInside(rel)));
    },
    async writeBytes(rel, bytes) {
      if (!writable) throw new Error('当前为只读模式');
      const abs = resolveInside(rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(bytes));
    },
    async exists(rel) {
      return fs.existsSync(resolveInside(rel));
    },
  };
}

export { walk, SKIP_DIRS };
