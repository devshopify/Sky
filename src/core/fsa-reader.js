const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.idea', '.vscode',
  '.cache', '__pycache__', '.workbuddy', '.sass-cache', 'dist', 'build',
]);

export function hasDirectoryPicker() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** 让用户选一个目录，返回 FileSystemDirectoryHandle */
export async function pickDirectory(mode = 'read') {
  if (!hasDirectoryPicker()) {
    throw new Error('当前浏览器不支持选择文件夹，请改用 Chrome / Edge，或拖入 zip');
  }
  return window.showDirectoryPicker({ mode });
}

/**
 * 基于 File System Access API 的 reader
 */
export async function createFsaReader(dirHandle, { writable = false, onProgress } = {}) {
  const index = new Map();
  const meta = [];

  async function walk(handle, prefix, depth) {
    for await (const [name, child] of handle.entries()) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child.kind === 'directory') {
        if (depth < 12) await walk(child, rel, depth + 1);
      } else {
        index.set(rel, child);
      }
    }
  }

  await walk(dirHandle, '', 0);

  let count = 0;
  for (const [rel, handle] of index) {
    let size = 0;
    let mtime = 0;
    try {
      const f = await handle.getFile();
      size = f.size;
      mtime = f.lastModified;
    } catch { /* ignore */ }
    meta.push({ rel, size, mtime });
    count += 1;
    if (onProgress && count % 200 === 0) {
      onProgress({ phase: 'index', done: count, total: index.size });
    }
  }

  const getHandle = (rel) => {
    const h = index.get(rel);
    if (!h) throw new Error(`文件不存在：${rel}`);
    return h;
  };

  return {
    label: dirHandle.name,
    kind: 'fsa',
    writable,
    async list() {
      return meta;
    },
    async readText(rel) {
      const file = await getHandle(rel).getFile();
      return file.text();
    },
    async readBytes(rel) {
      const file = await getHandle(rel).getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
    async writeBytes(rel, bytes) {
      if (!writable) throw new Error('该目录未授权写入');
      const parts = rel.split('/');
      const fileName = parts.pop();
      let dir = dirHandle;
      for (const p of parts) {
        // eslint-disable-next-line no-await-in-loop
        dir = await dir.getDirectoryHandle(p, { create: true });
      }
      const fh = await dir.getFileHandle(fileName, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();

      index.set(rel, fh);
      const f = await fh.getFile();
      const existing = meta.find((m) => m.rel === rel);
      if (existing) {
        existing.size = f.size;
        existing.mtime = f.lastModified;
      } else {
        meta.push({ rel, size: f.size, mtime: f.lastModified });
      }
    },
  };
}

/**
 * 内存 reader：用于 zip 解压后的虚拟目录
 */
export function createMemoryReader(label, fileMap) {
  const files = fileMap; // Map<rel, Uint8Array>
  let meta = null;

  const buildMeta = () => {
    if (meta) return meta;
    meta = [...files.entries()].map(([rel, bytes]) => ({ rel, size: bytes.length, mtime: 0 }));
    return meta;
  };

  return {
    label,
    kind: 'memory',
    writable: true,
    async list() {
      return buildMeta();
    },
    async readText(rel) {
      const b = files.get(rel);
      if (!b) throw new Error(`文件不存在：${rel}`);
      return new TextDecoder('utf-8').decode(b);
    },
    async readBytes(rel) {
      const b = files.get(rel);
      if (!b) throw new Error(`文件不存在：${rel}`);
      return b;
    },
    async writeBytes(rel, bytes) {
      files.set(rel, bytes);
      meta = null;
    },
    exportFiles() {
      return files;
    },
  };
}
