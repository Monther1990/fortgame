"""Blender 5.1 headless: Cyber Fort units (original designs). Front = +X, left = +Y, metres, origin at the base centre.
Defences (each habit is a tower; the child "Head" turns to aim):
  Tower_Guard   برج الحرس            basic mud-brick tower with a launcher
  Tower_Lantern فانوس «تحقق من المرسل» brass Omani lantern on a column: reveals disguised phishers
  Tower_Lock    برج «العبارة الطويلة»  stone tower with a padlock and a key launcher: breaks the guessing robots
  Tower_TwoKeys برج «التحقق الثنائي»   two crossed keys pointing at the sky: the only defence against flying callers
  Tower_Update  برج «التحديث»          a green gear and beacon: stops the worms
  Well_Backup   بئر «النسخة الاحتياطية» an Omani well with a pulley: saves the treasure from the ransom beast
Threats:
  Enemy_Phisher (children Disguise / Reveal), Enemy_Robot (Dial), Enemy_Bat (WingL / WingR), Enemy_Worm (Seg0..5),
  Enemy_Dragon (WingL / WingR, the boss)
Props: Pad (a build spot), Chest_Gift (the "free gold" trap, child Lid)
Run:  blender.exe -b --python pipeline/build_units.py [-- --preview]   ->  public/assets/units.glb
"""
import math
import os
import sys
import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "assets", "units.glb"))
PREVIEW = "--preview" in sys.argv
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexc, rough=0.6, emit=None, strength=1.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(hexc), 1)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = (*srgb(emit), 1)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*srgb(hexc), 1)
    return m


M = {k: mat(k, *v) if isinstance(v, tuple) else mat(k, v) for k, v in {
    "Mud": "#d8b88c", "MudDark": "#b8936a", "Stone": "#c7b9a3", "Wood": "#7a4c2a", "Brass": ("#d9a441", 0.35),
    "Gold": ("#f2c14e", 0.3, "#f2b632", 0.6), "Red": "#d72631", "Green": "#1f9d55", "Navy": "#1c2a44",
    "Glow": ("#fff1c1", 0.2, "#ffe9a0", 3.0), "Cyan": ("#38d6ff", 0.2, "#38d6ff", 2.5), "GreenGlow": ("#4cff9a", 0.2, "#4cff9a", 2.5),
    "Cloak": "#4a5470", "CloakDark": "#2e3448", "Skin": "#c99a72", "Cream": "#efe2c4", "Box": "#c08a4a", "Eye": ("#ff4040", 0.3, "#ff3030", 3.0),
    "Metal": "#8b98a8", "MetalDark": "#566173", "Bat": "#3b2f4f", "Worm": "#5bbf3a", "WormDark": "#3c8f24",
    "Dragon": "#6a2c91", "DragonDark": "#3f1a58", "Horn": "#efe2c4", "White": "#ffffff", "Black": "#16161c",
    "PadGlow": ("#7ce8ff", 0.3, "#5fdcff", 1.6), "Water": ("#3aa6d6", 0.1, "#2b8fc0", 0.4)}.items()}


class Part:
    """A bmesh being built into one object; faces carry material indices from the object's own material list."""
    def __init__(self, name, mats):
        self.name, self.mats, self.bm = name, mats, bmesh.new()

    def mi(self, m):
        return self.mats.index(m)

    def _tag(self, verts, m):
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = self.mi(m)
        return verts

    def box(self, c, s, m, rot=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in r["verts"]:
            p = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
            v.co = (rot @ p if rot else p) + Vector(c)
        return self._tag(r["verts"], m)

    def cyl(self, c, r1, r2, h, m, segs=20, axis="Z"):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=h)
        R = {"Z": Matrix.Identity(3), "X": Matrix.Rotation(math.radians(90), 3, "Y"), "Y": Matrix.Rotation(math.radians(90), 3, "X")}[axis]
        lift = Vector((0, 0, h / 2)) if axis == "Z" else Vector((0, 0, 0))   # vertical cylinders stand on c
        for v in r["verts"]:
            v.co = R @ v.co + Vector(c) + lift
        return self._tag(r["verts"], m)

    def sphere(self, c, r, m, scale=(1, 1, 1), segs=14):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
        for v in res["verts"]:
            v.co = Vector((c[0] + v.co.x * scale[0], c[1] + v.co.y * scale[1], c[2] + v.co.z * scale[2]))
        return self._tag(res["verts"], m)

    def merlons(self, cx, cy, r, z, m, n=10):
        for i in range(n):
            a = i * 2 * math.pi / n
            self.box((cx + math.cos(a) * r, cy + math.sin(a) * r, z + 0.14), (0.2, 0.2, 0.28), m, Matrix.Rotation(a, 3, "Z"))

    def done(self, parent=None, loc=(0, 0, 0), smooth=True):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        for m in self.mats:
            ob.data.materials.append(M[m])
        for p in me.polygons:
            p.use_smooth = smooth
        ob.location = loc
        if parent:
            ob.parent = parent
        return ob


def base_pad(p, r=1.15):
    p.cyl((0, 0, 0), r, r * 0.95, 0.35, "Stone", 24)
    p.cyl((0, 0, 0.35), r * 0.9, r * 0.9, 0.05, "MudDark", 24)


# ---------------------------------------------------------------- defences
def tower_guard():
    p = Part("Tower_Guard", ["Stone", "MudDark", "Mud", "Red", "Wood", "Navy"])
    base_pad(p)
    p.cyl((0, 0, 0.4), 0.85, 0.72, 2.2, "Mud", 20)
    p.cyl((0, 0, 2.6), 0.8, 0.8, 0.14, "MudDark", 20)
    p.merlons(0, 0, 0.74, 2.74, "Mud", 9)
    for z in (1.2, 1.9):
        p.box((0.72, 0, z), (0.08, 0.16, 0.42), "Navy")
    p.cyl((0, 0, 2.74), 0.03, 0.03, 1.2, "Wood", 6)
    p.box((0.05, 0.22, 3.55), (0.02, 0.4, 0.26), "Red")                    # banner
    ob = p.done()
    h = Part("Head", ["Wood", "Navy", "Red"])
    h.box((0.1, 0, 0), (0.9, 0.18, 0.18), "Wood")
    h.box((0.35, 0, 0.05), (0.08, 0.7, 0.06), "Navy")                       # bow arms
    h.cyl((0.62, 0, 0), 0.05, 0.0, 0.25, "Red", 8, "X")
    h.done(ob, (0, 0, 3.0))
    return ob


def tower_lantern():
    p = Part("Tower_Lantern", ["Stone", "MudDark", "Mud", "Brass"])
    base_pad(p)
    p.cyl((0, 0, 0.4), 0.4, 0.28, 2.0, "Mud", 16)
    p.cyl((0, 0, 2.4), 0.42, 0.42, 0.12, "MudDark", 16)
    p.cyl((0, 0, 2.52), 0.12, 0.12, 0.4, "Brass", 10)
    ob = p.done()
    h = Part("Head", ["Brass", "Glow", "Cyan"])
    h.cyl((0, 0, 0), 0.34, 0.28, 0.12, "Brass", 8)
    h.cyl((0, 0, 0.12), 0.28, 0.3, 0.62, "Glow", 8)                         # glowing glass
    for i in range(8):
        a = i * math.pi / 4
        h.box((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.43), (0.04, 0.04, 0.64), "Brass", Matrix.Rotation(a, 3, "Z"))
    h.cyl((0, 0, 0.74), 0.34, 0.06, 0.4, "Brass", 8)                        # dome
    h.sphere((0, 0, 1.2), 0.07, "Brass", segs=8)
    h.cyl((0.55, 0, 0.45), 0.32, 0.32, 0.04, "Cyan", 20, "X")
    h.cyl((0.42, 0, 0.08), 0.03, 0.03, 0.4, "Brass", 6, "X")
    h.done(ob, (0, 0, 2.92))
    return ob


def tower_lock():
    p = Part("Tower_Lock", ["Stone", "MudDark", "Gold", "Navy"])
    base_pad(p, 1.2)
    p.box((0, 0, 1.75), (1.35, 1.35, 2.7), "Stone")
    p.box((0, 0, 3.15), (1.5, 1.5, 0.12), "MudDark")
    for x in (-0.5, 0, 0.5):
        for y in (-0.62, 0.62):
            p.box((x, y, 3.32), (0.22, 0.18, 0.28), "Stone")
            p.box((y, x, 3.32), (0.18, 0.22, 0.28), "Stone")
    p.box((0.72, 0, 1.55), (0.12, 0.62, 0.55), "Gold")                       # the big padlock on the front
    p.cyl((0.72, 0, 1.95), 0.24, 0.24, 0.08, "Gold", 14, "X")
    p.box((0.79, 0, 1.5), (0.04, 0.08, 0.2), "Navy")                          # keyhole
    ob = p.done(smooth=False)
    h = Part("Head", ["Gold", "Navy"])
    h.cyl((0.1, 0, 0), 0.08, 0.08, 1.0, "Gold", 10, "X")                      # the key shaft as a launcher
    h.cyl((-0.42, 0, 0), 0.22, 0.22, 0.08, "Gold", 14, "Y")                   # key bow
    for d in (0.0, 0.16):
        h.box((0.48 - d, 0, -0.12), (0.06, 0.06, 0.18), "Gold")
    h.done(ob, (0, 0, 3.55))
    return ob


def tower_twokeys():
    p = Part("Tower_TwoKeys", ["Stone", "MudDark", "Mud", "Cyan"])
    base_pad(p)
    p.cyl((0, 0, 0.4), 0.8, 0.65, 2.0, "Mud", 16)
    p.cyl((0, 0, 2.4), 0.75, 0.75, 0.12, "MudDark", 16)
    p.merlons(0, 0, 0.68, 2.52, "Mud", 8)
    p.box((0.66, 0, 1.4), (0.06, 0.5, 0.5), "Cyan")                           # a glowing "2" panel
    ob = p.done()
    h = Part("Head", ["Gold", "Cyan", "Navy"])
    h.cyl((0, 0, 0), 0.22, 0.22, 0.2, "Navy", 12)
    for s in (1, -1):                                                         # two crossed keys pointing at the sky
        R = Matrix.Rotation(math.radians(55), 3, "Y") @ Matrix.Rotation(math.radians(18 * s), 3, "X")
        for v in h.cyl((0, 0, 0), 0.06, 0.06, 1.0, "Gold", 8):
            v.co = R @ v.co + Vector((0, 0.12 * s, 0.25))
        for v in h.cyl((0, 0, 1.05), 0.14, 0.14, 0.06, "Cyan", 12):
            v.co = R @ (v.co - Vector((0, 0, 0))) + Vector((0, 0.12 * s, 0.25))
    h.done(ob, (0, 0, 2.6))
    return ob


def tower_update():
    p = Part("Tower_Update", ["Stone", "MudDark", "Mud", "GreenGlow", "Navy"])
    base_pad(p)
    p.box((0, 0, 1.5), (1.2, 1.2, 2.2), "Mud")
    p.box((0, 0, 2.66), (1.32, 1.32, 0.12), "MudDark")
    p.box((0.61, 0, 1.5), (0.04, 0.5, 0.8), "Navy")
    p.box((0.63, 0, 1.5), (0.02, 0.3, 0.12), "GreenGlow")                     # progress bar
    p.cyl((0, 0, 2.72), 0.08, 0.08, 0.6, "Navy", 8)
    p.sphere((0, 0, 3.4), 0.12, "GreenGlow", segs=10)                         # beacon
    ob = p.done()
    g = Part("Head", ["Green", "Navy"])                                      # the gear (spins)
    g.cyl((0, 0, 0), 0.5, 0.5, 0.14, "Green", 24, "X")
    g.cyl((0, 0, 0), 0.18, 0.18, 0.18, "Navy", 12, "X")
    for i in range(10):
        a = i * 2 * math.pi / 10
        g.box((0, math.cos(a) * 0.58, math.sin(a) * 0.58), (0.14, 0.16, 0.16), "Green", Matrix.Rotation(a, 3, "X"))
    g.done(ob, (0.0, 0, 3.0))
    return ob


def well_backup():
    p = Part("Well_Backup", ["Stone", "MudDark", "Wood", "Water", "Brass", "Cyan"])
    p.cyl((0, 0, 0), 1.05, 1.05, 0.9, "Stone", 24)
    p.cyl((0, 0, 0.9), 1.1, 1.1, 0.1, "MudDark", 24)
    p.cyl((0, 0, 0.86), 0.82, 0.82, 0.06, "Water", 20)
    for y in (0.9, -0.9):
        p.box((0, y, 1.8), (0.14, 0.14, 1.8), "Wood")
    p.box((0, 0, 2.7), (0.14, 2.0, 0.14), "Wood")
    p.cyl((0, 0, 1.75), 0.04, 0.04, 0.9, "Brass", 6)                          # rope
    p.cyl((0, 0, 1.15), 0.18, 0.15, 0.3, "Wood", 10)                          # bucket
    p.cyl((0.0, -1.35, 0), 0.32, 0.32, 1.2, "Brass", 16)                      # the "backup" vault beside the well
    p.cyl((0.0, -1.35, 1.2), 0.34, 0.2, 0.2, "Brass", 16)
    p.box((0.3, -1.35, 0.7), (0.06, 0.24, 0.3), "Cyan")
    ob = p.done()
    w = Part("Head", ["Wood", "Brass"])                                      # the pulley wheel (turns when it saves)
    w.cyl((0, 0, 0), 0.28, 0.28, 0.08, "Wood", 16, "Y")
    w.cyl((0, 0, 0), 0.06, 0.06, 0.2, "Brass", 8, "Y")
    w.done(ob, (0, 0, 2.48))
    return ob


# ---------------------------------------------------------------- threats
def enemy_phisher():
    p = Part("Enemy_Phisher", ["Cloak", "CloakDark", "Skin", "Black"])
    p.cyl((0, 0, 0), 0.42, 0.18, 1.15, "Cloak", 14)                          # robe
    p.sphere((0, 0, 1.3), 0.22, "Skin")
    p.cyl((0, 0, 1.18), 0.3, 0.12, 0.55, "CloakDark", 14)                     # hood
    ob = p.done()
    d = Part("Disguise", ["Cream", "Box", "Green", "Black"])                  # friendly "delivery man" look
    d.cyl((0.02, 0, 1.48), 0.24, 0.24, 0.08, "Green", 14)                     # cap
    d.box((0.14, 0, 1.52), (0.22, 0.24, 0.04), "Green")                       # peak
    d.box((0.36, 0, 0.8), (0.36, 0.42, 0.32), "Box")                          # the parcel
    d.box((0.55, 0, 0.8), (0.01, 0.42, 0.06), "Cream")
    for y in (0.08, -0.08):
        d.sphere((0.2, y, 1.33), 0.03, "Black", segs=6)                       # friendly eyes
    d.done(ob)
    r = Part("Reveal", ["Eye", "Black", "Brass", "Red"])                      # the real face: mask, red eyes, hook
    r.box((0.19, 0, 1.33), (0.04, 0.34, 0.12), "Black")
    for y in (0.08, -0.08):
        r.sphere((0.22, y, 1.33), 0.035, "Eye", segs=6)
    r.cyl((0.25, -0.3, 1.1), 0.02, 0.02, 1.3, "Brass", 6)
    r.cyl((0.25, -0.3, 1.75), 0.008, 0.008, 0.6, "Black", 4)
    r.box((0.25, -0.3, 1.42), (0.03, 0.12, 0.04), "Red")                      # the hook's bait: a fake "prize"
    r.done(ob)
    return ob


def enemy_robot():
    p = Part("Enemy_Robot", ["Metal", "MetalDark", "Eye", "Cyan"])
    for y in (0.15, -0.15):
        p.cyl((0, y, 0), 0.09, 0.09, 0.45, "MetalDark", 10)
    p.box((0, 0, 0.8), (0.55, 0.62, 0.62), "Metal")
    p.box((0, 0, 1.3), (0.42, 0.42, 0.36), "Metal")
    for y in (0.1, -0.1):
        p.sphere((0.21, y, 1.33), 0.05, "Eye", segs=8)
    p.cyl((0, 0, 1.48), 0.015, 0.015, 0.3, "MetalDark", 6)
    p.sphere((0, 0, 1.8), 0.05, "Eye", segs=8)
    for y in (0.36, -0.36):
        p.box((0.1, y, 0.85), (0.14, 0.1, 0.5), "MetalDark")
    ob = p.done(smooth=False)
    d = Part("Dial", ["Cyan", "MetalDark"])                                  # the guessing dial on its chest (spins)
    d.cyl((0, 0, 0), 0.2, 0.2, 0.05, "Cyan", 16, "X")
    d.box((0.03, 0, 0.1), (0.02, 0.04, 0.12), "MetalDark")
    d.done(ob, (0.29, 0, 0.82))
    return ob


def enemy_bat():
    p = Part("Enemy_Bat", ["Bat", "Eye", "Black", "Cyan"])
    p.sphere((0, 0, 0), 0.32, "Bat", (1.1, 0.9, 1.0))
    for y in (0.12, -0.12):
        p.cyl((0.02, y, 0.28), 0.07, 0.0, 0.22, "Bat", 6)                      # ears
        p.sphere((0.28, y * 0.8, 0.06), 0.05, "Eye", segs=6)
    p.box((0.34, 0.18, -0.12), (0.06, 0.14, 0.24), "Black")                   # the phone it calls from
    p.box((0.37, 0.18, -0.12), (0.01, 0.11, 0.19), "Cyan")
    ob = p.done()
    for s, name in ((1, "WingL"), (-1, "WingR")):
        w = Part(name, ["Bat"])
        pts = [(0, 0), (0.25, 0.95), (0.05, 0.75), (-0.1, 0.95), (-0.2, 0.55), (-0.25, 0.1)]
        a = [w.bm.verts.new((x, s * y, 0.02)) for x, y in pts]
        b = [w.bm.verts.new((x, s * y, -0.02)) for x, y in pts]
        w.bm.faces.new(a if s > 0 else a[::-1])
        w.bm.faces.new(b[::-1] if s > 0 else b)
        w.done(ob, (0, s * 0.2, 0.05), smooth=False)
    return ob


def enemy_worm():
    root = Part("Enemy_Worm", ["WormDark"])
    root.sphere((0, 0, 0.05), 0.05, "WormDark", segs=6)
    ob = root.done()
    for i in range(6):
        r = 0.3 - i * 0.03
        s = Part(f"Seg{i}", ["Worm", "WormDark", "Eye", "Black"])
        s.sphere((0, 0, 0), r, "Worm" if i % 2 == 0 else "WormDark")
        if i == 0:
            for y in (0.1, -0.1):
                s.sphere((r * 0.85, y, 0.1), 0.06, "Eye", segs=6)
            for k in range(5):                                            # virus spikes on the head
                a = k * math.pi / 4
                for v in s.cyl((0, 0, 0), 0.05, 0.0, 0.2, "Black", 5):
                    v.co = Matrix.Rotation(a - math.pi / 2, 3, "X") @ v.co
        s.done(ob, (-i * 0.42, 0, r))
    return ob


def enemy_dragon():
    p = Part("Enemy_Dragon", ["Dragon", "DragonDark", "Horn", "Gold", "Eye", "Navy"])
    p.sphere((0, 0, 1.5), 1.0, "Dragon", (1.4, 0.9, 0.85))                    # body
    p.sphere((1.3, 0, 2.3), 0.55, "Dragon", (1.1, 0.85, 0.85))               # head
    p.sphere((1.75, 0, 2.15), 0.3, "DragonDark", (1.2, 0.8, 0.6))           # snout
    for y in (0.22, -0.22):
        p.sphere((1.72, y, 2.45), 0.08, "Eye", segs=8)
        p.cyl((1.15, y, 2.7), 0.1, 0.0, 0.55, "Horn", 8)
    for x, y in ((0.6, 0.5), (0.6, -0.5), (-0.6, 0.5), (-0.6, -0.5)):         # legs
        p.cyl((x, y, 0), 0.22, 0.26, 0.9, "DragonDark", 10)
    p.cyl((-1.3, 0, 1.3), 0.35, 0.05, 1.8, "DragonDark", 10, "X")            # tail
    p.box((1.25, 0, 1.4), (0.2, 0.7, 0.6), "Gold")                           # the padlock on its chest: it locks files
    p.cyl((1.25, 0, 1.85), 0.28, 0.28, 0.1, "Gold", 14, "X")
    p.box((1.36, 0, 1.35), (0.04, 0.1, 0.24), "Navy")
    for i in range(5):                                                        # back spikes
        p.cyl((0.6 - i * 0.4, 0, 2.2 - abs(i - 1) * 0.1), 0.15, 0.0, 0.4, "Horn", 6)
    ob = p.done()
    for s, name in ((1, "WingL"), (-1, "WingR")):
        w = Part(name, ["DragonDark", "Dragon"])
        pts = [(0.4, 0), (0.6, 1.6), (0.2, 2.4), (-0.3, 1.9), (-0.6, 2.2), (-0.8, 1.2), (-0.5, 0)]
        a = [w.bm.verts.new((x, s * y, 0.04)) for x, y in pts]
        b = [w.bm.verts.new((x, s * y, -0.04)) for x, y in pts]
        w.bm.faces.new(a if s > 0 else a[::-1])
        w.bm.faces.new(b[::-1] if s > 0 else b)
        w.done(ob, (0, s * 0.6, 2.1), smooth=False)
    return ob


# ---------------------------------------------------------------- props
def pad():
    p = Part("Pad", ["Stone", "PadGlow", "MudDark"])
    p.cyl((0, 0, 0), 1.2, 1.15, 0.25, "Stone", 24)
    for i in range(12):                                                       # dashed glowing ring: "build here"
        a = i * 2 * math.pi / 12
        p.box((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.27), (0.08, 0.28, 0.03), "PadGlow", Matrix.Rotation(a, 3, "Z"))
    p.cyl((0, 0, 0.25), 0.25, 0.25, 0.03, "PadGlow", 4)                        # a small plus sign
    return p.done()


def chest_gift():
    p = Part("Chest_Gift", ["Red", "Gold", "Wood"])
    p.box((0, 0, 0.3), (0.8, 0.55, 0.5), "Red")
    for x in (-0.3, 0.3):
        p.box((x, 0, 0.3), (0.08, 0.57, 0.52), "Gold")
    p.box((0.41, 0, 0.42), (0.04, 0.14, 0.16), "Gold")
    ob = p.done(smooth=False)
    l = Part("Lid", ["Red", "Gold"])
    l.cyl((0, 0, 0), 0.28, 0.28, 0.8, "Red", 12, "X")
    for x in (-0.3, 0.3):
        l.cyl((x, 0, 0), 0.3, 0.3, 0.08, "Gold", 12, "X")
    l.done(ob, (0, 0, 0.55), smooth=False)
    return ob


units = [tower_guard(), tower_lantern(), tower_lock(), tower_twokeys(), tower_update(), well_backup(),
         enemy_phisher(), enemy_robot(), enemy_bat(), enemy_worm(), enemy_dragon(), pad(), chest_gift()]

if PREVIEW:
    sc = scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_shadows = True
    sc.render.resolution_x, sc.render.resolution_y = 1400, 800
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.92, 0.92, 0.95)
    for i, u in enumerate(units):
        u.location = ((i % 7) * 3.2 - 9.6, (i // 7) * -4.5 + 2.2, 0)
    bat = bpy.data.objects["Enemy_Bat"]
    bat.location.z = 1.4
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (2, -22, 12)
    cam.rotation_euler = (Vector((0, -1, 1.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 34
    sc.render.filepath = os.path.join(HERE, "preview_units.png")
    bpy.ops.render.render(write_still=True)
    for u in units:
        u.location = (0, 0, 0)
    bpy.data.objects.remove(cam)

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print("units written:", OUT, os.path.getsize(OUT))
