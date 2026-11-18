# Blender (modo consola): construye las armas detalladas a partir de las recetas exportadas por
# tools/build-weapons.mjs y las guarda en un único GLB.
#   · cajas con bisel (bordes redondeados que atrapan la luz) y cilindros con más lados
#   · tallados booleanos: ventanas de expulsión, ranuras, estrías, agujeros
#   · normales suaves con aristas vivas + normales ponderadas
#   · UV por proyección cúbica a escala real (las texturas procedurales se ven con la misma densidad)
# Convención: coordenadas del juego (Y arriba, cañón a -Z) → Blender (x, -z, y); el exportador glTF
# lo devuelve a Y arriba. Cada malla se llama "<arma>__<pieza>__<material>".
import bpy, bmesh, json, sys, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SPEC, OUT = argv[0], argv[1]
specs = json.load(open(SPEC, encoding='utf-8'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
JS2B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
UV_SCALE = 1 / 0.12          # la textura se repite cada 12 cm
SHARP = math.radians(32)


def js_matrix(p, r, s):
    T = Matrix.Translation(Vector(p))
    R = Matrix.Rotation(r[0], 4, 'X') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[2], 4, 'Z')  # orden XYZ de three.js
    S = Matrix.Diagonal((s[0], s[1], s[2], 1))
    return JS2B @ T @ R @ S


def make_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def prim_box(op, name):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.transform(bm, matrix=js_matrix(op['p'], op['r'], op['s']), verts=bm.verts)
    return make_obj(name, bm)


def cyl_segments(op):
    r = max(op['s'][0], op['s'][0] * op.get('k', 1))
    base = op.get('seg', 12)
    want = 32 if r >= 0.02 else 24 if r >= 0.009 else 16
    return max(base, want) if base >= 8 else base     # respeta formas facetadas a propósito (p. ej. 6 lados)


def prim_cyl(op, name, segs=None):
    bm = bmesh.new()
    k = op.get('k', 1.0)
    # three.js: CylinderGeometry(radioSuperior=k, radioInferior=1, altura=1) a lo largo de Y
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs or cyl_segments(op), radius1=1.0, radius2=max(k, 1e-4), depth=1.0)
    pre = Matrix.Rotation(-math.pi / 2, 4, 'X')   # Z de Blender → Y local de three.js
    bmesh.ops.transform(bm, matrix=js_matrix(op['p'], op['r'], op['s']) @ pre, verts=bm.verts)
    return make_obj(name, bm)


def prim_prof(op, name):
    """Perfil lateral [[z, y], …] extruido en X con grosor th (coordenadas del juego)."""
    bm = bmesh.new()
    x0, th = op['x'], op['th']
    pts = op['pts']
    # orientar el polígono para que la normal apunte a -X antes de extruir hacia +X
    area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if area < 0: pts = list(reversed(pts))
    vs = [bm.verts.new((x0 - th / 2, y, z)) for z, y in pts]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(th, 0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.transform(bm, matrix=JS2B, verts=bm.verts)
    return make_obj(name, bm)


def add_bevel(ob, width, segments=2, angle=30):
    if width <= 0: return
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = width; m.segments = segments; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    m.miter_outer = 'MITER_ARC'


def bbox_world(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))


def overlap(a, b):
    (amin, amax), (bmin, bmax) = a, b
    return all(amin[i] <= bmax[i] and bmin[i] <= amax[i] for i in range(3))


def evaluated_mesh_data(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(deps)
    me = ev.to_mesh()
    verts = [v.co.copy() for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return verts, faces


materials = {}
def material(name):
    if name not in materials:
        m = bpy.data.materials.new(name)
        materials[name] = m
    return materials[name]


def finish_mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate(clean_customdata=False)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # aristas vivas por ángulo, caras suaves
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > SHARP: e.smooth = False
        elif len(e.link_faces) != 2: e.smooth = False
    # UV por proyección cúbica a escala real
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for l in f.loops:
            co = l.vert.co
            l[uv].uv = (co[a] * UV_SCALE, co[b] * UV_SCALE)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(material(mat))
    wn = ob.modifiers.new('normales', 'WEIGHTED_NORMAL'); wn.keep_sharp = True; wn.weight = 60
    return ob


total_tris = 0
for wid, spec in specs.items():
    ops = spec['ops']
    holder = bpy.data.objects.new(f'W_{wid}', None)
    scene.collection.objects.link(holder)
    prims, cutters = [], []
    for i, op in enumerate(ops):
        nm = f'{wid}_{i}'
        if op['t'] == 'box':
            ob = prim_box(op, nm)
            mn = min(op['s'])
            add_bevel(ob, min(0.0035, max(0.0004, mn * 0.2)), segments=2)
        elif op['t'] == 'cyl':
            ob = prim_cyl(op, nm)
            r, ln = op['s'][0], op['s'][1]
            add_bevel(ob, min(0.0022, max(0.0003, min(r, ln) * 0.18)), segments=2, angle=50)
        elif op['t'] == 'prof':
            ob = prim_prof(op, nm)
            add_bevel(ob, min(0.004, max(0.0006, op['th'] * 0.22)), segments=3, angle=35)
        elif op['t'] == 'cut':
            ob = prim_box(op, nm); cutters.append((op, ob)); continue
        elif op['t'] == 'hole':
            ob = prim_cyl(op, nm, segs=op.get('seg', 16)); cutters.append((op, ob)); continue
        else:
            continue
        prims.append((op, ob))
    # tallados booleanos en las piezas que tocan
    for cop, cob in cutters:
        cob.hide_render = True; cob.display_type = 'WIRE'
        cb = bbox_world(cob)
        for op, ob in prims:
            if op['part'] != cop['part']: continue
            if not overlap(cb, bbox_world(ob)): continue
            m = ob.modifiers.new('tallado', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cob; m.solver = 'EXACT'
    # unir por pieza animable y material
    groups = {}
    for op, ob in prims:
        groups.setdefault((op['part'], op['mat']), []).append(ob)
    for (part, mat), obs in groups.items():
        verts, faces = [], []
        for ob in obs:
            v, f = evaluated_mesh_data(ob)
            off = len(verts); verts += v; faces += [tuple(i + off for i in face) for face in f]
        if not faces: continue
        res = finish_mesh(f'{wid}__{part}__{mat}', verts, faces, mat)
        res.parent = holder
        total_tris += sum(len(fc) - 2 for fc in faces)
    # limpiar primitivas y cortadores
    for _, ob in prims + cutters:
        bpy.data.objects.remove(ob, do_unlink=True)
    print(f'  {wid}: {len(prims)} piezas, {len(cutters)} tallados')

print(f'Triángulos totales: {total_tris}')
# los nombres de opciones del exportador cambian entre versiones: se pasan solo las que existen
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
wanted = dict(export_format='GLB', export_apply=True, export_yup=True, export_texcoords=True, export_texcoord=True,
              export_normals=True, export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
bpy.ops.export_scene.gltf(filepath=OUT, **{k: v for k, v in wanted.items() if k in props})
print('GLB exportado:', OUT)
