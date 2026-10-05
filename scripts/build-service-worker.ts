import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface PrecacheEntry {
  path: string;
  integrity: string;
  immutable: boolean;
}

async function collectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function writeServiceWorker(outDir: string, templatePath: string): Promise<{
  revision: string;
  entries: PrecacheEntry[];
}> {
  const template = await readFile(templatePath, 'utf8');
  const revisionHash = createHash('sha256').update(template);
  const entries: PrecacheEntry[] = [];
  for (const file of (await collectFiles(outDir)).sort()) {
    const path = relative(outDir, file).split('\\').join('/');
    if (path === 'sw.js') continue;
    const bytes = await readFile(file);
    revisionHash.update(path).update('\0').update(bytes).update('\0');
    entries.push({
      path,
      integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
      immutable: /-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(path),
    });
  }
  if (!entries.some((entry) => entry.path === 'index.html')) throw new Error('Missing application shell');
  const revision = revisionHash.digest('hex').slice(0, 24);
  const worker = template.replace('__CW_REVISION__', revision).replace('/* __CW_PRECACHE__ */ []', JSON.stringify(entries));
  await writeFile(join(outDir, 'sw.js'), worker);
  return { revision, entries };
}
