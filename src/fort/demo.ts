// Development only (imported by main.ts when ?demo= is present on the dev server): plays the game with fixed time steps,
// like a child would (answers the council, builds and upgrades towers), to take screenshots and to check the balance.
//   ?demo=intro&shot=1 | council | build | wave&t=12 | trap | boss | results   &plan=SSUSSS (S safe / U unsafe first)
//   &skill=good|poor (poor builds only guard towers)   &w=390 (phone width in a wider headless window)
import { checkpoints } from '../game/data';

export async function runDemo(g: any, params: URLSearchParams, _handle: unknown) {
	const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
	const w = params.get('w');
	if (w) { const el = document.getElementById('game')!; el.style.width = w + 'px'; el.style.right = 'auto'; document.body.style.background = '#222'; }
	while (!g.map || g.mode !== 'entry') await wait(100);
	if (w) g.engine.resize();
	const step = (n: number, dt = 1 / 30) => { for (let i = 0; i < n; i++) g.tick(dt); };
	const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
	const which = params.get('demo')!;
	const plan = (params.get('plan') ?? 'SSSSSS').split('');
	const skill = params.get('skill') ?? 'good';
	($('.ath-input') as HTMLInputElement).value = 'ريم';
	$(`.ath-avatar[data-v=${params.get('avatar') ?? 'female'}]`)!.click();
	$('[data-a=start]')!.click();
	if (which === 'intro') { const k = Number(params.get('shot') ?? 0); for (let i = 0; i < k; i++) g.nextShot(); step(70); return freeze(g); }
	g.ui.closeModal(); g.council();
	const tries = new Map<string, number>();
	/** Answer whatever decision panel is open (safe, or unsafe first if the plan says so). */
	const answer = () => {
		const go = $('[data-a=go]'); if (go) { go.click(); return true; }
		const choices = document.querySelectorAll<HTMLButtonElement>('.ath-choice');
		if (!choices.length) return false;
		const id = [...g.attempts.keys()].pop() as string;
		const idx = Number(id.split('C')[1]) - 1;
		const n = tries.get(id) ?? 0; tries.set(id, n + 1);
		const def = checkpoints.find(c => c.id === id)!;
		const wantSafe = plan[idx] !== 'U' || n > 0;
		const pick = [...choices].find(b => (b.dataset.id === def.safeActionId) === wantSafe)!;
		pick.click();
		return true;
	};
	const order = [1, 2, 4, 5, 7, 9, 10, 0, 3, 6, 8];
	const want: Record<number, string[]> = skill === 'medium'
		? { 0: ['lantern'], 1: ['lock'], 2: ['twokeys'], 3: ['update'], 4: ['well'] }
		: skill === 'poor'
		? { 0: ['guard', 'guard'], 1: ['guard'], 2: ['guard'], 3: ['guard'], 4: ['guard'] }
		: { 0: ['lantern', 'guard'], 1: ['lock', 'lock'], 2: ['twokeys', 'twokeys'], 3: ['update', 'update'], 4: ['well', 'lock'] };
	const build = () => {
		if (which === 'build' && params.has('tap') && g.wave === Number(params.get('wave') ?? 0)) return;   // leave the pads empty for the build-sheet picture
		for (const type of want[g.wave] ?? []) {
			const have = g.towers.filter((t: any) => t?.type === type).length;
			const need = (want[g.wave] ?? []).filter(x => x === type).length + (g.wave > 0 && type === 'guard' ? 1 : 0);
			if (have >= need) continue;
			const pad = order.find(i => !g.towers[i]);
			if (pad === undefined) return;
			g.tapPad(pad);
			const card = $(`.fc-tower[data-t=${type}]`);
			if (card && !card.classList.contains('locked') && !card.classList.contains('poor')) card.click();
			g.hud.closeSheet();
		}
		if (skill === 'good' && g.coins > 140) {                                // spend spare coins: upgrade, then more guards
			const t = g.towers.find((x: any) => x && x.level === 1 && x.type !== 'well');
			if (t) { g.tapPad(t.pad); $('[data-a=up]')?.click(); g.hud.closeSheet(); }
		}
	};
	const stats = { leaks: 0, fell: false, waves: [] as any[] };
	let lastWave = -1, guard = 0;
	while (g.mode !== 'results' && guard++ < 200000) {
		if (which === 'trap' && g.mode === 'trap' && $('.ath-choice')) { step(2); return freeze(g); }
		if (answer()) { step(2); continue; }
		if (g.mode === 'build' && g.hud.waveSheetOpen) {
			build();
			if (which === 'build' && g.wave === Number(params.get('wave') ?? 0)) { g.buildPhaseSheet(); step(30); if (params.has('tap')) g.tapPad(Number(params.get('tap'))); step(2); return freeze(g); }
			if (which === 'council' && g.wave === Number(params.get('wave') ?? 0)) { g.hud.closeSheet(); g.council(); step(20); return freeze(g); }
			$('[data-a=start]')?.click();
		}
		if (g.mode === 'wave' && g.wave !== lastWave) { lastWave = g.wave; stats.waves.push({ wave: g.wave + 1, startHealth: g.health, coins: g.coins }); }
		if (g.mode === 'wave') build();
		if (which === 'wave' && g.mode === 'wave' && g.wave === Number(params.get('wave') ?? 0) && g.waveT > Number(params.get('t') ?? 12)) {
			if (params.has('zoom')) { g.toggleZoom(); step(75); }
			step(1); return freeze(g);
		}
		if (which === 'trap' && g.mode === 'trap' && $('.ath-choice')) { step(2); return freeze(g); }
		if (which === 'boss' && g.enemies.some((e: any) => e.type === 'dragon' && e.d > 40)) { if (params.has('zoom')) { g.toggleZoom(); step(75); } step(1); return freeze(g); }
		step(1);
	}
	stats.fell = g.fell;
	(window as any).__demoResult = { ...stats, health: g.health, coins: g.coins, treasureSaved: g.treasureSaved, playTime: Math.round(g.playTime),
		ledger: g.run.ledger.length, score: g.run.ledger.map((l: any) => l.outcome) };
	step(Number(params.get('extra') ?? 3));
	freeze(g);
}
function freeze(g: any) { g.tick = () => {}; (window as any).__demoReady = true; document.title = 'READY'; }
