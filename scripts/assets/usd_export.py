"""USD/USDZ -> raw GLB (no simplification), one primitive per palette tone. Called by build.mjs; dev machine only.

Usage: python usd_export.py <assets.json> <palette.json> <assets-src dir> <out dir> [name ...]

The output is in three.js axes in metres: Y up, origin on the ground at the asset's reference point (centre of the
footprint, or the rear axle for a vehicle). Positions are rounded to 0.1 mm so that vertices the source split along
hard edges weld back together, and every primitive is written in a stable order, so the output is deterministic.
"""
import io
import json
import os
import struct
import sys
import zipfile

import numpy as np
from PIL import Image
from pxr import Gf, Usd, UsdGeom, UsdShade


def tone_of(palette_entry, name, default_only=False):
    """First rule whose `match` is a substring of `name`; None means drop the face."""
    for rule in palette_entry.get('rules', []):
        if 'match' in rule and rule['match'].lower() in name:
            return None if rule.get('drop') else rule['tone']
    return palette_entry['default']


def mesh_faces(prim, mesh):
    """Fan-triangulated corner indices into the face-vertex list, plus each triangle's source face number."""
    counts = np.asarray(mesh.GetFaceVertexCountsAttr().Get(), dtype=np.int64)
    starts = np.concatenate(([0], np.cumsum(counts)[:-1]))
    fan = counts - 2
    keep = fan > 0
    tri_face = np.repeat(np.arange(len(counts))[keep], fan[keep])
    corner0 = np.repeat(starts[keep], fan[keep])
    # k-th triangle of a face uses corners 0, k + 1, k + 2
    offs = np.concatenate([np.arange(n) for n in fan[keep]]) if keep.any() else np.zeros(0, np.int64)
    tris = np.stack((corner0, corner0 + offs + 1, corner0 + offs + 2), axis=1)
    return tris, tri_face


def face_uvs(mesh, corners_total, face_vertex_indices):
    """UV per face-vertex corner from primvars:st, whatever its interpolation and indexing."""
    api = UsdGeom.PrimvarsAPI(mesh)
    st = api.GetPrimvar('st')
    if not st or not st.HasValue():
        return None
    values = np.asarray(st.ComputeFlattened(), dtype=np.float32)
    interp = st.GetInterpolation()
    if interp == UsdGeom.Tokens.faceVarying and len(values) == corners_total:
        return values
    if interp in (UsdGeom.Tokens.vertex, UsdGeom.Tokens.varying):
        return values[face_vertex_indices]
    raise ValueError(f'unsupported st interpolation {interp}')


def subset_materials(mesh, face_count, base_name):
    """Material name per source face, honouring materialBind GeomSubsets."""
    names = [base_name]
    per_face = np.zeros(face_count, dtype=np.int32)
    for subset in UsdGeom.Subset.GetAllGeomSubsets(mesh):
        bound = UsdShade.MaterialBindingAPI(subset.GetPrim()).ComputeBoundMaterial()[0]
        if not bound:
            continue
        faces = np.asarray(subset.GetIndicesAttr().Get(), dtype=np.int64)
        names.append(bound.GetPrim().GetName())
        per_face[faces] = len(names) - 1
    return names, per_face


def collect(stage, palette_entry, keep_uv):
    """World-space triangles grouped by tone: {tone: (positions Nx3 metres, uvs or None, triangles Mx3)}."""
    mpu = UsdGeom.GetStageMetersPerUnit(stage)
    up = UsdGeom.GetStageUpAxis(stage)
    cache = UsdGeom.XformCache()
    groups = {}
    source_tris = 0
    meshes = 0
    mats = set()
    pred = Usd.TraverseInstanceProxies(Usd.PrimIsActive & Usd.PrimIsDefined & ~Usd.PrimIsAbstract)
    prims = [p for p in Usd.PrimRange.Stage(stage, pred) if p.IsA(UsdGeom.Mesh)]
    prims.sort(key=lambda p: str(p.GetPath()))
    for prim in prims:
        img = UsdGeom.Imageable(prim)
        if img.ComputePurpose() in (UsdGeom.Tokens.guide, UsdGeom.Tokens.proxy):
            continue
        if img.ComputeVisibility() == UsdGeom.Tokens.invisible:
            continue
        mesh = UsdGeom.Mesh(prim)
        pts = mesh.GetPointsAttr().Get()
        fvi = mesh.GetFaceVertexIndicesAttr().Get()
        if not pts or not fvi:
            continue
        fvi = np.asarray(fvi, dtype=np.int64)
        tris, tri_face = mesh_faces(prim, mesh)
        source_tris += len(tris)
        meshes += 1
        points = np.asarray(pts, dtype=np.float64)

        matrix = np.array(cache.GetLocalToWorldTransform(prim), dtype=np.float64)  # row-vector convention
        world = points @ matrix[:3, :3] + matrix[3, :3]
        world *= mpu
        if up == 'Z':
            world = np.stack((world[:, 0], world[:, 2], -world[:, 1]), axis=1)
        # odd handedness or a mirror in the transform flips the winding
        flip = np.linalg.det(matrix[:3, :3]) < 0
        if mesh.GetOrientationAttr().Get() == UsdGeom.Tokens.leftHanded:
            flip = not flip
        if flip:
            tris = tris[:, [0, 2, 1]]

        bound = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
        base = bound.GetPrim().GetName() if bound else 'none'
        names, per_face = subset_materials(mesh, len(mesh.GetFaceVertexCountsAttr().Get()), base)
        mats.update(names)
        prim_name = str(prim.GetPath()).lower()
        tone_per_name = [tone_of(palette_entry, f'{prim_name} {n.lower()}') for n in names]

        uv = face_uvs(mesh, len(fvi), fvi) if keep_uv else None
        tri_tone = np.asarray([tone_per_name[i] or '' for i in per_face[tri_face]])
        for tone in sorted(set(tri_tone.tolist())):
            if not tone:
                continue
            sel = tris[tri_tone == tone]
            corners, inverse = np.unique(sel, return_inverse=True)
            pos = world[fvi[corners]]
            st = uv[corners] if uv is not None else None
            tri = inverse.reshape(-1, 3)
            groups.setdefault(tone, []).append((pos, st, tri))

    merged = {}
    for tone in sorted(groups):
        parts = groups[tone]
        offset = 0
        ps, us, ts = [], [], []
        for pos, st, tri in parts:
            ps.append(pos)
            if st is not None:
                us.append(st)
            ts.append(tri + offset)
            offset += len(pos)
        merged[tone] = (
            np.concatenate(ps),
            np.concatenate(us) if us else None,
            np.concatenate(ts),
        )
    return merged, {'sourceTris': source_tris, 'meshes': meshes, 'materials': sorted(mats)}


def split_by_height(groups, split):
    """Faces whose centroid is below `split['belowM']` above the lowest point go to `split['tone']`."""
    lowest = min(pos[:, 1].min() for pos, _, _ in groups.values())
    limit = lowest + split['belowM']
    out = {}
    for tone, (pos, uv, tri) in groups.items():
        below = pos[tri][:, :, 1].mean(axis=1) < limit
        if below.any():
            out.setdefault(split['tone'], []).append((pos, uv, tri[below]))
        if (~below).any():
            out.setdefault(tone, []).append((pos, uv, tri[~below]))
    merged = {}
    for tone in sorted(out):
        parts = out[tone]
        offset = 0
        ps, us, ts = [], [], []
        for pos, uv, tri in parts:
            ps.append(pos)
            if uv is not None:
                us.append(uv)
            ts.append(tri + offset)
            offset += len(pos)
        merged[tone] = (np.concatenate(ps), np.concatenate(us) if us else None, np.concatenate(ts))
    return merged


def bounds(groups):
    lo = np.min([pos.min(axis=0) for pos, _, _ in groups.values()], axis=0)
    hi = np.max([pos.max(axis=0) for pos, _, _ in groups.values()], axis=0)
    return lo, hi


def wheel_axles(groups, up_share=0.025, bins=120):
    """Along the longest horizontal axis, centres of the vertex clusters in the lowest `up_share` of the height: only
    tyres reach that low, so bumpers and underrun bars do not count as axles."""
    lo, hi = bounds(groups)
    pts = np.concatenate([pos for pos, _, _ in groups.values()])
    near = pts[pts[:, 1] < lo[1] + (hi[1] - lo[1]) * up_share]
    axis = 0 if (hi[0] - lo[0]) >= (hi[2] - lo[2]) else 2
    hist, edges = np.histogram(near[:, axis], bins=bins, range=(lo[axis], hi[axis]))
    centres = []
    i = 0
    active = hist > hist.max() * 0.05
    while i < bins:
        if active[i]:
            j = i
            while j + 1 < bins and active[j + 1]:
                j += 1
            weights = hist[i : j + 1]
            mids = (edges[i : j + 1] + edges[i + 1 : j + 2]) / 2
            centres.append(float((weights * mids).sum() / weights.sum()))
            i = j + 1
        else:
            i += 1
    return axis, centres


def place(groups, cfg):
    """Apply the asset's yaw and scale, then move the origin to the ground at its reference point."""
    place_cfg = cfg.get('place', {})
    yaw = np.radians(place_cfg.get('yawDeg', 0))
    c, s = np.cos(yaw), np.sin(yaw)
    rot = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    out = {tone: (pos @ rot.T, uv, tri) for tone, (pos, uv, tri) in groups.items()}
    length = place_cfg.get('lengthM')
    if length:
        lo, hi = bounds(out)
        factor = length / max(hi[0] - lo[0], hi[2] - lo[2])
        out = {tone: (pos * factor, uv, tri) for tone, (pos, uv, tri) in out.items()}
    lo, hi = bounds(out)
    origin = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    info = {}
    if place_cfg.get('origin') == 'rearAxle':
        axis, axles = wheel_axles(out)
        info['axlesBeforeOrigin'] = [round(a, 4) for a in axles]
        rear_sign = place_cfg['rearSign']
        # the rear is at -Z when rearSign is -1: the rear axle is the cluster nearest that end
        axle = min(axles) if rear_sign < 0 else max(axles)
        origin[axis] = axle
    out = {tone: (np.round(pos - origin, 4), uv, tri) for tone, (pos, uv, tri) in out.items()}
    lo, hi = bounds(out)
    info['sizeM'] = [round(float(v), 3) for v in hi - lo]
    info['boundsMin'] = [round(float(v), 3) for v in lo]
    info['boundsMax'] = [round(float(v), 3) for v in hi]
    return out, info


def read_usdz_image(path, member, size, quality):
    """Base-colour JPEG from the USDZ, resized, re-encoded; bytes are deterministic for fixed Pillow settings."""
    with zipfile.ZipFile(path) as archive:
        data = archive.read(member)
    image = Image.open(io.BytesIO(data)).convert('RGB')
    source_size = image.size
    if size:
        image = image.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    image.save(buf, format='JPEG', quality=quality, optimize=True, progressive=False, subsampling=2)
    return buf.getvalue(), source_size


def write_glb(path, groups, texture=None):
    """A minimal binary glTF: one node + mesh per tone, material name = tone, optional base-colour image."""
    blob = bytearray()
    views, accessors, meshes, nodes, materials = [], [], [], [], []

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        view = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target:
            view['target'] = target
        blob.extend(data)
        views.append(view)
        return len(views) - 1

    for tone in sorted(groups):
        pos, uv, tri = groups[tone]
        attrs = {}
        p32 = pos.astype('<f4')
        accessors.append(
            {
                'bufferView': add_view(p32.tobytes(), 34962),
                'componentType': 5126,
                'count': len(p32),
                'type': 'VEC3',
                'min': [float(v) for v in p32.min(axis=0)],
                'max': [float(v) for v in p32.max(axis=0)],
            }
        )
        attrs['POSITION'] = len(accessors) - 1
        if uv is not None:
            # glTF has the texture origin at the top left, USD at the bottom left
            flipped = uv.astype('<f4').copy()
            flipped[:, 1] = 1 - flipped[:, 1]
            accessors.append(
                {
                    'bufferView': add_view(flipped.tobytes(), 34962),
                    'componentType': 5126,
                    'count': len(flipped),
                    'type': 'VEC2',
                }
            )
            attrs['TEXCOORD_0'] = len(accessors) - 1
        indices = tri.astype('<u4').ravel()
        accessors.append(
            {
                'bufferView': add_view(indices.tobytes(), 34963),
                'componentType': 5125,
                'count': len(indices),
                'type': 'SCALAR',
            }
        )
        material = {'name': tone, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.7}}
        if texture is not None and uv is not None:
            material['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
        materials.append(material)
        meshes.append(
            {
                'name': tone,
                'primitives': [
                    {'attributes': attrs, 'indices': len(accessors) - 1, 'material': len(materials) - 1}
                ],
            }
        )
        nodes.append({'mesh': len(meshes) - 1, 'name': tone})

    doc = {
        'asset': {'version': '2.0', 'generator': 'scripts/assets/usd_export.py'},
        'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': accessors,
    }
    if texture is not None:
        doc['images'] = [{'bufferView': add_view(texture, None), 'mimeType': 'image/jpeg'}]
        doc['textures'] = [{'source': 0, 'sampler': 0}]
        doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    while len(blob) % 4:
        blob.append(0)
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(blob)}]
    text = json.dumps(doc, separators=(',', ':'), sort_keys=True).encode('utf-8')
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    with open(path, 'wb') as out:
        out.write(struct.pack('<III', 0x46546C67, 2, total))
        out.write(struct.pack('<II', len(text), 0x4E4F534A))
        out.write(text)
        out.write(struct.pack('<II', len(blob), 0x004E4942))
        out.write(bytes(blob))


def export_asset(cfg, palette, src_root, out_dir):
    source = os.path.join(src_root, cfg['source'])
    stage = Usd.Stage.Open(source, load=Usd.Stage.LoadAll)
    texture_cfg = cfg.get('texture')
    groups, info = collect(stage, palette[cfg['palette']], keep_uv=bool(texture_cfg))
    if not groups:
        raise RuntimeError(f"{cfg['name']}: no triangles after the palette rules")
    if cfg.get('splitBelow'):
        groups = split_by_height(groups, cfg['splitBelow'])
    groups, placed = place(groups, cfg)
    info.update(placed)

    texture = None
    if texture_cfg:
        texture, source_size = read_usdz_image(
            source, texture_cfg['member'], texture_cfg['size'], texture_cfg['quality']
        )
        info['textureSourceSize'] = list(source_size)
        info['textureBytes'] = len(texture)
    write_glb(os.path.join(out_dir, f"{cfg['name']}.raw.glb"), groups, texture)
    if texture_cfg and texture_cfg.get('rawCopy'):
        # the unsimplified mesh with the source JPEG, only for the before/after compare in /dev/assets
        with zipfile.ZipFile(source) as archive:
            original = archive.read(texture_cfg['member'])
        write_glb(os.path.join(out_dir, f"{cfg['name']}.compare.glb"), groups, original)

    folder = source if source.lower().endswith('.usdz') else os.path.dirname(source)
    if os.path.isdir(folder):
        size = 0
        for root, dirs, files in os.walk(folder):
            dirs[:] = [d for d in dirs if d not in ('.cache', '.thumbs')]
            size += sum(os.path.getsize(os.path.join(root, f)) for f in files)
    else:
        size = os.path.getsize(folder)
    info['sourceBytes'] = size
    info['sourceMetersPerUnit'] = UsdGeom.GetStageMetersPerUnit(stage)
    info['sourceUpAxis'] = str(UsdGeom.GetStageUpAxis(stage))
    return info


def main():
    assets_path, palette_path, src_root, out_dir = sys.argv[1:5]
    only = set(sys.argv[5:])
    with open(assets_path, encoding='utf-8') as f:
        assets = json.load(f)['assets']
    with open(palette_path, encoding='utf-8') as f:
        palette = json.load(f)
    os.makedirs(out_dir, exist_ok=True)
    report = {}
    for cfg in assets:
        if only and cfg['name'] not in only:
            continue
        if cfg.get('derivedFrom'):
            continue
        print(f"usd: {cfg['name']}", flush=True)
        report[cfg['name']] = export_asset(cfg, palette, src_root, out_dir)
    report_path = os.path.join(out_dir, 'export-report.json')
    previous = {}
    if os.path.exists(report_path):
        with open(report_path, encoding='utf-8') as f:
            previous = json.load(f)
    previous.update(report)
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(previous, f, indent=2, sort_keys=True)


if __name__ == '__main__':
    main()
