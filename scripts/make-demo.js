import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures');
const OUT = path.join(ROOT, 'public', 'demo');

function collect(dir, prefix, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) collect(abs, rel, acc);
    else acc[rel] = new Uint8Array(fs.readFileSync(abs));
  }
  return acc;
}

fs.mkdirSync(OUT, { recursive: true });

for (const name of ['A-theme', 'B-theme']) {
  const files = collect(path.join(FIXTURES, name), name, {});
  const data = zipSync(files, { level: 6 });
  fs.writeFileSync(path.join(OUT, `${name}.zip`), data);
  const kb = (data.length / 1024).toFixed(1);
  console.log(`${name}.zip  ${Object.keys(files).length} files  ${kb} KB`);
}
