// `pnpm assets:build`: USD/USDZ under assets-src/ -> web GLBs in public/models/ + manifest.json (ADR-13).
// Offline, dev machine only; the sources are gitignored, the output is committed. Re-runnable and deterministic: no
// timestamps, no random seeds, stable order, and the file name is a hash of the file content.
//
//   node scripts/assets/build.mjs                 everything, USD export included
//   node scripts/assets/build.mjs --skip-usd      reuse assets-src/.build/*.raw.glb (fast: simplify + encode only)
//   node scripts/assets/build.mjs truck forklift  only these; the other manifest entries and files are kept
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Accessor, Logger, NodeIO, PropertyType } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { format } from 'prettier';
import { creaseNormals } from './normals.mjs';
import { simplifyToBudget } from './simplify.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'assets-src');
const BUILD = join(SRC, '.build');
const OUT = join(ROOT, 'public', 'models');
const CONFIG = join(ROOT, 'scripts', 'assets', 'assets.json');
const PALETTE = join(ROOT, 'scripts', 'assets', 'palette.json');
const PYTHON = join(
  SRC,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

const args = process.argv.slice(2);
const skipUsd = args.includes('--skip-usd');
const only = args.filter((a) => !a.startsWith('--'));
const { assets } = JSON.parse(readFileSync(CONFIG, 'utf8'));
const chosen = assets.filter((a) => only.length === 0 || only.includes(a.name));

if (!existsSync(SRC)) {
  throw new Error(
    'assets-src/ is missing: the build runs on the dev machine with the USD sources.',
  );
}

if (!skipUsd) {
  if (!existsSync(PYTHON)) {
    throw new Error(
      'No converter venv. Create it once: python -m venv assets-src/.venv && ' +
        'assets-src/.venv/Scripts/python -m pip install usd-core numpy pillow',
    );
  }
  const names = chosen.flatMap((a) => a.derivedFrom ?? a.name);
  const run = spawnSync(
    PYTHON,
    [
      '-I',
      join(ROOT, 'scripts/assets/usd_export.py'),
      CONFIG,
      PALETTE,
      SRC,
      BUILD,
      ...new Set(names),
    ],
    { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  // USD prints material and schema warnings about the sources on stderr; only a non-zero exit matters
  if (run.status !== 0) throw new Error(`usd_export.py failed:\n${run.stderr.slice(-4000)}`);
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const report = JSON.parse(readFileSync(join(BUILD, 'export-report.json'), 'utf8'));
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
  });

/** Every primitive's attributes and indices, read out of a welded glTF document. */
function primitivesOf(doc) {
  return doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
}

function triangleCount(doc) {
  return primitivesOf(doc).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
}

function measure(simplified) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const { result } of simplified) {
    for (let i = 0; i < result.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], result.positions[i + k]);
        hi[k] = Math.max(hi[k], result.positions[i + k]);
      }
    }
  }
  return hi.map((v, k) => +(v - lo[k]).toFixed(3));
}

function setIndices(doc, prim, indices) {
  const accessor = doc
    .createAccessor()
    .setType(Accessor.Type.SCALAR)
    .setArray(indices)
    .setBuffer(doc.getRoot().listBuffers()[0]);
  prim.setIndices(accessor);
}

async function convert(cfg) {
  const rawName = cfg.derivedFrom ?? cfg.name;
  const doc = await io.read(join(BUILD, `${rawName}.raw.glb`));
  const textured = Boolean(cfg.texture);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  // materials are left out of dedup: they differ only by name here, and the name is the palette token
  await doc.transform(
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    weld(),
  );
  const before = triangleCount(doc);

  const prims = primitivesOf(doc).map((prim) => ({
    prim,
    positions: prim.getAttribute('POSITION').getArray(),
    uvs: prim.getAttribute('TEXCOORD_0')?.getArray() ?? null,
    indices: Uint32Array.from(prim.getIndices().getArray()),
    uvWeight: cfg.uvWeight,
  }));
  const simplified = simplifyToBudget(MeshoptSimplifier, prims, cfg.targetTris);

  for (const { prim, result } of simplified) {
    const normals = creaseNormals(result.positions, result.uvs, result.indices, cfg.creaseDeg);
    prim.getAttribute('POSITION').setArray(normals.positions);
    if (textured) prim.getAttribute('TEXCOORD_0').setArray(normals.uvs);
    const normalAccessor = doc
      .createAccessor()
      .setType(Accessor.Type.VEC3)
      .setArray(normals.normals)
      .setBuffer(doc.getRoot().listBuffers()[0]);
    prim.setAttribute('NORMAL', normalAccessor);
    setIndices(doc, prim, normals.indices);
  }

  for (const material of doc.getRoot().listMaterials()) {
    material.setRoughnessFactor(textured ? 0.72 : 0.66).setMetallicFactor(0);
    material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    if (!textured) material.setBaseColorTexture(null);
  }

  await doc.transform(
    prune({ keepAttributes: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const glb = await io.writeBinary(doc);
  const hash = createHash('sha256').update(glb).digest('hex').slice(0, 10);
  const file = `${cfg.name}.${hash}.glb`;

  const exported = report[rawName] ?? {};
  // from the final mesh: the instanced props are scaled to their footprint from these extents
  const sizeM = measure(simplified);
  const tones = [
    ...new Set(
      doc
        .getRoot()
        .listMaterials()
        .map((m) => m.getName()),
    ),
  ].sort();
  return {
    glb,
    entry: {
      file,
      kind: cfg.kind,
      bytes: glb.length,
      tris: triangleCount(doc),
      trisSource: exported.sourceTris ?? before,
      source: (cfg.source ?? assets.find((a) => a.name === rawName).source).replaceAll('\\', '/'),
      sourceBytes: exported.sourceBytes ?? 0,
      sizeM,
      tones,
      textured,
      ...(exported.axlesBeforeOrigin ? { axlesBeforeOrigin: exported.axlesBeforeOrigin } : {}),
    },
  };
}

mkdirSync(OUT, { recursive: true });
const manifestPath = join(OUT, 'manifest.json');
const previous = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8')).assets
  : {};
const entries = only.length === 0 ? {} : { ...previous };

for (const cfg of chosen) {
  const { glb, entry } = await convert(cfg);
  for (const old of readdirSync(OUT)) {
    if (old.startsWith(`${cfg.name}.`) && old.endsWith('.glb')) rmSync(join(OUT, old));
  }
  writeFileSync(join(OUT, entry.file), glb);
  entries[cfg.name] = entry;
  console.log(
    `${cfg.name.padEnd(22)} ${String(entry.trisSource).padStart(8)} -> ${String(entry.tris).padStart(6)} tris  ${(entry.bytes / 1024).toFixed(1).padStart(7)} KB  ${entry.file}`,
  );
}

const ordered = Object.fromEntries(
  Object.keys(entries)
    .sort()
    .map((k) => [k, entries[k]]),
);
const totalBytes = Object.values(ordered).reduce((n, a) => n + a.bytes, 0);
const manifestText = await format(JSON.stringify({ totalBytes, assets: ordered }), {
  parser: 'json',
});
writeFileSync(manifestPath, manifestText);
// Vite refuses imports from public/, so the runtime bundles this copy (budget.test.mjs checks they are the same)
writeFileSync(join(ROOT, 'src/scene/assets/manifest.generated.json'), manifestText);
// a GLB whose asset left assets.json must not linger in public/
if (only.length === 0) {
  const keep = new Set(Object.values(ordered).map((a) => a.file));
  for (const old of readdirSync(OUT)) {
    if (old.endsWith('.glb') && !keep.has(old)) rmSync(join(OUT, old));
  }
}
console.log(`total ${(totalBytes / 1024).toFixed(1)} KB -> ${resolve(manifestPath)}`);
