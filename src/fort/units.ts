// Towers, threats and shots. Each habit-tower is strong against its own threat (balance.json "bonus"); threats with
// "armor" take little damage from the wrong towers, disguised phishers can only be hit once a lantern has revealed them,
// and flying callers can only be reached by the two-keys tower. Visual animation lives here too (heads aim, wings flap,
// gears turn, worms wiggle).
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import balance from '../data/balance.json';
import type { Kit } from './kit';
import type { Path } from './map';

export type TowerType = keyof typeof balance.towers;
export type EnemyType = keyof typeof balance.enemies;
export interface TowerDef { node: string; cost: number; dmg?: number; rate?: number; range?: number; color?: string; icon: string;
	reveal?: boolean; air?: boolean; bonus?: Record<string, number>; slow?: number; passive?: boolean }
export interface EnemyDef { node: string; icon: string; hp: number; speed: number; reward: number; damage: number; disguised?: boolean;
	armor?: number; flying?: boolean; boss?: boolean; scale: number }
export const TOWERS = balance.towers as Record<TowerType, TowerDef>;
export const ENEMIES = balance.enemies as Record<EnemyType, EnemyDef>;

/** Units are drawn larger than life so a child can follow the battle on a phone (the fort stays to scale). */
export const TOWER_SCALE = 1.6;
const yawTo = (from: Vector3, to: Vector3) => Math.atan2(-(to.z - from.z), to.x - from.x);

export class Enemy {
	readonly node: TransformNode;
	d = 0; hp: number; readonly maxHp: number; revealed: boolean; slowT = 0; alive = true; reached = false; private t = Math.random() * 10;
	private parts: Record<string, TransformNode | null> = {};
	private bar: Mesh; private barFg: Mesh;
	constructor(kit: Kit, readonly type: EnemyType, private path: Path, bars: { bg: StandardMaterial; fg: StandardMaterial }, hpScale = 1) {
		const def = ENEMIES[type];
		this.node = kit.copy(def.node, kit.units, 'enemy_' + type)!;
		this.node.scaling.setAll(def.scale);
		for (const n of ['Disguise', 'Reveal', 'Dial', 'WingL', 'WingR', 'Seg0', 'Seg1', 'Seg2', 'Seg3', 'Seg4', 'Seg5']) this.parts[n] = kit.child(this.node, n);
		this.hp = this.maxHp = Math.round(def.hp * hpScale);
		this.revealed = !def.disguised;
		this.parts.Reveal?.setEnabled(false);
		for (const m of this.node.getChildMeshes()) m.isPickable = false;
		const s = this.node.getScene();
		const w = def.boss ? 3.4 : 1.5;
		this.bar = MeshBuilder.CreatePlane('hpBg', { width: w, height: 0.14 }, s);
		this.bar.material = bars.bg; this.bar.billboardMode = Mesh.BILLBOARDMODE_ALL; this.bar.isPickable = false;
		this.barFg = MeshBuilder.CreatePlane('hpFg', { width: w, height: 0.14 }, s);
		this.barFg.material = bars.fg; this.barFg.parent = this.bar; this.barFg.position.z = -0.01; this.barFg.isPickable = false;
		this.bar.setEnabled(false);
	}
	get def() { return ENEMIES[this.type]; }
	get pos() { return this.node.position; }
	/** Height of the aim point (shots fly to it). */
	get aim() { return this.node.position.add(new Vector3(0, (this.def.flying ? 0 : this.def.boss ? 1.5 : 0.7) * this.def.scale, 0)); }
	reveal() {
		if (this.revealed) return false;
		this.revealed = true;
		this.parts.Disguise?.setEnabled(false);
		this.parts.Reveal?.setEnabled(true);
		return true;
	}
	hit(dmg: number) {
		if (!this.alive) return false;
		this.hp -= dmg;
		this.bar.setEnabled(true);
		if (this.hp <= 0) { this.alive = false; return true; }
		return false;
	}
	update(dt: number) {
		this.t += dt;
		const def = this.def;
		this.slowT = Math.max(0, this.slowT - dt);
		this.d += def.speed * (this.slowT > 0 ? 0.5 : 1) * dt;
		const { p, dir } = this.path.at(this.d);
		const fly = def.flying ? 3.2 + Math.sin(this.t * 3) * 0.35 : 0;
		const bob = !def.flying && !def.boss ? Math.abs(Math.sin(this.t * 7)) * 0.08 : 0;
		this.node.position.set(p.x, fly + bob, p.z);
		this.node.rotation.y = Math.atan2(-dir.z, dir.x);
		if (this.parts.Dial) this.parts.Dial.rotation.x += dt * 9;
		for (const [n, s] of [['WingL', 1], ['WingR', -1]] as const) {
			const w = this.parts[n];
			if (w) w.rotation.x = s * Math.sin(this.t * (def.boss ? 3.5 : 14)) * (def.boss ? 0.45 : 0.7);
		}
		for (let i = 0; i < 6; i++) {
			const seg = this.parts['Seg' + i];
			if (seg) seg.position.z = Math.sin(this.t * 9 - i * 0.9) * 0.18;
		}
		if (this.bar.isEnabled()) {
			const r = Math.max(0, this.hp / this.maxHp);
			this.bar.position = this.node.position.add(new Vector3(0, (def.boss ? 3.2 : def.flying ? 0.7 : 1.7) * def.scale, 0));
			this.barFg.scaling.x = r; this.barFg.position.x = -(1 - r) * (def.boss ? 1.7 : 0.75);
		}
		if (this.d >= this.path.length) this.reached = true;
	}
	dispose() { this.node.dispose(); this.bar.dispose(); }
}

export class Tower {
	readonly node: TransformNode;
	private head: TransformNode | null;
	level = 1; private cool = 0; private t = 0; saving = 0;
	constructor(kit: Kit, readonly type: TowerType, readonly pad: number, readonly pos: Vector3) {
		this.node = kit.copy(TOWERS[type].node, kit.units, 'tower_' + type)!;
		this.node.position.copyFrom(pos);
		this.node.rotation.y = -Math.PI / 2;                                    // fronts (+X) face the camera (south, +Z)
		this.head = kit.child(this.node, 'Head');
		for (const m of this.node.getChildMeshes()) { m.isPickable = true; m.metadata = { pad }; }
		this.node.scaling.setAll(0.01);                                          // grows in
	}
	get def() { return TOWERS[this.type]; }
	get range() { return (this.def.range ?? 0) + (this.level - 1) * 1.5; }
	get damage() { return (this.def.dmg ?? 0) * (this.level > 1 ? 1.7 : 1); }
	get rate() { return (this.def.rate ?? 1) * (this.level > 1 ? 1.15 : 1); }
	canTarget(e: Enemy) {
		const d = this.def;
		if (!e.alive || d.passive) return false;
		if (e.def.flying) return !!d.air;
		if (d.air) return !!e.def.boss;                                         // the sky tower only reaches the boss on the ground
		return e.revealed || !!d.reveal;
	}
	/** Damage against one threat: the right habit beats its threat; armour blunts the wrong towers. */
	damageTo(e: Enemy) {
		const bonus = this.def.bonus?.[e.type];
		return this.damage * (bonus ?? e.def.armor ?? 1);
	}
	update(dt: number, enemies: Enemy[], fire: (t: Tower, e: Enemy) => void, onReveal: (e: Enemy) => void) {
		this.t += dt;
		if (this.type === 'update' && this.head) this.head.rotation.x += dt * 2.5;
		if (this.type === 'well' && this.head) this.head.rotation.y += dt * (this.saving > 0 ? 14 : 0.4);
		this.saving = Math.max(0, this.saving - dt);
		if (this.def.passive) return;
		if (this.def.reveal) for (const e of enemies) if (e.alive && !e.revealed && Vector3.Distance(e.pos, this.pos) <= this.range && e.reveal()) onReveal(e);
		this.cool -= dt;
		let target: Enemy | null = null;
		for (const e of enemies) {                                               // the threat furthest along the road
			if (!this.canTarget(e) || Vector3.Distance(e.pos, this.pos) > this.range) continue;
			if (!target || e.d > target.d) target = e;
		}
		if (target && this.head) {
			const want = yawTo(this.pos, target.pos) - this.node.rotation.y;
			const cur = this.head.rotation.y;
			this.head.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 10);
		} else if (this.head && this.type === 'lantern') this.head.rotation.y += dt * 0.6;
		if (target && this.cool <= 0) { this.cool = 1 / this.rate; fire(this, target); }
	}
	/** Grows in when built (runs in real time, also between waves). */
	grow(dt: number) {
		const target = TOWER_SCALE * (this.level > 1 ? 1.15 : 1), s = this.node.scaling.x;
		if (s < target) this.node.scaling.setAll(Math.min(target, s + dt * 5));
	}
	upgrade() { this.level = 2; }
	dispose() { this.node.dispose(); }
}

/** Glowing shots, pooled. */
export class Shots {
	private pool: Mesh[] = [];
	private live: { m: Mesh; target: Enemy; to: Vector3; dmg: number; slow: number; from: Tower }[] = [];
	private mats = new Map<string, StandardMaterial>();
	constructor(private scene: Scene) {}
	fire(from: Tower, target: Enemy, onHit: (e: Enemy, dmg: number, slow: number, t: Tower) => void) {
		const m = this.pool.pop() ?? MeshBuilder.CreateSphere('shot', { diameter: 0.6, segments: 6 }, this.scene);
		const color = from.def.color ?? '#ffffff';
		let mat = this.mats.get(color);
		if (!mat) { mat = new StandardMaterial('shot' + color, this.scene); mat.emissiveColor = Color3.FromHexString(color); mat.disableLighting = true; this.mats.set(color, mat); }
		m.material = mat; m.isPickable = false; m.setEnabled(true);
		m.position = from.pos.add(new Vector3(0, (from.type === 'lock' ? 3.6 : 3.1) * TOWER_SCALE, 0));
		this.live.push({ m, target, to: target.aim, dmg: from.damageTo(target), slow: from.def.slow ?? 0, from });
		this.onHit = onHit;
	}
	private onHit: (e: Enemy, dmg: number, slow: number, t: Tower) => void = () => {};
	update(dt: number) {
		for (const s of [...this.live]) {
			if (s.target.alive) s.to = s.target.aim;
			const d = s.to.subtract(s.m.position);
			const step = 24 * dt;
			if (d.length() <= step) {
				s.m.setEnabled(false); this.pool.push(s.m); this.live.splice(this.live.indexOf(s), 1);
				if (s.target.alive) this.onHit(s.target, s.dmg, s.slow, s.from);
			} else s.m.position.addInPlace(d.normalize().scale(step));
		}
	}
	clear() { for (const s of this.live) { s.m.setEnabled(false); this.pool.push(s.m); } this.live = []; }
}
