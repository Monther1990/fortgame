// Models: Rustaq Fort (assets/fort.glb, pipeline/build_fort.py), the towers, threats and pads (assets/units.glb,
// pipeline/build_units.py), the shared Omani kit for palms (assets/kit.glb) and village pieces from Cyber Rally
// (assets/race-kit.glb). Scenery is drawn with instances of one hidden source per piece; towers and threats are real copies
// because they animate.
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AssetContainer } from '@babylonjs/core/assetContainer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0';

export class Prefab {
	private parts: { mesh: Mesh; local: Matrix }[] = [];
	constructor(root: TransformNode, private freeze = true) {
		root.computeWorldMatrix(true);
		const inv = root.getWorldMatrix().clone().invert();
		for (const m of [root, ...root.getChildMeshes(false)] as AbstractMesh[]) {
			if (!(m instanceof Mesh) || !m.getTotalVertices()) continue;
			m.computeWorldMatrix(true);
			this.parts.push({ mesh: m, local: m.getWorldMatrix().multiply(inv) });
			m.isPickable = false;
		}
		root.position.y -= 1000;                  // the sources stay out of sight; their instances are what is drawn
	}
	place(p: Vector3, yaw: number, scale = 1, name = 'piece'): TransformNode {
		const n = new TransformNode(name, this.parts[0]?.mesh.getScene());
		n.position.copyFrom(p);
		n.rotation.y = yaw;
		n.scaling.setAll(scale);
		for (const { mesh, local } of this.parts) {
			const inst = mesh.createInstance(name + '_' + mesh.name);
			inst.parent = n;
			const s = new Vector3(), q = new Quaternion(), t = new Vector3();
			local.decompose(s, q, t);
			inst.position = t; inst.rotationQuaternion = q; inst.scaling = s;
			inst.isPickable = false;
		}
		if (this.freeze) { n.computeWorldMatrix(true); for (const c of n.getChildMeshes()) c.freezeWorldMatrix(); }
		return n;
	}
}

export class Kit {
	private constructor(readonly scene: Scene, readonly fort: AssetContainer, readonly units: AssetContainer,
		readonly omani: AssetContainer, readonly race: AssetContainer) {}

	static async load(scene: Scene, base: string, onProgress?: (p: number) => void) {
		const files = ['fort.glb', 'units.glb', 'kit.glb', 'race-kit.glb'];
		const done = new Array(files.length).fill(0);
		const [fort, units, omani, race] = await Promise.all(files.map((f, i) =>
			SceneLoader.LoadAssetContainerAsync(base + 'assets/', f, scene, e => {
				if (e.lengthComputable) { done[i] = e.loaded / e.total; onProgress?.(done.reduce((a, b) => a + b, 0) / files.length); }
			})));
		for (const c of [fort, units, omani, race]) {
			for (const m of c.materials) { scene.addMaterial(m); (m as any).maxSimultaneousLights = 2; }
			for (const t of c.textures) scene.addTexture(t);
		}
		// No environment map on phones (cheap lighting): metals would render black, so they become glossy paint; glowing
		// parts keep a little emissive light so they read in daylight.
		for (const m of scene.materials) {
			if (!(m instanceof PBRMaterial)) continue;
			if (m.metallic !== null && m.metallic > 0.5) { m.metallic = 0.15; m.roughness = 0.35; }
			if (m.name === 'Gold' || m.name === 'Brass') m.emissiveColor = new Color3(0.4, 0.27, 0.05);
		}
		return new Kit(scene, fort, units, omani, race);
	}

	/** A fresh copy of one node of a container and everything under it, at the origin, unparented. */
	copy(node: string, from: AssetContainer = this.units, newName = node): TransformNode | null {
		const inside = (e: any) => { for (let a = e; a; a = a.parent) if (a.name === node) return true; return false; };
		const inst = from.instantiateModelsToScene(n => n, false, { doNotInstantiate: true, predicate: (e: any) => e.name === '__root__' || inside(e) });
		let found: TransformNode | null = null;
		for (const r of inst.rootNodes) for (const n of [r, ...r.getDescendants(false)]) if (n.name === node && !found) found = n as TransformNode;
		if (found) { found.parent = null; found.position.setAll(0); }
		for (const r of inst.rootNodes) if (r !== found) r.dispose();
		if (!found) { console.warn('[kit] missing', node); return null; }
		found.name = newName;
		for (const n of [found, ...found.getDescendants(false)]) {
			const t = n as TransformNode;
			if (t.rotationQuaternion) { t.rotation = t.rotationQuaternion.toEulerAngles(); t.rotationQuaternion = null; }
		}
		return found;
	}
	child(root: TransformNode, name: string): TransformNode | null {
		return (root.getDescendants(false).find(n => n.name === name) as TransformNode) ?? null;
	}
	prefab(node: string, from: AssetContainer = this.race, freeze = true) { return new Prefab(this.copy(node, from)!, freeze); }
	palmPrefab() {
		const p = this.copy('Palm_0', this.omani)!;
		p.rotation.setAll(0);
		return new Prefab(p);
	}
	material(name: string): Material | null { return this.scene.materials.find(m => m.name === name) ?? null; }
}
