// The flag of the Sultanate of Oman on the fort, waving: a grid of vertices moved every frame by a travelling wave that
// grows from the pole to the free edge. The cloth is drawn once on a canvas: the red hoist band with the national emblem
// (the khanjar over two crossed swords) and the white, red and green stripes.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

let cloth: DynamicTexture | null = null;

/** The cloth texture (1024 x 512, the official 2:1 proportion). */
function omanCloth(scene: Scene) {
	if (cloth) return cloth;
	const W = 1024, H = 512;
	const t = new DynamicTexture('omanFlag', { width: W, height: H }, scene, true);
	const c = t.getContext() as CanvasRenderingContext2D;
	const red = '#db161b', green = '#008000', band = W * 0.25;
	c.fillStyle = red; c.fillRect(0, 0, W, H);
	c.fillStyle = '#ffffff'; c.fillRect(band, 0, W - band, H / 3);
	c.fillStyle = red; c.fillRect(band, H / 3, W - band, H / 3);
	c.fillStyle = green; c.fillRect(band, (2 * H) / 3, W - band, H / 3);
	// the national emblem, white, in the upper hoist: two crossed swords, the khanjar over them, the belt
	const cx = band / 2, cy = H * 0.2, s = H / 512;
	c.save(); c.translate(cx, cy); c.scale(s, s);
	c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineCap = 'round';
	for (const k of [-1, 1]) {                                           // the crossed swords, curved blades
		c.save(); c.rotate(k * 0.78);
		c.lineWidth = 9;
		c.beginPath(); c.moveTo(0, -78); c.quadraticCurveTo(k * 14, 0, 0, 78); c.stroke();
		c.lineWidth = 7; c.beginPath(); c.moveTo(-16, -60); c.lineTo(16, -60); c.stroke();   // guard
		c.beginPath(); c.arc(0, -84, 7, 0, Math.PI * 2); c.fill();                          // pommel
		c.restore();
	}
	c.lineWidth = 10;                                                    // the belt across
	c.beginPath(); c.moveTo(-48, 8); c.quadraticCurveTo(0, 26, 48, 8); c.stroke();
	c.beginPath();                                                       // the khanjar: hilt
	c.moveTo(-9, -70); c.lineTo(9, -70); c.lineTo(6, -28); c.lineTo(-6, -28); c.closePath(); c.fill();
	c.beginPath(); c.arc(0, -76, 11, 0, Math.PI * 2); c.fill();
	c.beginPath(); c.moveTo(-16, -28); c.lineTo(16, -28); c.lineTo(12, -18); c.lineTo(-12, -18); c.closePath(); c.fill();
	c.beginPath();                                                       // the curved sheath, turning up at the tip
	c.moveTo(-10, -18); c.lineTo(10, -18); c.quadraticCurveTo(14, 36, 34, 62);
	c.quadraticCurveTo(20, 66, 12, 52); c.quadraticCurveTo(-6, 26, -10, -18); c.closePath(); c.fill();
	c.restore();
	t.update(true);
	cloth = t;
	return t;
}

export class OmanFlag {
	readonly root: TransformNode;
	private mesh: Mesh;
	private base: Float32Array;
	private pos: Float32Array;
	private t = Math.random() * 10;
	private readonly cols = 28; private readonly rows = 10;

	/** at: the top of the tower; height of the pole above it; width of the cloth (height is half). */
	constructor(scene: Scene, at: Vector3, poleH: number, readonly width: number, faceYaw = 0) {
		this.root = new TransformNode('omanFlagRoot', scene);
		this.root.position.copyFrom(at);
		this.root.rotation.y = faceYaw;
		const pm = new StandardMaterial('flagPole', scene);
		pm.diffuseColor = new Color3(0.92, 0.92, 0.9); pm.specularColor = new Color3(0.5, 0.5, 0.5); pm.emissiveColor = new Color3(0.2, 0.2, 0.2);
		const pole = MeshBuilder.CreateCylinder('pole', { diameterTop: 0.09, diameterBottom: 0.16, height: poleH, tessellation: 10 }, scene);
		pole.material = pm; pole.parent = this.root; pole.position.y = poleH / 2; pole.isPickable = false;
		const knob = MeshBuilder.CreateSphere('poleKnob', { diameter: 0.26, segments: 8 }, scene);
		const gold = new StandardMaterial('flagKnob', scene);
		gold.diffuseColor = new Color3(0.95, 0.75, 0.3); gold.emissiveColor = new Color3(0.35, 0.25, 0.05);
		knob.material = gold; knob.parent = this.root; knob.position.y = poleH + 0.1; knob.isPickable = false;
		// the cloth: a grid in the pole's plane, hoist at x = 0, hanging from the top of the pole
		const h = width / 2, pos: number[] = [], uv: number[] = [], idx: number[] = [];
		for (let j = 0; j <= this.rows; j++) for (let i = 0; i <= this.cols; i++) {
			const u = i / this.cols, v = j / this.rows;
			pos.push(0.06 + u * width, poleH - 0.15 - (1 - v) * h, 0);
			uv.push(u, v);
		}
		const W = this.cols + 1;
		for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
			const a = j * W + i;
			idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
		}
		this.mesh = new Mesh('omanFlag', scene);
		const vd = new VertexData();
		vd.positions = pos; vd.indices = idx; vd.uvs = uv;
		const n: number[] = []; VertexData.ComputeNormals(pos, idx, n); vd.normals = n;
		vd.applyToMesh(this.mesh, true);
		const m = new StandardMaterial('flagMat', scene);
		m.diffuseTexture = omanCloth(scene); m.emissiveColor = new Color3(0.38, 0.38, 0.38); m.specularColor = new Color3(0.12, 0.12, 0.12);
		m.backFaceCulling = false; m.twoSidedLighting = true;
		this.mesh.material = m; this.mesh.parent = this.root; this.mesh.isPickable = false;
		this.base = new Float32Array(pos);
		this.pos = new Float32Array(pos);
	}

	/** The wind: a wave travelling from the pole to the free edge, stronger towards the edge, with a little flutter. */
	update(dt: number) {
		this.t += dt;
		const b = this.base, p = this.pos, W = this.width, t = this.t;
		for (let k = 0; k < b.length; k += 3) {
			const x = b[k], y = b[k + 1], u = Math.min(1, x / W);
			const wave = Math.sin(x * 2.4 - t * 6.0) * 0.32 + Math.sin(x * 5.1 - t * 9.5 + y * 1.3) * 0.08;
			p[k] = x - u * u * 0.18 * W * 0.1;                                // the cloth draws in a little as it waves
			p[k + 1] = y - u * u * 0.18 + Math.sin(x * 3.1 - t * 7.2) * 0.04 * u;
			p[k + 2] = wave * u * (W / 4.2);
		}
		this.mesh.updateVerticesData(VertexBuffer.PositionKind, p);
		const n: number[] = [];
		VertexData.ComputeNormals(p, this.mesh.getIndices()!, n);
		this.mesh.updateVerticesData(VertexBuffer.NormalKind, n);
	}
}
