// The oasis of Rustaq: the fort at the north end, the wadi road the threats walk along (a winding path from the south),
// a falaj beside it, palms, a few village houses and the Hajar mountains behind the fort. Build pads sit between the bends
// of the road. World: Y up, metres; the camera looks north (-Z) from the south.
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Kit } from './kit';
import { OmanFlag } from './flag';

export const FORT_POS = new Vector3(0, 0, -46);
const ROAD = 3.8;                                      // road width
/** The wadi road from the south (spawn) to the fort gate; the last point is set from the fort's gate marker. */
const PATH_XZ: [number, number][] = [[15, 40], [15, 24], [-13, 24], [-13, 10], [13, 10], [13, -4], [-9, -4], [-9, -15], [0, -18]];
export const PADS_XZ: [number, number][] = [[6, 31], [-5, 17], [5, 17], [-20, 17], [-3, 3], [7, 3], [20, 3], [2, -11], [-16, -10], [6, -24], [-6, -24]];

export class Path {
	readonly pts: Vector3[];
	readonly cum: number[] = [0];
	readonly length: number;
	constructor(pts: Vector3[]) {
		this.pts = pts;
		for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Vector3.Distance(pts[i - 1], pts[i]));
		this.length = this.cum[this.cum.length - 1];
	}
	/** Point and direction at distance d along the road. */
	at(d: number): { p: Vector3; dir: Vector3 } {
		const t = Math.max(0, Math.min(this.length, d));
		let i = 1;
		while (i < this.pts.length - 1 && this.cum[i] < t) i++;
		const a = this.pts[i - 1], b = this.pts[i];
		const f = (t - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
		return { p: Vector3.Lerp(a, b, f), dir: b.subtract(a).normalize() };
	}
	/** Shortest distance from a point to the road centre line. */
	distance(p: Vector3): number {
		let best = 1e9;
		for (let i = 1; i < this.pts.length; i++) {
			const a = this.pts[i - 1], b = this.pts[i], ab = b.subtract(a), t = Math.max(0, Math.min(1, Vector3.Dot(p.subtract(a), ab) / ab.lengthSquared()));
			best = Math.min(best, Vector3.Distance(p, a.add(ab.scale(t))));
		}
		return best;
	}
}

export class OasisMap {
	path!: Path;
	pads: { pos: Vector3; node: TransformNode }[] = [];
	fort!: TransformNode;
	gate = new Vector3(); commander = new Vector3(); cyberSpot = new Vector3();
	private water!: DynamicTexture;
	private flags: OmanFlag[] = [];
	private t = 0;

	constructor(readonly scene: Scene, readonly kit: Kit) {}

	build() {
		this.placeFort();
		const pts = PATH_XZ.map(([x, z]) => new Vector3(x, 0, z));
		pts.push(new Vector3(this.gate.x, 0, this.gate.z + 1.5));
		this.path = new Path(pts);
		this.sky();
		this.ground();
		this.road();
		this.falaj();
		this.makePads();
		this.scenery();
		const s = this.scene;
		s.fogMode = Scene.FOGMODE_LINEAR; s.fogStart = 210; s.fogEnd = 480; s.fogColor = new Color3(0.86, 0.9, 0.93);
		s.clearColor = new Color4(0.86, 0.9, 0.93, 1);
	}

	private placeFort() {
		const f = this.kit.copy('Fort_Rustaq', this.kit.fort)!;
		f.position.copyFrom(FORT_POS);
		f.rotation.y = -Math.PI / 2;                       // the gate (+X in the model) faces the road and the camera
		f.computeWorldMatrix(true);
		for (const m of f.getChildMeshes()) { m.isPickable = false; m.freezeWorldMatrix(); }
		const at = (name: string) => { const e = this.kit.child(f, name); e?.computeWorldMatrix(true); return e ? e.getAbsolutePosition().clone() : FORT_POS.clone(); };
		this.gate = at('Fort_Gate'); this.commander = at('Fort_Commander'); this.cyberSpot = at('Fort_Cyber');
		const palm = at('Fort_Palm');
		this.kit.palmPrefab().place(palm, 0.6, 0.75, 'fortPalm');
		this.fort = f;
		// the flag of Oman on the tallest turret, a smaller one on the tall left tower (owner request)
		this.flags = [new OmanFlag(this.scene, at('Fort_Flag'), 6.5, 4.6), new OmanFlag(this.scene, at('Fort_Flag2'), 4.2, 2.8)];
		// mud-brick plaster: a soft texture over the flat colours of the model
		const plaster = this.tex('plaster', 256, c => {
			c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
			for (let i = 0; i < 2600; i++) { const g = 200 + Math.random() * 55; c.fillStyle = `rgba(${g},${g * 0.93},${g * 0.82},0.35)`; c.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 3); }
			c.strokeStyle = 'rgba(150,120,90,0.18)'; c.lineWidth = 2;
			for (let y = 0; y < 256; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y + 4); c.stroke(); }
		});
		for (const name of ['Mud', 'MudDark', 'MudLight']) {
			const m = this.kit.material(name) as any;
			if (m && 'albedoTexture' in m) { m.albedoTexture = plaster; m.roughness = 0.95; }
		}
	}

	private tex(name: string, size: number, draw: (c: CanvasRenderingContext2D) => void) {
		const t = new DynamicTexture(name, { width: size, height: size }, this.scene, true);
		draw(t.getContext() as CanvasRenderingContext2D);
		t.update(true);
		t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
		t.anisotropicFilteringLevel = 4;
		return t;
	}
	private flat(name: string, tex: DynamicTexture | null, color = new Color3(1, 1, 1), emissive = 0.3) {
		const m = new StandardMaterial(name, this.scene);
		if (tex) m.diffuseTexture = tex;
		m.diffuseColor = color; m.specularColor = new Color3(0.04, 0.04, 0.04); m.emissiveColor = color.scale(emissive);
		return m;
	}
	/** A ribbon along the road between two side offsets (metres, + = right of travel), v along the road. */
	private ribbon(name: string, pts: Vector3[], from: number, to: number, y: number, vScale: number) {
		const pos: number[] = [], uv: number[] = [], idx: number[] = [];
		let d = 0;
		for (let i = 0; i < pts.length; i++) {
			const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
			const dir = next.subtract(prev).normalize();
			const right = new Vector3(-dir.z, 0, dir.x);
			if (i > 0) d += Vector3.Distance(pts[i - 1], pts[i]);
			// mitre the corners so the road keeps its width through the bends
			let k = 1;
			if (i > 0 && i < pts.length - 1) {
				const a = pts[i].subtract(prev).normalize(), b = next.subtract(pts[i]).normalize();
				k = 1 / Math.max(0.5, Math.cos(Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(a, b)))) / 2));
			}
			for (const [j, o] of [[0, from], [1, to]] as const) {
				const p = pts[i].add(right.scale(o * k));
				pos.push(p.x, y, p.z); uv.push(j, d / vScale);
			}
			if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
		}
		const m = new Mesh(name, this.scene);
		const vd = new VertexData();
		vd.positions = pos; vd.indices = idx; vd.uvs = uv;
		const n: number[] = []; VertexData.ComputeNormals(pos, idx, n); vd.normals = n;
		vd.applyToMesh(m);
		m.isPickable = false; m.freezeWorldMatrix();
		return m;
	}

	private ground() {
		const sand = this.tex('sand', 256, c => {
			c.fillStyle = '#dcc39a'; c.fillRect(0, 0, 256, 256);
			for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(${140 + Math.random() * 60},${110 + Math.random() * 50},70,${Math.random() * 0.14})`; c.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
		});
		sand.uScale = sand.vScale = 60;
		const g = MeshBuilder.CreateGround('ground', { width: 420, height: 420 }, this.scene);
		g.position.z = -20;
		g.material = this.flat('groundMat', sand, new Color3(1, 1, 1), 0.28);
		g.isPickable = true;                                // taps on the ground find the nearest pad
		g.freezeWorldMatrix();
		// green oasis patches under the palms
		const grass = this.flat('grassMat', null, new Color3(0.27, 0.4, 0.17), 0);
		for (const [x, z, r] of [[-24, 30, 9], [26, 18, 8], [-27, -2, 9], [25, -16, 8], [-22, -30, 7], [20, 36, 6]]) {
			const d = MeshBuilder.CreateDisc('grass', { radius: r, tessellation: 20 }, this.scene);
			d.rotation.x = Math.PI / 2; d.position.set(x, 0.02, z); d.material = grass; d.isPickable = false;
		}
	}

	private road() {
		const t = this.tex('road', 256, c => {
			c.fillStyle = '#c9a77a'; c.fillRect(0, 0, 256, 256);
			for (let i = 0; i < 1400; i++) { const g = 150 + Math.random() * 70; c.fillStyle = `rgba(${g},${g * 0.85},${g * 0.65},0.4)`; c.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3); }
			c.fillStyle = 'rgba(120,90,60,0.35)'; c.fillRect(0, 0, 14, 256); c.fillRect(242, 0, 14, 256);
		});
		this.ribbon('road', this.path.pts, -ROAD / 2, ROAD / 2, 0.04, 8).material = this.flat('roadMat', t, new Color3(1, 1, 1), 0.3);
		// stones along both edges of the road
		const stone = this.flat('stoneMat', null, new Color3(0.68, 0.6, 0.5), 0.2);
		const parts: Mesh[] = [];
		let seed = 5;
		const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		for (let d = 1; d < this.path.length - 4; d += 2.3) {
			const { p, dir } = this.path.at(d);
			const right = new Vector3(-dir.z, 0, dir.x);
			for (const s of [-1, 1]) {
				const b = MeshBuilder.CreateSphere('st', { diameter: 0.5 + rnd() * 0.3, segments: 3 }, this.scene);
				b.position = p.add(right.scale(s * (ROAD / 2 + 0.2))); b.position.y = 0.05; b.scaling.y = 0.55;
				parts.push(b);
			}
		}
		const st = Mesh.MergeMeshes(parts, true)!;
		st.material = stone; st.isPickable = false; st.freezeWorldMatrix();
	}

	/** A falaj (stone water channel) beside the road for part of the way: the oasis lives on it. */
	private falaj() {
		this.water = this.tex('water', 128, c => {
			c.fillStyle = '#2f9fd0'; c.fillRect(0, 0, 128, 128);
			for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.2})`; c.lineWidth = 2; const x = Math.random() * 128, y = Math.random() * 128; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y + 3); c.stroke(); }
		});
		const pts = this.path.pts.slice(0, 5);
		const wm = this.flat('waterMat', this.water, new Color3(1, 1, 1), 0.55);
		const edge = this.flat('falajEdge', null, new Color3(0.78, 0.66, 0.5), 0.25);
		this.ribbon('falajEdge', pts, ROAD / 2 + 0.9, ROAD / 2 + 2.3, 0.07, 4).material = edge;
		this.ribbon('falajWater', pts, ROAD / 2 + 1.15, ROAD / 2 + 2.05, 0.1, 3).material = wm;
	}

	private makePads() {
		for (const [i, [x, z]] of PADS_XZ.entries()) {
			const n = this.kit.copy('Pad', this.kit.units, 'pad' + i)!;
			n.position.set(x, 0, z);
			n.scaling.setAll(1.6);
			for (const m of n.getChildMeshes(false).concat(n instanceof Mesh ? [n] : [])) { m.isPickable = true; m.metadata = { pad: i }; }
			this.pads.push({ pos: new Vector3(x, 0, z), node: n });
		}
	}

	private sky() {
		const t = new DynamicTexture('skyTex', { width: 16, height: 512 }, this.scene, true);
		const c = t.getContext() as CanvasRenderingContext2D;
		const g = c.createLinearGradient(0, 0, 0, 512);
		g.addColorStop(0, '#4a95da'); g.addColorStop(0.45, '#9cc9ee'); g.addColorStop(0.52, '#dfe9ef'); g.addColorStop(1, '#dfe9ef');
		c.fillStyle = g; c.fillRect(0, 0, 16, 512); t.update(true);
		const sky = MeshBuilder.CreateSphere('sky', { diameter: 900, segments: 12, sideOrientation: Mesh.BACKSIDE }, this.scene);
		const m = new StandardMaterial('skyMat', this.scene);
		m.emissiveTexture = t; m.disableLighting = true; m.fogEnabled = false; m.backFaceCulling = false;
		sky.material = m; sky.infiniteDistance = true; sky.isPickable = false;
		// the Hajar mountains behind the fort
		const mm = new StandardMaterial('mountMat', this.scene);
		mm.diffuseColor = new Color3(0.6, 0.47, 0.38); mm.specularColor = Color3.Black(); mm.emissiveColor = new Color3(0.2, 0.15, 0.12);
		const parts: Mesh[] = [];
		let seed = 9;
		const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		for (let i = 0; i < 22; i++) {
			const h = 40 + rnd() * 70, r = 45 + rnd() * 50;
			const c2 = MeshBuilder.CreateCylinder('mnt', { diameterTop: 0, diameterBottom: r * 2, height: h, tessellation: 6 + Math.floor(rnd() * 3) }, this.scene);
			c2.position.set(-260 + i * 25 + rnd() * 20, h / 2 - 2, -150 - rnd() * 90); c2.rotation.y = rnd() * 3;
			parts.push(c2);
		}
		const mount = Mesh.MergeMeshes(parts, true)!;
		mount.material = mm; mount.isPickable = false; mount.freezeWorldMatrix();
	}

	private scenery() {
		let seed = 21;
		const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		const palm = this.kit.palmPrefab(), house = this.kit.prefab('House_Block'), watch = this.kit.prefab('Watch_Tower');
		const free = (p: Vector3, r: number) => this.path.distance(p) > ROAD / 2 + r && !this.pads.some(q => Vector3.Distance(q.pos, p) < 2.4 + r)
			&& Vector3.Distance(p, FORT_POS) > 21;
		// palms: the oasis along the falaj and around the edges
		for (let d = 2; d < this.path.cum[4]; d += 5.5) {
			const { p, dir } = this.path.at(d);
			const q = p.add(new Vector3(-dir.z, 0, dir.x).scale(ROAD / 2 + 3.6 + rnd() * 1.5));
			if (free(q, 1.2)) palm.place(q, rnd() * 6.28, 0.5 + rnd() * 0.2);
		}
		for (let i = 0; i < 70; i++) {
			const p = new Vector3((rnd() < 0.5 ? -1 : 1) * (23 + rnd() * 20), 0, -40 + rnd() * 90);
			if (free(p, 1.5)) palm.place(p, rnd() * 6.28, 0.5 + rnd() * 0.3);
		}
		for (let i = 0; i < 16; i++) {
			const p = new Vector3((rnd() < 0.5 ? -1 : 1) * (30 + rnd() * 18), 0, -30 + rnd() * 70);
			if (free(p, 4)) house.place(p, Math.round(rnd() * 4) * Math.PI / 2, 0.9 + rnd() * 0.5);
		}
		for (const [x, z] of [[-30, -46], [30, -44], [-36, 26]]) watch.place(new Vector3(x, 0, z), rnd() * 6.28, 1.4);
	}

	update(dt: number) {
		this.t += dt;
		if (this.water) this.water.vOffset = -this.t * 0.25;
		for (const f of this.flags) f.update(dt);
	}
}
