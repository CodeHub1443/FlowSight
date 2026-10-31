"""Read-only USD report: tris, meshes, materials, units, up axis, world bounds, on-disk size.

Usage: python usd_inspect.py <file.usd|usda|usdc|usdz> [...]
"""
import json
import os
import sys

from pxr import Gf, Usd, UsdGeom, UsdShade


def dir_size(path):
    """Size of the file, plus its folder when the asset is a folder of payloads and textures."""
    if path.lower().endswith('.usdz'):
        return os.path.getsize(path)
    folder = os.path.dirname(path)
    total = 0
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in ('.cache', '.thumbs')]
        total += sum(os.path.getsize(os.path.join(root, f)) for f in files)
    return total


def inspect(path):
    stage = Usd.Stage.Open(path, load=Usd.Stage.LoadAll)
    up = UsdGeom.GetStageUpAxis(stage)
    mpu = UsdGeom.GetStageMetersPerUnit(stage)
    cache = UsdGeom.XformCache()
    meshes = tris = verts = 0
    mats = set()
    lo = [float('inf')] * 3
    hi = [float('-inf')] * 3
    purposes = {}
    pred = Usd.TraverseInstanceProxies(Usd.PrimIsActive & Usd.PrimIsDefined & ~Usd.PrimIsAbstract)
    for prim in Usd.PrimRange.Stage(stage, pred):
        if not prim.IsA(UsdGeom.Mesh):
            continue
        img = UsdGeom.Imageable(prim)
        purpose = img.ComputePurpose()
        purposes[purpose] = purposes.get(purpose, 0) + 1
        if purpose in (UsdGeom.Tokens.guide, UsdGeom.Tokens.proxy):
            continue
        if img.ComputeVisibility() == UsdGeom.Tokens.invisible:
            continue
        mesh = UsdGeom.Mesh(prim)
        counts = mesh.GetFaceVertexCountsAttr().Get()
        pts = mesh.GetPointsAttr().Get()
        if not counts or not pts:
            continue
        meshes += 1
        verts += len(pts)
        tris += sum(c - 2 for c in counts if c >= 3)
        bound = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
        if bound:
            mats.add(str(bound.GetPath()))
        m = cache.GetLocalToWorldTransform(prim)
        step = max(1, len(pts) // 4000)
        for p in list(pts)[::step]:
            w = m.Transform(Gf.Vec3d(p))
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    size = [round((hi[i] - lo[i]) * mpu, 3) if meshes else None for i in range(3)]
    return {
        'path': os.path.abspath(path).replace(os.sep, '/'),
        'bytes_folder': dir_size(path),
        'up': str(up),
        'metersPerUnit': mpu,
        'meshes': meshes,
        'tris': tris,
        'verts': verts,
        'materials': len(mats),
        'size_m_xyz': size,
        'purposes': {str(k): v for k, v in purposes.items()},
    }


for arg in sys.argv[1:]:
    try:
        print(json.dumps(inspect(arg)), flush=True)
    except Exception as exc:  # report and keep going: one broken file must not hide the rest
        print(json.dumps({'path': arg, 'error': str(exc)[:300]}), flush=True)
