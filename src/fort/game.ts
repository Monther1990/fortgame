// Cyber Fort: defend Rustaq Fort. Threats walk the wadi road to the gate; the child builds habit-towers on the glowing pads.
// Each wave starts with Cyber's council: a safe answer unlocks the tower that stops the coming threat (knowledge is the
// key to the defence). A "free gold" chest trap falls during wave 3. Knowledge points come only from decisions (the shared
// assessment rules, re-scored by the platform); waves, fort shield and stars are for fun.
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Engine } from '@babylonjs/core/Engines/engine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Loading/loadingScreen';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Materials/PBR/pbrMaterial';
import '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import '@babylonjs/core/Meshes/Builders/planeBuilder';
import '@babylonjs/core/Meshes/Builders/discBuilder';
import '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Meshes/Builders/groundBuilder';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Culling/ray';
import '@babylonjs/loaders/glTF/2.0';
import { activeCheckpoint, applyAction, createRun, getResult, isResolved, normalizeName, Run, RunResult, shuffleForRun, uuid } from '../game/assessment';
import { Audio } from '../game/audio';
import { Avatar, CharacterKit, Cyber } from '../game/avatar';
import { CheckpointDef, checkpoints, config, content, ui } from '../game/data';
import type { Feedback, PanelModel } from '../game/director';
import { Ui } from '../ui/ui';
import { FortUi } from '../ui/fortUi';
import { Kit } from './kit';
import { FORT_POS, OasisMap } from './map';
import { Enemy, ENEMIES, EnemyType, Shots, Tower, TOWERS, TowerType } from './units';
import balance from '../data/balance.json';

export interface FortOptions {
	base: string;
	/** Finished game: knowledge result + ledger (re-score on the server) and fun numbers (never part of the score). */
	onComplete?: (payload: { result: RunResult; ledger: Run['ledger']; fun: { stars: number; fortHealth: number; fell: boolean; treasureSaved: boolean; seconds: number } }) => void;
	onEvent?: (type: string, data: unknown) => void;
}
type Mode = 'loading' | 'entry' | 'intro' | 'council' | 'build' | 'rest' | 'wave' | 'trap' | 'results';
interface WaveDef { council: string; unlock: string; trap?: string; groups: { type: string; count: number; gap: number; delay?: number }[] }
const WAVES = balance.waves as WaveDef[];
const D = Math.PI / 180;
const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

export class FortGame {
	readonly canvas: HTMLCanvasElement;
	readonly engine: Engine;
	readonly scene: Scene;
	private cam: FreeCamera;
	private ui: Ui;
	private hud: FortUi;
	private audio: Audio;
	private kit!: Kit;
	private chars!: CharacterKit;
	private map!: OasisMap;
	private shots!: Shots;
	private mode: Mode = 'loading';
	private run: Run | null = null;
	private player = { name: '', avatar: 'male' as 'male' | 'female' };
	// game state
	private coins = 0; private health = 0; private wave = 0; private speed = 1;
	private unlocked = new Set<string>(['guard']);
	private towers: (Tower | null)[] = [];
	private enemies: Enemy[] = [];
	private queue: { type: EnemyType; at: number }[] = []; private waveT = 0;
	private seen = new Set<string>(); private hinted = new Set<string>();
	private fell = false; private treasureSaved = false; private dragonCame = false;
	private trapDone = false; private chest: TransformNode | null = null; private chestD = 0; private chestFall = 0;
	private attempts = new Map<string, number>();
	private playTime = 0; private firstBuildHint = true;
	// characters and effects
	private commander: Avatar | null = null;
	private guardian!: Cyber;
	private dome!: Mesh; private domeMat!: StandardMaterial; private domeHit = 0;
	private arrow!: Mesh;
	private bars!: { bg: StandardMaterial; fg: StandardMaterial };
	private sparks!: ParticleSystem; private smoke!: ParticleSystem; private confetti!: ParticleSystem;
	private intro = { i: -1, t: 0, shots: [] as { cam: Vector3; look: Vector3; text: string }[], from: new Vector3(), fromLook: new Vector3(), look: new Vector3() };
	private t = 0; private shotSound = 0;
	// zoom 1 = the whole battlefield; smaller = closer (pinch, wheel or the 🔍 button); pan = where the close view looks
	private zoom = 1; private pan = new Vector3();
	private ring!: Mesh;
	private announced = new Set<string>();
	setZoom(z: number) { this.zoom = Math.max(0.42, Math.min(1, z)); if (this.zoom > 0.98) this.pan.setAll(0); }
	private panBy(dx: number, dy: number) {
		const k = 0.16 * this.zoom * (96 / Math.max(300, this.canvas.clientHeight)) * 2.4;
		this.pan.x = Math.max(-16, Math.min(16, this.pan.x - dx * k));
		this.pan.z = Math.max(-38, Math.min(38, this.pan.z - dy * k));
	}
	/** The 🔍 button: zoom in on the battle (the threat closest to the gate, or the road's middle), or back out. */
	toggleZoom() {
		if (this.zoom < 0.98) { this.setZoom(1); return; }
		const lead = this.enemies.reduce<Enemy | null>((a, e) => (!a || e.d > a.d ? e : a), null);
		const at = lead ? lead.pos : this.map.path.at(this.map.path.length * 0.5).p;
		this.zoom = 0.5;
		this.pan.set(Math.max(-16, Math.min(16, at.x)), 0, Math.max(-38, Math.min(38, at.z + 5)));
	}
	/** Game-clock timers (pause with the game, work with fixed-step tests). */
	private timers: { at: number; fn: () => void }[] = [];
	private later(sec: number, fn: () => void) { this.timers.push({ at: this.t + sec, fn }); }

	constructor(readonly host: HTMLElement, readonly opts: FortOptions) {
		host.classList.add('ath-host');
		this.canvas = document.createElement('canvas');
		this.canvas.setAttribute('aria-label', ui('app.title'));
		host.appendChild(this.canvas);
		this.engine = new Engine(this.canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, false);
		this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
		this.scene = new Scene(this.engine);
		this.scene.useRightHandedSystem = true;
		this.scene.skipPointerMovePicking = true;
		this.scene.clearColor = new Color4(0.86, 0.9, 0.93, 1);
		this.cam = new FreeCamera('cam', new Vector3(0, 60, 50), this.scene);
		this.cam.minZ = 0.5; this.cam.maxZ = 1200;
		this.ui = new Ui(host, opts.base);
		this.hud = new FortUi(host, opts.base);
		this.audio = new Audio(opts.base);
		this.ui.click = this.hud.click = () => void this.audio.play('SFX_UI_Click', 0.5);
		this.hud.onSound = m => this.audio.setMuted(m);
		this.hud.onSpeed = () => { this.speed = this.speed === 1 ? 2 : 1; };
		this.hud.onZoom = () => this.toggleZoom();
		this.bindInput();
		addEventListener('resize', () => this.engine.resize());
		this.engine.runRenderLoop(() => this.scene.render());
		this.scene.onBeforeRenderObservable.add(() => this.tick(Math.min(this.engine.getDeltaTime() / 1000, 0.05)));
	}

	async start() {
		this.ui.loading(0.03);
		await Promise.all([document.fonts.load('700 64px "Readex Pro"'), document.fonts.load('400 40px "Readex Pro"')]).catch(() => {});
		const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, -0.35), this.scene);
		sun.intensity = 1.05; sun.diffuse = new Color3(1, 0.92, 0.78);
		const sky = new HemisphericLight('sky', new Vector3(0.1, 1, 0.3), this.scene);
		sky.intensity = 0.95; sky.diffuse = new Color3(0.95, 0.97, 1); sky.groundColor = new Color3(0.6, 0.5, 0.4);
		this.kit = await Kit.load(this.scene, this.opts.base, p => this.ui.loading(0.05 + p * 0.6));
		this.chars = await CharacterKit.load(this.scene, this.opts.base);
		this.ui.loading(0.8);
		this.map = new OasisMap(this.scene, this.kit);
		this.map.build();
		this.shots = new Shots(this.scene);
		this.makeEffects();
		this.guardian = new Cyber(this.chars, 'guardian', 4.2);
		this.guardian.root.position.copyFrom(this.map.cyberSpot);
		this.guardian.root.rotation.y = -Math.PI / 2;
		this.towers = this.map.pads.map(() => null);
		this.ui.loading(1);
		this.placeCamera(0, true);
		this.showEntry();
	}

	// ---------------------------------------------------------------- flow
	private showEntry() {
		this.mode = 'entry';
		this.hud.showHud(false);
		this.ui.entry((name, avatar) => {
			this.audio.unlock();
			this.player = { name, avatar };
			this.ui.closeModal();
			this.newGame();
			this.startIntro();
		}, normalizeName);
	}
	private newGame() {
		for (const t of this.towers) t?.dispose();
		for (const e of this.enemies) e.dispose();
		this.towers = this.map.pads.map(() => null);
		for (const p of this.map.pads) p.node.setEnabled(true);
		this.enemies = []; this.queue = []; this.shots.clear(); this.timers = [];
		this.run = createRun(this.player.name, this.player.avatar);
		this.coins = balance.startCoins; this.health = balance.fortHealth; this.wave = 0; this.speed = 1;
		this.unlocked = new Set(['guard']); this.seen.clear(); this.announced.clear(); this.zoom = 1; this.pan.setAll(0); this.hinted.clear(); this.attempts.clear();
		this.fell = false; this.treasureSaved = false; this.dragonCame = false; this.trapDone = false; this.playTime = 0; this.firstBuildHint = true;
		this.chest?.dispose(); this.chest = null;
		this.commander?.dispose();
		this.commander = new Avatar(this.chars, this.player.avatar, 'commander');
		this.commander.root.position.copyFrom(this.map.commander);
		this.commander.root.scaling.setAll(2.2);
		this.commander.heading = -Math.PI / 2;
		this.guardian.setExpression('Neutral');
		void this.audio.loop('MUS_Explore_Loop', 0.24);
		void this.audio.loop('AMB_Courtyard', 0.3);
		this.opts.onEvent?.('game.started', { gameId: config.gameId, runId: this.run.runId });
	}
	private startIntro() {
		this.mode = 'intro';
		const g = this.map.gate;
		this.intro.shots = [
			{ cam: g.add(new Vector3(13, 9, 16)), look: FORT_POS.add(new Vector3(0, 7, 4)), text: ui('intro1') },
			{ cam: new Vector3(26, 24, 58), look: new Vector3(2, 0, 20), text: ui('intro2') },
			{ cam: new Vector3(0, 34, 34), look: new Vector3(0, 0, 4), text: ui('intro3') }
		];
		this.intro.i = -1;
		this.intro.look = this.cam.getTarget().clone();
		this.nextShot();
	}
	private nextShot() {
		const I = this.intro;
		if (I.i + 1 >= I.shots.length) { this.ui.closeModal(); this.council(); return; }
		I.from.copyFrom(this.cam.position); I.fromLook.copyFrom(I.look);
		I.i++; I.t = 0;
		this.ui.intro(I.shots[I.i].text, I.i, I.shots.length, () => this.nextShot(), () => { this.ui.closeModal(); this.council(); });
	}

	/** Cyber's council before each wave: a safe answer unlocks the tower for the coming threat. */
	private council() {
		this.mode = 'council';
		this.hud.closeSheet();
		this.hud.showHud(true);
		const cp = checkpoints.find(c => c.id === WAVES[this.wave].council)!;
		this.openPanel(cp, safe => {
			if (!safe) { this.council(); return; }
			const tower = WAVES[this.wave].unlock;
			this.unlocked.add(tower);
			const bonus = this.run!.states[cp.id] === 'resolved_recovered' ? balance.councilRewardRecovered : balance.councilReward;
			this.coins += bonus;
			void this.audio.play('SFX_ShieldRestore', 0.7);
			this.hud.showCard(TOWERS[tower as TowerType].icon, ui('unlocked'), `${content.towers[tower].nameAr}\n${content.towers[tower].whatAr}`, fmt(ui('coinsBonus'), { n: bonus }), 5);
			this.commander?.play('celebrate');
			this.buildPhase();
		});
	}
	/** One decision panel (council or trap); onDone(safe) after the feedback card. */
	private openPanel(cp: CheckpointDef, onDone: (safe: boolean) => void) {
		const def = content.checkpoints[cp.id];
		const n = (this.attempts.get(cp.id) ?? 0) + 1;
		this.attempts.set(cp.id, n);
		const fill = (v: any): any => typeof v === 'string' ? v.replaceAll('{displayName}', this.run!.displayName)
			: Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
		const isTrap = cp.id === WAVES[2].trap;
		const model: PanelModel = {
			id: cp.id, titleAr: isTrap ? def.titleAr : `${ui('councilTitle')}: ${def.titleAr}`, evidenceAr: def.phone ? [] : fill(def.evidenceAr ?? []),
			checkpointId: cp.id, locked: false, resolved: false, noteAr: n > 1 ? ui('secondChance') : isTrap ? '' : ui('councilNote'),
			phone: def.phone ? fill(def.phone) : null,
			choices: shuffleForRun(fill(def.choices), this.run!.runId + ':' + n, cp.id)
		};
		void this.audio.play(def.phone?.app === 'call' ? 'SFX_PhoneRing' : 'SFX_UI_Open', 0.5);
		this.ui.panel(model, {
			officialSeen: true,
			onChoose: a => this.decide(cp, a, onDone),
			onClose: () => { this.ui.closeModal(); setTimeout(() => this.openPanel(cp, onDone), 200); },
			playVoice: names => { this.audio.stop('SFX_PhoneRing', 0.2); void this.playVoices(names); }
		});
	}
	private async playVoices(names: string[]) {
		for (const n of names) {
			if (!this.ui.modalOpen) return;
			const len = await this.audio.play(n, 1);
			await new Promise(r => setTimeout(r, Math.max(2300, len * 1000 + 300)));
		}
	}
	private decide(cp: CheckpointDef, actionId: string, onDone: (safe: boolean) => void) {
		const r = applyAction(this.run!, { eventId: uuid(), runId: this.run!.runId, checkpointId: cp.id, actionId });
		if (!r.accepted) { this.ui.closeModal(); onDone(isResolved(this.run!.states[cp.id])); return; }
		const safe = r.reason === 'resolved';
		this.opts.onEvent?.('game.decision', { gameId: config.gameId, checkpointId: cp.id, actionId, safe });
		const def = content.checkpoints[cp.id];
		const recovered = this.run!.states[cp.id] === 'resolved_recovered';
		const fb: Feedback = { accepted: true, safe, recovered, missionComplete: false, missionId: cp.missionId,
			titleAr: safe ? ui('safeTitle') : ui('unsafeTitle'),
			bodyAr: safe ? (recovered ? ui('recovered') + '\n' : '') + cp.feedbackAr : `${(def.consequencesAr?.[actionId] ?? '').replaceAll('{displayName}', this.run!.displayName)}\n${cp.feedbackAr}`,
			hintAr: cp.hintAr, worldEventAr: '', screenId: '' };
		this.audio.stop('SFX_PhoneRing', 0.2);
		void this.audio.play(safe ? 'SFX_Safe' : 'SFX_Unsafe', 0.8);
		this.commander?.play(safe ? 'happy' : 'sad');
		this.guardian.setExpression(safe ? 'Happy' : 'Sad');
		if (!safe && cp.id === WAVES[2].trap) this.trapConsequence();
		this.ui.feedback(fb, () => { this.ui.closeModal(); this.guardian.setExpression('Neutral'); onDone(safe); });
	}

	private buildPhase() {
		this.mode = 'build';
		const w = WAVES[this.wave];
		const types = [...new Set(w.groups.map(g => g.type))];
		this.hud.waveSheet(this.wave + 1, WAVES.length, types.map(t => ({ type: t, icon: ENEMIES[t as EnemyType].icon, isNew: !this.seen.has(t) })), () => this.startWave());
		if (this.firstBuildHint) this.hud.toast(ui('tapPad'), 5);
	}
	private startWave() {
		this.mode = 'wave';
		this.firstBuildHint = false;
		this.arrow.setEnabled(false);
		const w = WAVES[this.wave];
		this.queue = [];
		for (const g of w.groups) for (let i = 0; i < g.count; i++) this.queue.push({ type: g.type as EnemyType, at: (g.delay ?? 0) + i * g.gap });
		this.queue.sort((a, b) => a.at - b.at);
		this.waveT = 0;
		for (const t of new Set(w.groups.map(g => g.type))) this.seen.add(t);
		this.audio.beep(392, 0.25, 0.18, 'sawtooth'); setTimeout(() => this.audio.beep(523, 0.35, 0.18, 'sawtooth'), 220);
	}
	private waveCleared() {
		this.shots.clear();
		void this.audio.play('SFX_MissionComplete', 0.7);
		this.hud.flash('good');
		this.commander?.play('celebrate');
		this.burst(this.confetti, this.map.gate.add(new Vector3(0, 8, 0)), 220);
		this.hud.showBanner('good', ui('waveCleared'), '', 3);
		this.wave++;
		if (this.wave >= WAVES.length) { this.later(2.6, () => this.results()); this.mode = 'rest'; return; }
		this.later(1.8, () => this.council());
		this.mode = 'rest';                                                    // a short pause; building stays possible
	}

	// ---------------------------------------------------------------- input: tap a pad to build, a tower to upgrade
	private bindInput() {
		let sx = 0, sy = 0;
		const pts = new Map<number, { x: number; y: number }>();
		let pinch = 0, dragged = false;
		this.canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; dragged = false; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
		this.canvas.addEventListener('pointermove', e => {
			const p = pts.get(e.pointerId);
			if (!p) return;
			if (pts.size === 2) {                                                  // pinch to zoom
				const [a, b] = [...pts.values()];
				const before = Math.hypot(a.x - b.x, a.y - b.y);
				p.x = e.clientX; p.y = e.clientY;
				const [c, d] = [...pts.values()];
				const now = Math.hypot(c.x - d.x, c.y - d.y);
				if (pinch && before > 0) this.setZoom(this.zoom * before / now);
				pinch = now; dragged = true;
				return;
			}
			const dx = e.clientX - p.x, dy = e.clientY - p.y;
			p.x = e.clientX; p.y = e.clientY;
			if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) dragged = true;
			if (dragged && this.zoom < 0.98) this.panBy(dx, dy);                   // drag to look around when zoomed in
		});
		const lift = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
		this.canvas.addEventListener('pointercancel', lift);
		this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (1 + e.deltaY * 0.0012)); }, { passive: false });
		this.canvas.addEventListener('pointerup', e => {
			lift(e);
			if (dragged || Math.hypot(e.clientX - sx, e.clientY - sy) > 12) return;
			if (this.mode !== 'build' && this.mode !== 'wave' && this.mode !== 'rest') return;
			const r = this.canvas.getBoundingClientRect();
			const hit = this.scene.pick(e.clientX - r.left, e.clientY - r.top, m => m.isPickable);
			if (!hit?.hit) return;
			let pad = hit.pickedMesh?.metadata?.pad as number | undefined;
			if (pad === undefined && hit.pickedPoint) {                         // forgiving taps: the nearest pad within 3.5 m
				let best = 3.5;
				for (const [i, p] of this.map.pads.entries()) { const d = Vector3.Distance(p.pos, hit.pickedPoint); if (d < best) { best = d; pad = i; } }
			}
			if (pad !== undefined) this.tapPad(pad);
		});
	}
	private tapPad(i: number) {
		const t = this.towers[i];
		const back = () => { if (this.mode === 'build') this.buildPhaseSheet(); };
		if (t) {
			const cost = Math.round(TOWERS[t.type].cost * balance.upgradeCostRate);
			if (!t.def.passive) { this.ring.position.set(t.pos.x, 0.08, t.pos.z); this.ring.scaling.setAll(t.range); this.ring.setEnabled(true); }
			this.hud.towerSheet({ type: t.type, icon: TOWERS[t.type].icon, level: t.level, upgradeCost: cost, affordable: this.coins >= cost }, () => {
				this.coins -= cost; t.upgrade();
				void this.audio.play('SFX_Recovered', 0.6);
				this.burst(this.sparks, t.pos.add(new Vector3(0, 3, 0)), 40);
				this.hud.closeSheet(); back();
			});
			return;
		}
		const order: TowerType[] = ['guard', 'lantern', 'lock', 'twokeys', 'update', 'well'];
		this.hud.buildSheet(order.map(k => ({ type: k, icon: TOWERS[k].icon, cost: TOWERS[k].cost, locked: !this.unlocked.has(k), affordable: this.coins >= TOWERS[k].cost })), type => {
			const k = type as TowerType;
			this.coins -= TOWERS[k].cost;
			const tower = new Tower(this.kit, k, i, this.map.pads[i].pos);
			this.towers[i] = tower;
			this.map.pads[i].node.setEnabled(false);
			void this.audio.play('SFX_UI_Open', 0.6); this.audio.beep(660, 0.12, 0.12, 'triangle');
			this.burst(this.smoke, tower.pos.add(new Vector3(0, 0.6, 0)), 30);
			this.arrow.setEnabled(false);
			this.hud.closeSheet(); back();
		});
	}
	/** Re-show the wave panel after building, between waves. */
	private buildPhaseSheet() {
		if (this.mode !== 'build' || this.hud.sheetOpen || this.wave >= WAVES.length) return;
		const w = WAVES[this.wave];
		const types = [...new Set(w.groups.map(g => g.type))];
		this.hud.waveSheet(this.wave + 1, WAVES.length, types.map(t => ({ type: t, icon: ENEMIES[t as EnemyType].icon, isNew: !this.seen.has(t) })), () => this.startWave());
	}

	// ---------------------------------------------------------------- per frame
	private tick(rawDt: number) {
		if (!this.map) return;
		this.t += rawDt;
		for (const tm of this.timers.filter(x => x.at <= this.t)) { this.timers.splice(this.timers.indexOf(tm), 1); tm.fn(); }
		const dt = rawDt * (this.mode === 'wave' ? this.speed : 1);
		this.map.update(rawDt);
		this.guardian.root.position.y = this.map.cyberSpot.y + Math.sin(this.t * 1.4) * 0.5;
		this.commander?.update(rawDt, 0, false);
		this.domeHit = Math.max(0, this.domeHit - rawDt * 1.6);
		const low = this.health / balance.fortHealth < 0.35;
		this.domeMat.alpha = 0.06 + this.domeHit * 0.3;
		this.domeMat.emissiveColor = this.domeHit > 0.05 ? new Color3(1, 0.3, 0.25) : low ? new Color3(1, 0.55, 0.2) : new Color3(0.3, 0.85, 1);
		for (const t of this.towers) t?.grow(rawDt);
		for (const t of this.towers) if (t) t.update(this.mode === 'wave' ? dt : 0, this.enemies, (tw, e) => this.fire(tw, e), e => this.onReveal(e));
		if (this.mode === 'wave') this.tickWave(dt);
		this.shots.update(this.mode === 'trap' ? 0 : dt);
		for (const e of this.enemies) if (this.mode !== 'wave') e.update(0);
		if (this.chest && this.chestFall < 1) {
			this.chestFall = Math.min(1, this.chestFall + rawDt * 1.5);
			const p = this.map.path.at(this.chestD).p;
			this.chest.position.set(p.x + 3.2, 12 * (1 - this.chestFall) ** 2, p.z);
		}
		if (this.arrow.isEnabled()) this.arrow.position.y = 3.2 + Math.abs(Math.sin(this.t * 4)) * 0.8;
		if (this.mode === 'build' && this.firstBuildHint && !this.arrow.isEnabled() && !this.towers.some(Boolean) && !this.ui.modalOpen) {
			this.arrow.position.copyFrom(this.map.pads[1].pos); this.arrow.setEnabled(true);
		}
		if (this.mode === 'intro') this.introCam(rawDt); else this.placeCamera(rawDt);
		if (this.mode === 'build' || this.mode === 'wave') this.playTime += rawDt;
		if (this.ring.isEnabled() && !this.hud.sheetOpen) this.ring.setEnabled(false);
		// the wave panel always comes back between waves (after building, or after closing a sheet with ✕)
		if (this.mode === 'build' && !this.hud.sheetOpen && !this.ui.modalOpen) this.buildPhaseSheet();
		const padGlow = this.kit?.material('PadGlow') as any;
		if (padGlow?.emissiveColor) padGlow.emissiveColor = new Color3(0.37, 0.86, 1).scale(0.6 + 0.4 * Math.sin(this.t * 4));
		if (this.mode !== 'entry' && this.mode !== 'loading') this.hud.setHud(this.health, balance.fortHealth, this.coins, this.wave + 1, WAVES.length, this.speed);
	}

	private tickWave(dt: number) {
		this.waveT += dt;
		while (this.queue.length && this.queue[0].at <= this.waveT) this.spawn(this.queue.shift()!.type);
		for (const e of this.enemies) e.update(dt);
		for (const e of [...this.enemies]) {
			if (!e.alive) { this.kill(e); continue; }
			if (e.reached) this.reachGate(e);
		}
		const trap = WAVES[this.wave]?.trap;
		if (trap && !this.trapDone && this.waveT > 9) this.dropTrap(trap);
		if (!this.queue.length && !this.enemies.length) this.waveCleared();
	}
	private spawn(type: EnemyType, at = 0) {
		const e = new Enemy(this.kit, type, this.map.path, this.bars, 1 + this.wave * 0.15);
		e.d = at;
		e.update(0);
		this.enemies.push(e);
		if (!this.announced.has(type)) {                                        // Cyber names each new threat and its counter
			this.announced.add(type);
			this.hud.toast(`🛡️ ${ui('introName')}: ${ENEMIES[type].icon} ${content.enemies[type].nameAr}، ${content.enemies[type].stopAr}`, 4.5);
		}
	}
	private fire(t: Tower, e: Enemy) {
		this.shots.fire(t, e, (target, dmg, slow) => {
			if (slow) target.slowT = 1.2;
			if (target.hit(dmg)) this.burst(this.sparks, target.aim, 18);
		});
		if (this.t - this.shotSound > 0.09) { this.shotSound = this.t; this.audio.beep(t.type === 'twokeys' ? 880 : t.type === 'lock' ? 330 : 520, 0.05, 0.035, 'square'); }
	}
	private onReveal(e: Enemy) {
		this.burst(this.sparks, e.aim, 14);
		if (!this.hinted.has('reveal')) { this.hinted.add('reveal'); this.hud.toast(ui('revealed'), 2.6); }
	}
	private kill(e: Enemy) {
		this.coins += e.def.reward;
		this.audio.chime(Math.floor(Math.random() * 6));
		this.burst(this.sparks, e.aim, e.def.boss ? 120 : 26);
		if (e.def.boss) {
			this.hud.flash('good'); this.commander?.play('celebrate'); this.guardian.setExpression('Happy');
			this.hud.showBanner('good', ui('bossDown'), '', 4.5);
			this.burst(this.confetti, e.aim.add(new Vector3(0, 4, 0)), 400);
			void this.audio.play('SFX_MissionComplete', 0.9);
		}
		e.dispose();
		this.enemies.splice(this.enemies.indexOf(e), 1);
	}
	private reachGate(e: Enemy) {
		let dmg = e.def.damage;
		if (e.def.boss) {
			this.dragonCame = true;
			const well = this.towers.find(t => t?.type === 'well');
			if (well) { dmg = 2; this.treasureSaved = true; well.saving = 3; this.hud.showBanner('good', ui('wellSaved'), '', 5); this.burst(this.sparks, well.pos.add(new Vector3(0, 3, 0)), 80); }
			else { this.treasureSaved = false; this.hud.showBanner('bad', ui('treasureLocked'), '', 5); }
		}
		this.health -= dmg;
		this.domeHit = 1;
		this.hud.flash('hit');
		void this.audio.play('SFX_Unsafe', 0.55);
		this.commander?.play('sad');
		this.guardian.setExpression('Sad');
		this.later(1.5, () => this.guardian.setExpression(this.health / balance.fortHealth < 0.35 ? 'Sad' : 'Neutral'));
		// a hint the first time a threat gets through without its counter-tower on the map
		const counter: Record<string, TowerType> = { phisher: 'lantern', robot: 'lock', bat: 'twokeys', worm: 'update' };
		const need = counter[e.type];
		if (need && !this.hinted.has(e.type) && !this.towers.some(t => t?.type === need)) {
			this.hinted.add(e.type);
			this.hud.toast(fmt(ui('wrongTower'), { enemy: content.enemies[e.type].nameAr, tower: `${TOWERS[need].icon} ${content.towers[need].nameAr}` }), 4.5);
		} else if (!this.hinted.has('gate')) { this.hinted.add('gate'); this.hud.toast(ui('gateHit'), 2.6); }
		if (this.health <= 0) {                                               // children never lose the fort: Cyber recharges it
			this.fell = true;
			this.health = balance.reviveHealth;
			this.hud.showBanner('info', ui('revive'), '', 4);
			this.burst(this.sparks, this.map.cyberSpot, 120);
		}
		e.dispose();
		this.enemies.splice(this.enemies.indexOf(e), 1);
	}

	// ---------------------------------------------------------------- the "free gold" chest trap
	private dropTrap(cpId: string) {
		this.trapDone = true;
		const cp = checkpoints.find(c => c.id === cpId)!;
		if (!this.run || activeCheckpoint(this.run)?.id !== cp.id) return;
		this.chest = this.kit.copy('Chest_Gift', this.kit.units, 'chest')!;
		this.chest.scaling.setAll(2.2);
		this.chestD = this.map.path.length * 0.42; this.chestFall = 0;
		this.hud.toast(ui('trapFell'), 2);
		void this.audio.play('SFX_Prompt', 0.6);
		this.later(1.1, () => {
			this.mode = 'trap';
			this.openPanel(cp, safe => {
				if (!safe) return void this.dropRetry(cp);
				this.chest?.dispose(); this.chest = null;
				this.burst(this.sparks, this.map.path.at(this.chestD).p.add(new Vector3(3.2, 1, 0)), 40);
				this.mode = 'wave';
			});
		});
	}
	private dropRetry(cp: CheckpointDef) { this.openPanel(cp, safe => { if (!safe) return void this.dropRetry(cp); this.chest?.dispose(); this.chest = null; this.mode = 'wave'; }); }
	/** Opening the chest releases worms onto the road (the lesson, made visible). */
	private trapConsequence() {
		const lid = this.chest && this.kit.child(this.chest, 'Lid');
		if (lid) lid.rotation.y = -1.4;
		for (let i = 0; i < 4; i++) this.spawn('worm', this.chestD - i * 1.2);
		this.burst(this.smoke, this.map.path.at(this.chestD).p.add(new Vector3(3.2, 1, 0)), 50);
	}

	// ---------------------------------------------------------------- results
	private results() {
		this.mode = 'results';
		this.hud.closeSheet();
		const result = getResult(this.run!);
		const health = Math.max(0, this.health);
		const starReasons = [
			{ text: ui('starWaves'), on: true },
			{ text: ui('starHealth'), on: !this.fell && health >= balance.fortHealth / 2 },
			{ text: ui('starTreasure'), on: !this.dragonCame || this.treasureSaved }      // beaten before the gate, or saved by the well
		];
		const stars = starReasons.filter(s => s.on).length;
		this.audio.stop('MUS_Explore_Loop', 1);
		void this.audio.play(result.passed ? 'MUS_ResultPass' : 'MUS_ResultPractice', 0.8);
		this.opts.onComplete?.({ result, ledger: this.run!.ledger, fun: { stars, fortHealth: health, fell: this.fell, treasureSaved: !this.dragonCame || this.treasureSaved, seconds: Math.round(this.playTime) } });
		this.hud.results({ earned: result.earnedPoints, max: result.maximumPoints, passed: result.passed, stars, starReasons, seconds: this.playTime,
			review: checkpoints.map(c => ({ labelAr: c.labelAr, state: this.run!.states[c.id] })) }, () => { this.audio.stopAll(); this.newGame(); this.council(); });
	}

	// ---------------------------------------------------------------- camera and effects
	/** The whole battlefield on one screen: the fort at the top, the wadi entrance at the bottom. */
	private placeCamera(dt: number, snap = false) {
		const tall = this.engine.getRenderHeight() > this.engine.getRenderWidth();
		const baseLook = tall ? new Vector3(0, 0, -5) : new Vector3(0, 0, -9);
		const baseCam = tall ? new Vector3(0, 96, 46) : new Vector3(0, 62, 46);
		const look = this.zoom < 0.98 ? new Vector3(this.pan.x, 0, this.pan.z - 6) : baseLook;
		const want = look.add(baseCam.subtract(baseLook).scale(this.zoom));
		this.cam.fovMode = tall ? Camera.FOVMODE_VERTICAL_FIXED : Camera.FOVMODE_HORIZONTAL_FIXED;
		this.cam.fov = (tall ? 58 : 62) * D;
		this.cam.position = snap ? want : Vector3.Lerp(this.cam.position, want, Math.min(1, dt * 3));
		this.cam.setTarget(Vector3.Lerp(this.cam.getTarget(), look, snap ? 1 : Math.min(1, dt * 3)));
	}
	private introCam(dt: number) {
		const I = this.intro, shot = I.shots[I.i];
		if (!shot) return;
		I.t += dt;
		const a = Math.min(1, I.t / 1.8), e = a * a * (3 - 2 * a);
		I.look = Vector3.Lerp(I.fromLook, shot.look, e);
		this.cam.position = Vector3.Lerp(I.from, shot.cam, e).add(shot.look.subtract(shot.cam).normalize().scale(0.3 * Math.max(0, I.t - 1.8)));
		const tall = this.engine.getRenderHeight() > this.engine.getRenderWidth();
		this.cam.setTarget(tall ? I.look.subtract(new Vector3(0, Vector3.Distance(this.cam.position, I.look) * 0.3, 0)) : I.look);
		this.cam.fovMode = tall ? Camera.FOVMODE_VERTICAL_FIXED : Camera.FOVMODE_HORIZONTAL_FIXED;
		this.cam.fov = 64 * D;
		if (I.t > 10) this.nextShot();
	}
	private makeEffects() {
		// Cyber's shield dome over the fort
		this.dome = MeshBuilder.CreateSphere('dome', { diameter: 62, segments: 24, slice: 0.5 }, this.scene);
		this.dome.position.copyFrom(FORT_POS);
		this.domeMat = new StandardMaterial('domeMat', this.scene);
		this.domeMat.emissiveColor = new Color3(0.3, 0.85, 1); this.domeMat.diffuseColor = Color3.Black(); this.domeMat.alpha = 0.06;
		this.domeMat.backFaceCulling = false; this.domeMat.disableLighting = true;
		this.dome.material = this.domeMat; this.dome.isPickable = false;
		// health bars and the "build here" arrow
		this.bars = { bg: new StandardMaterial('hpBg', this.scene), fg: new StandardMaterial('hpFg', this.scene) };
		this.bars.bg.emissiveColor = new Color3(0.15, 0.1, 0.1); this.bars.bg.disableLighting = true;
		this.bars.fg.emissiveColor = new Color3(0.2, 0.9, 0.4); this.bars.fg.disableLighting = true;
		for (const m of [this.bars.bg, this.bars.fg]) m.backFaceCulling = false;
		const rm = new StandardMaterial('ringMat', this.scene);
		rm.emissiveColor = new Color3(0.35, 0.85, 1); rm.alpha = 0.18; rm.disableLighting = true; rm.backFaceCulling = false;
		this.ring = MeshBuilder.CreateDisc('range', { radius: 1, tessellation: 48 }, this.scene);
		this.ring.rotation.x = Math.PI / 2; this.ring.material = rm; this.ring.isPickable = false; this.ring.setEnabled(false);
		const am = new StandardMaterial('arrowMat', this.scene);
		am.emissiveColor = new Color3(1, 0.8, 0.2); am.disableLighting = true;
		this.arrow = MeshBuilder.CreateCylinder('arrow', { diameterTop: 1.6, diameterBottom: 0, height: 1.8, tessellation: 4 }, this.scene);
		this.arrow.material = am; this.arrow.isPickable = false; this.arrow.setEnabled(false);
		const dot = new DynamicTexture('dot', { width: 64, height: 64 }, this.scene, false);
		const c = dot.getContext() as CanvasRenderingContext2D;
		const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
		g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
		c.fillStyle = g; c.fillRect(0, 0, 64, 64); dot.update(); dot.hasAlpha = true;
		const make = (name: string, c1: Color4, c2: Color4, size: [number, number], speed: [number, number], gravity: number, life: [number, number], add = true) => {
			const p = new ParticleSystem(name, 600, this.scene);
			p.particleTexture = dot; p.color1 = c1; p.color2 = c2; p.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
			p.minSize = size[0]; p.maxSize = size[1]; p.minEmitPower = speed[0]; p.maxEmitPower = speed[1];
			p.minLifeTime = life[0]; p.maxLifeTime = life[1]; p.gravity = new Vector3(0, gravity, 0);
			p.direction1 = new Vector3(-1, 1, -1); p.direction2 = new Vector3(1, 2, 1);
			p.emitRate = 0; p.blendMode = add ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
			p.emitter = Vector3.Zero(); p.start();
			return p;
		};
		this.sparks = make('sparks', new Color4(1, 0.85, 0.35, 1), new Color4(0.4, 0.9, 1, 1), [0.25, 0.6], [3, 8], -6, [0.4, 0.9]);
		this.smoke = make('smoke', new Color4(0.85, 0.75, 0.6, 0.8), new Color4(0.7, 0.62, 0.5, 0.6), [0.8, 1.8], [1, 3], 0.5, [0.8, 1.4], false);
		this.confetti = make('confetti', new Color4(0.86, 0.09, 0.11, 1), new Color4(0.0, 0.5, 0.0, 1), [0.35, 0.7], [8, 15], -8, [1.5, 3], false);
		this.confetti.direction1 = new Vector3(-2, 4, -2); this.confetti.direction2 = new Vector3(2, 6, 2);
	}
	private burst(p: ParticleSystem, at: Vector3, n: number) { p.emitter = at.clone(); p.manualEmitCount = n; }

	dispose() { this.audio.stopAll(); this.engine.dispose(); this.host.innerHTML = ''; }
}
