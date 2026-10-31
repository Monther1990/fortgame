"""Blender 5.1 headless: Rustaq Fort (قلعة الرستاق), modelled from the owner's reference photo of the National Museum model
(references/rustaq-fort-model.png). Game-scale, stylised but faithful to the layout:
  - tall round tower at the front-left corner
  - the long two-storey front block with two rows of small windows and the main gate
  - stepped blocks behind it, rising to the roof rooms
  - the great curved bastion at the back with its tall round turret
  - two round towers on the rock outcrop to the right, joined by walls
  - the low outer enclosure (barbican) at the front-right with its gatehouse, stairs and a palm
Front (gate side) = +X, left = +Y, metres, origin at the centre of the footprint on the ground. One object per material is
exported as Fort_Rustaq with empties: Fort_Gate (where attackers arrive), Fort_Commander (the player on the parapet),
Fort_Cyber (Cyber above the fort).
Run:  blender.exe -b --python pipeline/build_fort.py [-- --preview]   ->  public/assets/fort.glb (+ pipeline/preview_fort*.png)
"""
import math
import os
import random
import sys
import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "assets", "fort.glb"))
PREVIEW = "--preview" in sys.argv
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
random.seed(1648)          # the year the fort was rebuilt under Nasir bin Murshid (a fixed seed, nothing more)


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexc, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(hexc), 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*srgb(hexc), 1)
    return m


MATS = ["Mud", "MudDark", "MudLight", "Window", "Wood", "Rock"]
M = {"Mud": mat("Mud", "#d8b88c"), "MudDark": mat("MudDark", "#bf9b70"), "MudLight": mat("MudLight", "#e6cfa6"),
     "Window": mat("Window", "#3b2a1f", 0.7), "Wood": mat("Wood", "#6e4627", 0.7), "Rock": mat("Rock", "#a98a64")}
MUD, DARK, LIGHT, WIN, WOOD, ROCK = range(len(MATS))
bm = bmesh.new()           # the whole fort is one bmesh; faces carry the material index


def tag(verts, mi):
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mi
    return verts


def box(c, s, mi=MUD, taper=0.0):
    """Axis-aligned box centred at c with size s; taper narrows the top (the batter of Omani mud-brick walls)."""
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        k = 1 - taper if v.co.z > 0 else 1
        v.co = Vector((c[0] + v.co.x * s[0] * k, c[1] + v.co.y * s[1] * k, c[2] + v.co.z * s[2]))
    return tag(r["verts"], mi)


def cyl(c, r1, r2, h, mi=MUD, segs=28):
    """Vertical cylinder standing on z = c[2]."""
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=h)
    for v in r["verts"]:
        v.co += Vector((c[0], c[1], c[2] + h / 2))
    return tag(r["verts"], mi)


def prism(outline, z0, z1, mi=MUD, shrink=1.0):
    """Extrude a closed outline [(x, y)] from z0 to z1; the top is scaled by `shrink` around its centroid (batter)."""
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((cx + (x - cx) * shrink, cy + (y - cy) * shrink, z1)) for x, y in outline]
    fs = [bm.faces.new(lo[::-1]), bm.faces.new(hi)]
    n = len(outline)
    for i in range(n):
        fs.append(bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i])))
    for f in fs:
        f.material_index = mi
    return lo + hi


def ring_wall(outer, inner, z0, z1, mi=MUD):
    """A wall between two outlines with the same number of points (a parapet around an open top)."""
    n = len(outer)
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]
    it_ = [bm.verts.new((x, y, z1)) for x, y in inner]
    for i in range(n):
        j = (i + 1) % n
        for q in ((ob[i], ob[j], ot[j], ot[i]), (it_[i], it_[j], ib[j], ib[i]), (ot[i], ot[j], it_[j], it_[i])):
            bm.faces.new(q).material_index = mi


def chaikin(pts, it=3):
    for _ in range(it):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        pts = out
    return pts


def merlon(x, y, z, yaw, w=0.42, h=0.55, d=0.38, mi=MUD):
    """An Omani merlon: a small block with a stepped, pointed cap."""
    vs = box((0, 0, h * 0.35), (d, w, h * 0.7), mi) + box((0, 0, h * 0.82), (d * 0.7, w * 0.6, h * 0.36), mi)
    rot = Matrix.Rotation(yaw, 3, "Z")
    for v in vs:
        v.co = rot @ v.co + Vector((x, y, z))


def crenel_line(a, b, z, step=0.78, inset=0.0, mi=MUD):
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    yaw = math.atan2(by - ay, bx - ax) + math.pi / 2
    n = max(1, int(L / step))
    for i in range(n + 1):
        t = i / n
        merlon(ax + (bx - ax) * t, ay + (by - ay) * t, z, yaw, mi=mi)


def crenel_rect(x0, y0, x1, y1, z, mi=MUD):
    for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        crenel_line(a, b, z, mi=mi)


def crenel_ring(cx, cy, r, z, step=0.8, mi=MUD):
    n = max(8, int(2 * math.pi * r / step))
    for i in range(n):
        a = i * 2 * math.pi / n
        merlon(cx + math.cos(a) * r, cy + math.sin(a) * r, z, a)


def parapet_rect(x0, y0, x1, y1, z, h=0.7, t=0.35, mi=MUD):
    box(((x0 + x1) / 2, y0 + t / 2, z + h / 2), (x1 - x0, t, h), mi)
    box(((x0 + x1) / 2, y1 - t / 2, z + h / 2), (x1 - x0, t, h), mi)
    box((x0 + t / 2, (y0 + y1) / 2, z + h / 2), (t, y1 - y0, h), mi)
    box((x1 - t / 2, (y0 + y1) / 2, z + h / 2), (t, y1 - y0, h), mi)
    crenel_rect(x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15, z + h, mi)


def windows_x(x, y0, y1, zs, w=0.55, h=0.8, step=1.6, mi=WIN):
    """Rows of small windows on a wall facing +X (x is the wall face)."""
    n = max(1, int((y1 - y0) / step))
    for z in zs:
        for i in range(n):
            y = y0 + (i + 0.5) * (y1 - y0) / n
            box((x + 0.02, y, z), (0.08, w, h), mi)


def windows_y(y, x0, x1, zs, side=1, w=0.55, h=0.8, step=1.6, mi=WIN):
    n = max(1, int((x1 - x0) / step))
    for z in zs:
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            box((x, y + side * 0.02, z), (w, 0.08, h), mi)


def slits(cx, cy, r, zs, n=7, mi=WIN, a0=0.0):
    for z in zs:
        for i in range(n):
            a = a0 + i * 2 * math.pi / n
            vs = box((0, 0, 0), (0.12, 0.32, 0.85), mi)
            rot = Matrix.Rotation(a, 3, "Z")
            for v in vs:
                v.co = rot @ v.co + Vector((cx + math.cos(a) * (r - 0.02), cy + math.sin(a) * (r - 0.02), z))


def round_tower(cx, cy, z0, r, h, band=True, slit_rows=None, taper=0.07):
    cyl((cx, cy, z0), r, r * (1 - taper), h, MUD)
    top = z0 + h
    rt = r * (1 - taper)
    cyl((cx, cy, top), rt + 0.12, rt + 0.12, 0.25, DARK)                   # cornice
    crenel_ring(cx, cy, rt + 0.02, top + 0.25)
    if band:
        cyl((cx, cy, z0 + h * 0.62), r * (1 - taper * 0.62) + 0.06, r * (1 - taper * 0.62) + 0.06, 0.22, DARK)
    slits(cx, cy, r * (1 - taper * 0.5), slit_rows or [z0 + h * 0.4, z0 + h * 0.78], a0=random.random())
    return top


def spouts_x(x, y0, y1, z, n=5):
    for i in range(n):
        y = y0 + (i + 0.5) * (y1 - y0) / n
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.08, radius2=0.08, depth=0.45)
        rot = Matrix.Rotation(math.radians(90), 3, "Y")
        for v in r["verts"]:
            v.co = rot @ v.co + Vector((x + 0.3, y, z))
        tag(r["verts"], WOOD)


def rock_mound(cx, cy, sx, sy, h, seg=22, rings=6):
    """A low-poly rocky outcrop (the fort's right side stands on rock)."""
    verts = []
    top = bm.verts.new((cx, cy, h))
    prev = None
    rings_v = []
    for k in range(1, rings + 1):
        t = k / rings
        ring = []
        for i in range(seg):
            a = i * 2 * math.pi / seg
            n = 0.82 + 0.3 * random.random()
            ring.append(bm.verts.new((cx + math.cos(a) * sx * t * n, cy + math.sin(a) * sy * t * n,
                                      max(0.0, h * (1 - t ** 1.6) + (random.random() - 0.5) * 0.5 * (1 - t)))))
        rings_v.append(ring)
    for i in range(seg):
        f = bm.faces.new((top, rings_v[0][i], rings_v[0][(i + 1) % seg]))
        f.material_index = ROCK
    for k in range(rings - 1):
        a, b = rings_v[k], rings_v[k + 1]
        for i in range(seg):
            f = bm.faces.new((a[i], b[i], b[(i + 1) % seg], a[(i + 1) % seg]))
            f.material_index = ROCK


# ================================================================ the fort
# rock outcrop under the right and back
rock_mound(-1.0, -11.5, 12.5, 8.5, 3.6)
rock_mound(-9.0, -6.0, 10.0, 9.0, 2.4)

# A. the long front block (two storeys, the main gate in the middle)
box((5.0, 0.0, 4.5), (6.0, 17.0, 9.0), MUD, taper=0.02)
box((8.05, 0.0, 0.35), (0.25, 17.4, 0.7), DARK)                            # plinth
windows_x(8.0, -7.6, 7.6, [3.4, 6.6], step=1.45)
parapet_rect(2.0, -8.5, 8.0, 8.5, 9.0)
box((8.1, 0.0, 1.6), (0.3, 2.4, 3.2), WOOD)                                # the main gate (dark wooden doors)
box((8.2, 0.0, 3.5), (0.4, 3.2, 0.5), DARK)                                # lintel
box((9.2, 0.0, 0.15), (2.0, 4.0, 0.3), DARK)                                # entrance platform
for i in range(3):                                                         # steps up to the gate
    box((10.4 + i * 0.45, 0.0, 0.1 - i * 0.03), (0.45, 3.2 - i * 0.3, 0.22 - i * 0.05), MUD)
windows_y(8.5, 2.5, 7.5, [3.4, 6.6], side=1, step=1.6)

# B. the tall round tower at the front-left corner
round_tower(4.6, 10.6, 0.0, 3.3, 13.0)
box((4.6, 8.7, 4.5), (3.0, 1.6, 9.0), MUD)                                  # joining wall to the front block

# C. stepped blocks behind the front block, rising to the roof rooms
box((-1.5, 0.5, 5.5), (7.0, 14.0, 11.0), MUD, taper=0.02)
windows_y(7.5, -4.5, 1.5, [8.4], side=1)
windows_x(2.05, -6.0, 7.0, [10.2], step=1.8)
parapet_rect(-5.0, -6.5, 2.0, 7.5, 11.0)
box((-1.0, 2.5, 12.3), (3.4, 4.0, 2.6), LIGHT)                              # roof room
parapet_rect(-2.7, 0.5, 0.7, 4.5, 13.6, h=0.5)
windows_x(0.72, 1.2, 3.8, [12.3], step=1.2)
box((0.8, -3.6, 12.0), (2.4, 3.0, 2.0), MUD)                                # stair head
box((5.0, 4.6, 9.9), (2.0, 3.0, 1.8), LIGHT)                                # small room on the front roof
windows_x(6.02, 3.6, 5.6, [9.9], step=1.0)

# D. the great curved bastion at the back with its round turret
D = chaikin([(-15.5, -7.0), (-5.5, -8.8), (-2.2, -4.5), (-3.2, 3.5), (-6.5, 7.8), (-12.8, 7.2), (-16.2, 0.5)], 2)
prism(D, 0.0, 15.0, MUD, shrink=0.93)
cx = sum(p[0] for p in D) / len(D)
cy = sum(p[1] for p in D) / len(D)
top = [(cx + (x - cx) * 0.93, cy + (y - cy) * 0.93) for x, y in D]
inner = [(cx + (x - cx) * 0.86, cy + (y - cy) * 0.86) for x, y in D]
prism(top, 15.0, 15.25, DARK)                                               # cornice line
for i in range(0, len(top), 2):                                             # merlons along the curved parapet
    a, b = top[i], top[(i + 2) % len(top)]
    crenel_line(a, (a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5), 16.3, step=0.8)
ring_wall(top, inner, 15.25, 16.3, MUD)                                      # the tall parapet around the open top
prism(inner, 15.25, 15.32, DARK)                                            # the sunken terrace inside
for k in range(5):                                                          # slit windows around the bastion
    p = D[(k * len(D)) // 5 + 3]
    for z in (6.5, 11.0):
        box((p[0] * 0.985 + cx * 0.015, p[1] * 0.985 + cy * 0.015, z), (0.35, 0.35, 0.9), WIN)
round_tower(-11.5, 6.8, 0.0, 2.6, 18.0, slit_rows=[9.0, 15.0], taper=0.06)  # the tallest turret, back-left

# E. two round towers on the rock to the right, joined by walls
t1 = round_tower(3.2, -11.2, 1.6, 3.4, 10.2)
t2 = round_tower(-3.4, -12.6, 2.0, 2.7, 10.0)
box((5.4, -9.2, 5.0), (4.0, 1.4, 8.0), MUD)                                 # front block -> tower E1
box((-0.1, -11.9, 6.2), (5.5, 1.4, 8.4), MUD)                               # E1 -> E2
box((-5.4, -10.2, 6.6), (2.2, 3.6, 9.0), MUD)                               # E2 -> bastion
crenel_line((-2.6, -11.3), (2.4, -10.6), 10.4)

# G. the low outer enclosure at the front-right: walls, gatehouse, inner rooms, stairs and a palm
for a, b, in (((8.2, -4.0), (14.2, -4.0)), ((14.2, -4.0), (14.2, -15.0)), ((14.2, -15.0), (6.5, -15.0))):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1.7)
    s = (L + 0.4, 0.5, 3.4) if abs(a[1] - b[1]) < 0.01 else (0.5, L + 0.4, 3.4)
    box(c, s, MUD)
    crenel_line(a, b, 3.4, step=0.85)
box((12.2, -8.0, 2.4), (3.2, 3.2, 4.8), MUD)                                # gatehouse
parapet_rect(10.6, -9.6, 13.8, -6.4, 4.8, h=0.45)
box((13.85, -8.0, 1.2), (0.3, 1.4, 2.4), WOOD)
box((10.0, -13.0, 1.6), (3.5, 3.0, 3.2), LIGHT)                              # inner rooms
windows_x(11.76, -14.0, -12.0, [1.8], step=1.0)
box((7.5, -6.0, 1.3), (2.0, 3.0, 2.6), MUD)
for i in range(6):                                                          # the stairs climbing to the outer gate
    box((15.0 + i * 0.5, -11.5, 1.35 - i * 0.24), (0.5, 2.0, 0.3 + (5 - i) * 0.02), MUD)
box((14.8, -11.5, 0.7), (0.6, 2.4, 1.4), DARK)

# the palm at the front-right corner is placed by the game (Fort_Palm), with the oasis palms

# ================================================================ finish: UVs, smoothing, objects per material
for v in bm.verts:                                                         # mirror: +Y becomes the viewer's left
    v.co.y = -v.co.y
bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
uv = bm.loops.layers.uv.new("UVMap")
for f in bm.faces:
    n = f.normal
    ax = max(range(3), key=lambda i: abs(n[i]))
    for l in f.loops:
        co = l.vert.co
        l[uv].uv = ((co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y))
        l[uv].uv = (l[uv].uv[0] / 2.0, l[uv].uv[1] / 2.0)
me = bpy.data.meshes.new("Fort_Rustaq")
bm.to_mesh(me)
bm.free()
fort = bpy.data.objects.new("Fort_Rustaq", me)
scene.collection.objects.link(fort)
for m in MATS:
    fort.data.materials.append(M[m])
for p in fort.data.polygons:
    p.use_smooth = False
for name, loc in (("Fort_Gate", (11.8, 0.0, 0.0)), ("Fort_Commander", (6.8, 3.0, 9.0)), ("Fort_Cyber", (-3.0, 0.0, 24.0)), ("Fort_Palm", (16.2, 16.0, 0.0)),
                  ("Fort_Flag", (-11.5, -6.8, 18.55)), ("Fort_Flag2", (4.6, -10.6, 13.55))):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.parent = fort
    scene.collection.objects.link(e)
tris = sum(len(p.vertices) - 2 for p in me.polygons)
print("fort triangles:", tris)

if PREVIEW:
    sc = scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_shadows = True
    sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 1300, 900
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.95, 0.95, 0.95)
    g = bpy.data.objects.new("ground", bpy.data.meshes.new("g"))
    gb = bmesh.new()
    bmesh.ops.create_grid(gb, x_segments=1, y_segments=1, size=26)
    gb.to_mesh(g.data)
    gb.free()
    g.data.materials.append(mat("Ground", "#c9955f"))
    scene.collection.objects.link(g)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    sc.camera = cam
    for tagn, loc, look, lens in (("front", (44, 30, 34), (0, -1, 3), 40), ("left", (30, 46, 30), (-1, 0, 4), 40), ("top", (2, 0.1, 70), (0, 0, 0), 35)):
        cam.location = loc
        cam.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        sc.render.filepath = os.path.join(HERE, "preview_fort_" + tagn + ".png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(g)

for o in list(scene.objects):
    if o.type == "CAMERA":
        bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print("fort written:", OUT, os.path.getsize(OUT))
