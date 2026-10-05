import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeServiceWorker, type PrecacheEntry } from '../scripts/build-service-worker';

const scope = 'https://example.test/complexweeper/';
const prefix = `complexweeper-web:${encodeURIComponent(scope)}:`;
const templatePath = resolve('public/sw.js');
const temporaryDirectories: string[] = [];

function integrity(body: string): string {
  return `sha256-${createHash('sha256').update(body).digest('base64')}`;
}

function setupWorker(template: string, resources: Record<string, string>, revision = 'current') {
  const entries: PrecacheEntry[] = Object.entries(resources).map(([path, body]) => ({
    path,
    integrity: integrity(body),
    immutable: /-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(path),
  }));
  const listeners = new Map<string, (event: unknown) => void>();
  const records = new Map<string, Map<string, Response>>();
  let offline = false;
  const network = new Map(Object.entries(resources).map(([path, body]) => [new URL(path, scope).href, new Response(body)]));
  const fetch = vi.fn(async (request: Request) => {
    if (offline) throw new TypeError('offline');
    const response = network.get(request.url);
    if (!response) return new Response('missing', { status: 404 });
    // Match browser fetch integrity checks, including a deployment changing
    // fixed filenames while this worker still controls the previous release.
    if (response.ok && request.integrity && integrity(await response.clone().text()) !== request.integrity) {
      throw new TypeError('integrity mismatch');
    }
    return response.clone();
  });
  const caches = {
    keys: vi.fn(async () => [...records.keys()]),
    delete: vi.fn(async (key: string) => records.delete(key)),
    open: vi.fn(async (name: string) => {
      if (!records.has(name)) records.set(name, new Map());
      const cache = records.get(name)!;
      return {
        match: async (request: string | Request) => cache.get(typeof request === 'string' ? request : request.url)?.clone(),
        put: async (request: string | Request, response: Response) => {
          cache.set(typeof request === 'string' ? request : request.url, response.clone());
        },
        addAll: async (requests: Request[]) => {
          const responses = await Promise.all(requests.map((request) => fetch(request)));
          if (responses.some((response) => !response.ok)) throw new TypeError('precache failed');
          requests.forEach((request, i) => cache.set(request.url, responses[i].clone()));
        },
      };
    }),
  };
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  const source = template.replace('__CW_REVISION__', revision).replace('/* __CW_PRECACHE__ */ []', JSON.stringify(entries));
  runInNewContext(source, {
    self: { registration: { scope }, addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener), skipWaiting, clients: { claim } },
    caches,
    fetch,
    URL,
    Request,
    Response,
    Map,
  });

  return {
    records,
    network,
    fetch,
    caches,
    skipWaiting,
    claim,
    setOffline: (value: boolean) => { offline = value; },
    lifecycle: async (name: string) => {
      let pending: Promise<unknown> | undefined;
      listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
      await pending;
    },
    request: (path: string, options: { mode?: string; method?: string } = {}): Promise<Response> | undefined => {
      let response: Promise<Response> | undefined;
      listeners.get('fetch')!({
        request: { url: new URL(path, scope).href, method: options.method || 'GET', mode: options.mode || 'cors' },
        respondWith: (promise: Promise<Response>) => { response = promise; },
      });
      return response;
    },
  };
}

const resources = {
  'index.html': '<html><script src="assets/index-12345678.js"></script></html>',
  'assets/index-12345678.js': 'window.playable = true;',
  'assets/atlas.json': '{"version":1}',
  'assets/atlas.png': 'atlas pixels',
  'manifest.webmanifest': '{"start_url":"./"}',
  'assets/icon-192.png': 'icon pixels',
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('service worker lifecycle', () => {
  it('installs the shell, hashed game bundle, and fixed assets before an offline revisit', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    await worker.lifecycle('install');
    expect(worker.fetch).toHaveBeenCalledTimes(Object.keys(resources).length);
    expect(worker.records.get(`${prefix}current`)?.size).toBe(Object.keys(resources).length);
    worker.setOffline(true);
    for (const [path, body] of Object.entries(resources)) {
      const response = await worker.request(path === 'index.html' ? './?offline=1' : path, { mode: path === 'index.html' ? 'navigate' : 'cors' });
      expect(await response!.text()).toBe(body);
    }
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    expect(worker.claim).not.toHaveBeenCalled();
  });

  it('rejects incomplete or mismatched installations', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    worker.network.set(new URL('assets/index-12345678.js', scope).href, new Response('unavailable', { status: 503 }));
    await expect(worker.lifecycle('install')).rejects.toThrow('precache failed');
    expect(worker.records.get(`${prefix}current`)?.size).toBe(0);

    worker.network.set(new URL('assets/index-12345678.js', scope).href, new Response('wrong release'));
    await expect(worker.lifecycle('install')).rejects.toThrow('integrity mismatch');
    expect(worker.records.get(`${prefix}current`)?.size).toBe(0);
  });

  it('cleans only its own scope versions when normal activation occurs', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    worker.records.set(`${prefix}previous`, new Map());
    worker.records.set('complexweeper-web-v1', new Map());
    worker.records.set(`complexweeper-web:${encodeURIComponent('https://example.test/sibling/')}:previous`, new Map());
    worker.records.set('another-app-cache', new Map());
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    expect(worker.caches.delete).toHaveBeenCalledTimes(1);
    expect(worker.caches.delete).toHaveBeenCalledWith(`${prefix}previous`);
    expect(worker.records.has('complexweeper-web-v1')).toBe(true);
    expect(worker.records.has('another-app-cache')).toBe(true);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    expect(worker.claim).not.toHaveBeenCalled();
  });
});

describe('service worker requests', () => {
  it('preserves cached shell and fixed assets on HTTP errors or changed release contents', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    await worker.lifecycle('install');
    for (const path of ['index.html', 'assets/atlas.json']) {
      worker.network.set(new URL(path, scope).href, new Response('unavailable', { status: 503 }));
      const response = await worker.request(path, { mode: path === 'index.html' ? 'navigate' : 'cors' });
      expect(await response!.text()).toBe(resources[path as keyof typeof resources]);
      worker.network.set(new URL(path, scope).href, new Response('next release'));
      expect(await (await worker.request(path))!.text()).toBe(resources[path as keyof typeof resources]);
      const cached = worker.records.get(`${prefix}current`)!.get(new URL(path, scope).href)!;
      expect(await cached.text()).toBe(resources[path as keyof typeof resources]);
    }
  });

  it('uses network first for fixed assets and navigation, cache first for hashed bundles', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    await worker.lifecycle('install');
    worker.fetch.mockClear();
    await worker.request('assets/index-12345678.js');
    expect(worker.fetch).not.toHaveBeenCalled();
    await worker.request('./', { mode: 'navigate' });
    await worker.request('assets/atlas.json');
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    for (const [request] of worker.fetch.mock.calls) {
      expect(request.cache).toBe('no-cache');
      expect(request.integrity).toMatch(/^sha256-/);
    }
  });

  it('never caches a non-ok response when a resource has no cache entry', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    worker.network.set(new URL('assets/atlas.json', scope).href, new Response('unavailable', { status: 503 }));
    expect((await worker.request('assets/atlas.json'))!.status).toBe(503);
    expect(worker.records.get(`${prefix}current`)?.size).toBe(0);
  });

  it('leaves sibling applications and unknown scope paths to the browser', async () => {
    const worker = setupWorker(await readFile(templatePath, 'utf8'), resources);
    for (const path of ['/sibling/', '/sibling/assets/atlas.png', '/complexweeper-other/', 'unrelated.txt', 'https://external.test/complexweeper/assets/atlas.png']) {
      expect(worker.request(path, { mode: 'navigate' })).toBeUndefined();
    }
    expect(worker.request('assets/atlas.json', { method: 'POST' })).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
  });
});

describe('build-derived precache', () => {
  it('includes every generated bundle and public asset and changes revision when contents change', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'complexweeper-sw-'));
    temporaryDirectories.push(dir);
    await mkdir(join(dir, 'assets'));
    for (const [path, body] of Object.entries({ ...resources, 'assets/index-12345678.css': '.board { display: block; }', 'assets/icon-512.png': 'large icon' })) {
      await writeFile(join(dir, path), body);
    }
    const first = await writeServiceWorker(dir, templatePath);
    const source = await readFile(join(dir, 'sw.js'), 'utf8');
    expect(first.entries.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'index.html', 'assets/index-12345678.js', 'assets/index-12345678.css', 'manifest.webmanifest',
      'assets/atlas.json', 'assets/atlas.png', 'assets/icon-192.png', 'assets/icon-512.png',
    ]));
    expect(source).toContain(first.revision);
    expect(source).not.toContain('__CW_PRECACHE__');
    expect(first.entries.find((entry) => entry.path.endsWith('.js'))?.immutable).toBe(true);
    expect(first.entries.find((entry) => entry.path.endsWith('.png'))?.immutable).toBe(false);
    expect((await writeServiceWorker(dir, templatePath)).revision).toBe(first.revision);
    await writeFile(join(dir, 'assets/atlas.json'), '{"version":2}');
    const changedAsset = await writeServiceWorker(dir, templatePath);
    expect(changedAsset.revision).not.toBe(first.revision);
    await writeFile(join(dir, 'assets/index-12345678.js'), 'window.playable = "new release";');
    expect((await writeServiceWorker(dir, templatePath)).revision).not.toBe(changedAsset.revision);
  });
});
