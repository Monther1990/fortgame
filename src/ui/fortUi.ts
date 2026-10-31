// Cyber Fort interface (Arabic, for children): HUD (fort shield, wave, trust coins, speed, sound), the build sheet with a
// card per tower (what it stops, its cost, locked until Cyber's council), the tower sheet (upgrade), the wave button with
// the threats coming next, new-threat and unlock cards, banners, toasts and the results. Big type, few words.
import './fort.css';
import { content, ui } from '../game/data';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');
export const digits = (n: number | string) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

export interface TowerCard { type: string; icon: string; cost: number; locked: boolean; affordable: boolean }
export interface ReviewRow { labelAr: string; state: string }

export class FortUi {
	readonly el: HTMLElement;
	private hud: HTMLElement; private sheet: HTMLElement; private banner: HTMLElement; private toastEl: HTMLElement; private card: HTMLElement;
	private bannerT = 0; private toastT = 0; private cardT = 0;
	onSound: (muted: boolean) => void = () => {};
	onSpeed: () => void = () => {};
	onZoom: () => void = () => {};
	click: () => void = () => {};
	private muted = false;

	constructor(host: HTMLElement, private base: string) {
		this.el = document.createElement('div');
		this.el.className = 'fc-ui';
		this.el.dir = 'rtl';
		this.el.innerHTML = `
			<div class="fc-flash"></div>
			<div class="fc-hud hidden" dir="ltr">
				<div class="fc-health"><b>🛡️</b><div class="fc-bar"><i></i></div><span></span></div>
				<div class="fc-wave"></div>
				<div class="fc-coins">🪙 <b>٠</b></div>
				<button class="fc-icon" data-a="zoom" aria-label="zoom">🔍</button>
				<button class="fc-icon" data-a="speed" aria-label="${esc(ui('speed'))}">⏩</button>
				<button class="fc-icon" data-a="sound" aria-label="sound"><img src="${base}assets/ui/SoundOn.png" alt=""></button>
			</div>
			<div class="fc-banner hidden"></div>
			<div class="fc-card hidden"></div>
			<div class="fc-toast hidden"></div>
			<div class="fc-sheet hidden"></div>`;
		host.appendChild(this.el);
		const $ = (s: string) => this.el.querySelector(s) as HTMLElement;
		this.hud = $('.fc-hud'); this.sheet = $('.fc-sheet'); this.banner = $('.fc-banner'); this.toastEl = $('.fc-toast'); this.card = $('.fc-card');
		$('[data-a=speed]').addEventListener('click', () => { this.click(); this.onSpeed(); });
		$('[data-a=zoom]').addEventListener('click', () => { this.click(); this.onZoom(); });
		const snd = $('[data-a=sound]');
		snd.addEventListener('click', () => {
			this.muted = !this.muted;
			(snd.firstElementChild as HTMLImageElement).src = `${base}assets/ui/${this.muted ? 'SoundOff' : 'SoundOn'}.png`;
			this.onSound(this.muted);
		});
	}

	showHud(on: boolean) { this.hud.classList.toggle('hidden', !on); }
	setHud(health: number, maxHealth: number, coins: number, wave: number, waves: number, speed: number) {
		const r = Math.max(0, health / maxHealth);
		(this.hud.querySelector('.fc-bar i') as HTMLElement).style.width = `${Math.round(r * 100)}%`;
		this.hud.querySelector('.fc-health')!.classList.toggle('low', r < 0.35);
		this.set('.fc-health span', digits(Math.max(0, Math.ceil(health))));
		this.set('.fc-coins b', digits(coins));
		this.set('.fc-wave', fmt(ui('waveOf'), { n: digits(Math.min(waves, Math.max(1, wave))), total: digits(waves) }));
		this.set('[data-a=speed]', speed > 1 ? '⏩×٢' : '⏩');
	}
	private set(sel: string, text: string) { const e = this.hud.querySelector(sel) as HTMLElement; if (e.textContent !== text) e.textContent = text; }
	flash(kind: 'hit' | 'good') { const f = this.el.querySelector('.fc-flash')!; f.className = 'fc-flash ' + kind; void (f as HTMLElement).offsetWidth; f.classList.add('on'); }

	// ---------------------------------------------------------------- sheets
	closeSheet() { this.sheet.classList.add('hidden'); this.sheet.innerHTML = ''; }
	get sheetOpen() { return !this.sheet.classList.contains('hidden'); }
	buildSheet(cards: TowerCard[], onPick: (type: string) => void) {
		const T = content.towers ?? {};
		this.sheet.innerHTML = `<div class="fc-panel"><div class="fc-head"><h2>${esc(ui('buildTitle'))}</h2><button class="fc-x" aria-label="${esc(ui('close'))}">✕</button></div>
			<div class="fc-grid">${cards.map(c => `<button class="fc-tower ${c.locked ? 'locked' : ''} ${!c.affordable && !c.locked ? 'poor' : ''}" data-t="${c.type}">
				<span class="fc-ti">${c.locked ? '🔒' : c.icon}</span><b>${esc(T[c.type]?.nameAr ?? c.type)}</b>
				<small>${esc(c.locked ? ui('lockedTower') : T[c.type]?.whatAr ?? '')}</small>
				<em>🪙 ${digits(c.cost)}</em></button>`).join('')}</div></div>`;
		this.sheet.classList.remove('hidden');
		this.sheet.querySelector('.fc-x')!.addEventListener('click', () => { this.click(); this.closeSheet(); });
		for (const b of this.sheet.querySelectorAll<HTMLButtonElement>('.fc-tower')) b.addEventListener('click', () => {
			const c = cards.find(x => x.type === b.dataset.t)!;
			if (c.locked) { this.toast(ui('lockedTower')); return; }
			if (!c.affordable) { this.toast(ui('notEnough')); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
			this.click(); onPick(c.type);
		});
	}
	towerSheet(t: { type: string; icon: string; level: number; upgradeCost: number; affordable: boolean }, onUpgrade: () => void) {
		const T = content.towers ?? {};
		this.sheet.innerHTML = `<div class="fc-panel small"><div class="fc-head"><h2>${t.icon} ${esc(T[t.type]?.nameAr ?? t.type)}</h2><button class="fc-x">✕</button></div>
			<p class="fc-what">${esc(T[t.type]?.whatAr ?? '')}</p>
			${t.level > 1 || t.type === 'well' ? `<p class="fc-lvl">${esc(t.type === 'well' ? '' : ui('level2'))}</p>` : `<button class="fc-go ${t.affordable ? '' : 'poor'}" data-a="up">${esc(ui('upgrade'))} 🪙 ${digits(t.upgradeCost)}</button>`}</div>`;
		this.sheet.classList.remove('hidden');
		this.sheet.querySelector('.fc-x')!.addEventListener('click', () => { this.click(); this.closeSheet(); });
		this.sheet.querySelector('[data-a=up]')?.addEventListener('click', () => {
			if (!t.affordable) { this.toast(ui('notEnough')); return; }
			this.click(); onUpgrade();
		});
	}
	/** Between waves: the threats coming and what stops each one, and the big start button. */
	waveSheet(wave: number, waves: number, threats: { type: string; icon: string; isNew: boolean }[], onStart: () => void) {
		const E = content.enemies ?? {};
		this.sheet.innerHTML = `<div class="fc-panel small"><h2 class="fc-center">${esc(fmt(ui('waveOf'), { n: digits(wave), total: digits(waves) }))}</h2>
			<div class="fc-threats">${threats.map(t => `<div class="fc-threat ${t.isNew ? 'new' : ''}"><span>${t.icon}</span><div><b>${esc(E[t.type]?.nameAr ?? t.type)}${t.isNew ? ` <i>${esc(ui('newThreat'))}</i>` : ''}</b>
				<small>${esc(E[t.type]?.stopAr ?? '')}</small></div></div>`).join('')}</div>
			<p class="fc-hint">${esc(ui('firstBuild'))}</p>
			<button class="fc-go" data-a="start">${esc(ui('startWave'))}</button></div>`;
		this.sheet.classList.remove('hidden');
		this.sheet.classList.add('wave');
		this.sheet.querySelector('[data-a=start]')!.addEventListener('click', () => { this.click(); this.sheet.classList.remove('wave'); this.closeSheet(); onStart(); });
	}
	/** Collapse the wave sheet to a small button so the child can build (tap a pad) before starting. */
	get waveSheetOpen() { return this.sheet.classList.contains('wave') && !this.sheet.classList.contains('hidden'); }

	// ---------------------------------------------------------------- messages
	showBanner(kind: 'good' | 'bad' | 'info', title: string, body: string, seconds = 4.5) {
		this.banner.className = `fc-banner ${kind}`;
		this.banner.innerHTML = `<b>${esc(title)}</b>${body ? `<p>${nl(body)}</p>` : ''}`;
		clearTimeout(this.bannerT);
		this.bannerT = window.setTimeout(() => this.banner.classList.add('hidden'), seconds * 1000);
	}
	toast(text: string, seconds = 2.6) {
		this.toastEl.className = 'fc-toast';
		this.toastEl.textContent = text;
		clearTimeout(this.toastT);
		this.toastT = window.setTimeout(() => this.toastEl.classList.add('hidden'), seconds * 1000);
	}
	/** A card in the middle of the screen (unlocked tower, new threat); tap or wait to close. */
	showCard(icon: string, title: string, body: string, extra = '', seconds = 5) {
		this.card.className = 'fc-card';
		this.card.innerHTML = `<span class="fc-big">${icon}</span><b>${esc(title)}</b><p>${nl(body)}</p>${extra ? `<em>${esc(extra)}</em>` : ''}`;
		clearTimeout(this.cardT);
		const close = () => this.card.classList.add('hidden');
		this.card.onclick = close;
		this.cardT = window.setTimeout(close, seconds * 1000);
	}

	results(r: { earned: number; max: number; passed: boolean; stars: number; starReasons: { text: string; on: boolean }[]; seconds: number; review: ReviewRow[] },
		onAgain: () => void) {
		const pct = Math.round(r.earned / r.max * 100);
		const mins = Math.floor(r.seconds / 60), secs = String(Math.floor(r.seconds % 60)).padStart(2, '0');
		const rows = r.review.map(x => `<li class="${x.state}"><i>${x.state === 'resolved_pristine' ? '✓' : x.state === 'resolved_recovered' ? '↺' : '•'}</i>
			<span>${esc(x.labelAr)}</span><em>${esc(x.state === 'resolved_pristine' ? ui('safeFirst') : x.state === 'resolved_recovered' ? ui('recovered') : '')}</em></li>`).join('');
		this.sheet.innerHTML = `<div class="fc-results"><div class="fc-rcard">
			<img class="fc-mascot" src="${this.base}assets/ui/Cyber.png" alt="">
			<h1>${esc(ui('resultTitle'))}</h1>
			<div class="fc-score ${r.passed ? 'good' : 'warn'}" style="--p:${pct}">
				<div class="fc-ring"><b>${digits(Math.round(r.earned))}</b><small>/ ${digits(r.max)}</small></div>
				<div><span>${esc(ui('knowledge'))}</span><strong>${esc(r.passed ? ui('passed') : ui('practice'))}</strong></div>
			</div>
			<div class="fc-fun"><div><span>${esc(ui('stars'))}</span><b class="fc-stars">${[1, 2, 3].map(i => `<i class="${i <= r.stars ? 'on' : ''}">★</i>`).join('')}</b></div>
				<div><span>${esc(ui('time'))}</span><b>${digits(mins)}:${digits(secs)}</b></div></div>
			<ul class="fc-why">${r.starReasons.map(x => `<li class="${x.on ? 'on' : ''}"><i>★</i>${esc(x.text)}</li>`).join('')}</ul>
			<p class="fc-note">${esc(ui('starsNote'))}</p>
			<h3>${esc(ui('review'))}</h3><ul class="fc-review">${rows}</ul>
			<button class="fc-go" data-a="again">${esc(ui('again'))} 🏰</button></div></div>`;
		this.sheet.classList.remove('hidden');
		this.sheet.querySelector('[data-a=again]')!.addEventListener('click', () => { this.click(); this.closeSheet(); onAgain(); });
	}
}
