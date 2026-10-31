// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ADR-13 budgets. They read the committed output, so they hold on any machine, with or without assets-src/.

const MODELS = fileURLToPath(new URL('../../public/models/', import.meta.url));
const MANIFEST = `${MODELS}manifest.json`;
const GENERATED = fileURLToPath(
  new URL('../../src/scene/assets/manifest.generated.json', import.meta.url),
);
const MATERIALS = fileURLToPath(new URL('../../src/scene/materials.ts', import.meta.url));

const KB = 1024;
const MAX_TRIS = {
  pallet: 1500,
  box: 100,
  palletJack: 4000,
  forklift: 10000,
  crate: 800,
  scanner: 1500,
  truck: 15000,
};
const MAX_BYTES = { forklift: 600 * KB, truck: 600 * KB };
const DEFAULT_MAX_BYTES = 250 * KB;
const TOTAL_MAX_BYTES = 4 * 1024 * KB;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const entries = Object.entries(manifest.assets);

describe('model budgets (ADR-13)', () => {
  it('has every asset the scene and the backlog need', () => {
    const kinds = new Set(entries.map(([, a]) => a.kind));
    expect([...kinds].sort()).toEqual(Object.keys(MAX_TRIS).sort());
  });

  it.each(entries)('%s stays inside its triangle budget', (_name, asset) => {
    expect(MAX_TRIS[asset.kind], `unknown kind ${asset.kind}`).toBeDefined();
    expect(asset.tris).toBeLessThanOrEqual(MAX_TRIS[asset.kind]);
    expect(asset.tris).toBeGreaterThan(0);
  });

  it.each(entries)('%s stays inside its size budget', (_name, asset) => {
    expect(asset.bytes).toBeLessThanOrEqual(MAX_BYTES[asset.kind] ?? DEFAULT_MAX_BYTES);
  });

  it('stays inside the total budget, counted from the files themselves', () => {
    const glbs = readdirSync(MODELS).filter((f) => f.endsWith('.glb'));
    const total = glbs.reduce((n, f) => n + statSync(`${MODELS}${f}`).size, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_MAX_BYTES);
    expect(total).toBe(manifest.totalBytes);
  });
});

describe('manifest integrity', () => {
  it.each(entries)(
    '%s: the file exists, its name is its content hash, the size is right',
    (name, a) => {
      const path = `${MODELS}${a.file}`;
      expect(existsSync(path)).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length).toBe(a.bytes);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      expect(a.file).toBe(`${name}.${hash}.glb`);
    },
  );

  it('has no GLB the manifest does not list', () => {
    const listed = entries.map(([, a]) => a.file).sort();
    expect(
      readdirSync(MODELS)
        .filter((f) => f.endsWith('.glb'))
        .sort(),
    ).toEqual(listed);
  });

  it.each(entries)('%s records its source path, inside assets-src and not absolute', (_n, a) => {
    expect(a.source.length).toBeGreaterThan(0);
    expect(a.source).not.toMatch(/^[a-z]:|^\//i);
    expect(a.trisSource).toBeGreaterThanOrEqual(a.tris);
  });

  it('bundles the same manifest the public folder carries', () => {
    expect(readFileSync(GENERATED, 'utf8')).toBe(readFileSync(MANIFEST, 'utf8'));
  });

  it('paints from palette tokens, except the truck (the one texture, ADR-13)', () => {
    const source = readFileSync(MATERIALS, 'utf8');
    for (const [name, a] of entries) {
      expect(a.textured, name).toBe(a.kind === 'truck');
      if (a.textured) continue;
      for (const tone of a.tones) {
        expect(source, `${name}: ${tone} is not a palette key`).toMatch(
          new RegExp(`\\b${tone}\\b`),
        );
      }
    }
  });

  it('holds real binary glTF with meshopt compression and no CDN decoder reference', () => {
    for (const [name, a] of entries) {
      const bytes = readFileSync(`${MODELS}${a.file}`);
      expect(bytes.readUInt32LE(0), name).toBe(0x46546c67);
      const json = bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12));
      expect(json, name).toContain('EXT_meshopt_compression');
      expect(json, name).not.toContain('KHR_draco_mesh_compression');
      expect(json, name).not.toMatch(/https?:/);
    }
  });
});
