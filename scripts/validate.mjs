// Checks the Cyber Fort content: missions.json ↔ content-ar.json (every checkpoint has a panel whose choices are exactly
// its actions), balance.json ↔ both (each wave's council and trap exist, every tower and threat has its Arabic name), and
// the safety rules (fictional addresses only). Part of `npm run build`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = p => fileURLToPath(new URL('../' + p, import.meta.url));
const json = p => JSON.parse(readFileSync(at(p), 'utf8'));
const errors = [], warnings = [];
const { missions } = json('src/data/missions.json');
const content = json('src/data/content-ar.json');
const balance = json('src/data/balance.json');
const cps = missions.flatMap(m => m.checkpoints);
const total = cps.reduce((n, c) => n + c.weight, 0);
if (total !== 100) errors.push(`weights add up to ${total}, not 100`);
for (const m of missions) if (m.checkpoints.reduce((n, c) => n + c.weight, 0) !== m.maximumPoints) errors.push(`${m.id}: weights ≠ maximumPoints`);
for (const c of cps) {
	const d = content.checkpoints?.[c.id];
	const actions = [c.safeActionId, ...c.unsafeActionIds];
	if (!d) { errors.push(`${c.id}: no panel in content-ar.json checkpoints`); continue; }
	const ch = (d.choices ?? []).map(x => x.actionId);
	for (const a of actions) if (!ch.includes(a)) errors.push(`${c.id}: choice for "${a}" missing`);
	for (const a of ch) if (!actions.includes(a)) errors.push(`${c.id}: choice "${a}" is not an action`);
	for (const a of c.unsafeActionIds) if (!d.consequencesAr?.[a]) warnings.push(`${c.id}: consequence for "${a}" missing`);
	for (const x of d.choices ?? []) if ([...x.labelAr].length > 60) warnings.push(`${c.id}: choice "${x.actionId}" is long for children`);
	const ph = d.phone;
	if (ph?.inspect && ph.inspect.parts.join('') !== ph.fromAddress) errors.push(`${c.id}: inspect.parts must join to fromAddress`);
	for (const k of ['linkActionId', 'attachmentActionId']) if (ph?.[k] && !ch.includes(ph[k])) errors.push(`${c.id}: phone.${k} is not a choice`);
	if (ph?.app === 'call' && !ph.linesAr?.length) errors.push(`${c.id}: a call needs linesAr`);
}
// waves: one council per wave in checkpoint order, the trap in between, unlocks and threats known
const order = [];
for (const [i, w] of balance.waves.entries()) {
	order.push(w.council);
	if (w.trap) order.push(w.trap);
	if (!balance.towers[w.unlock]) errors.push(`wave ${i + 1}: unlock "${w.unlock}" is not a tower`);
	for (const g of w.groups) if (!balance.enemies[g.type]) errors.push(`wave ${i + 1}: threat "${g.type}" unknown`);
}
if (order.join() !== cps.map(c => c.id).join()) errors.push(`waves must ask the checkpoints in order: ${order.join(', ')} vs ${cps.map(c => c.id).join(', ')}`);
for (const t of Object.keys(balance.towers)) if (!content.towers?.[t]?.nameAr || !content.towers?.[t]?.whatAr) errors.push(`content-ar.json towers.${t}: nameAr and whatAr required`);
for (const e of Object.keys(balance.enemies)) if (!content.enemies?.[e]?.nameAr || !content.enemies?.[e]?.stopAr) errors.push(`content-ar.json enemies.${e}: nameAr and stopAr required`);
// safety: fictional content only
const texts = [];
const walk = (v, p) => { if (typeof v === 'string') texts.push([p, v]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`); };
walk(content, 'content'); walk(missions, 'missions');
for (const [p, s] of texts) {
	if (/https?:\/\/|www\./i.test(s)) errors.push(`${p}: real-looking link`);
	for (const host of s.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\b/gi) ?? [])
		if (/^[a-z]{2,}$/i.test(host.split('.').pop()) && !/\.(internal|example|test|invalid)$/i.test(host) && !/\.(png|mp3|zip|apk|pdf|exe|json|ts|md)$/i.test(host))
			errors.push(`${p}: address "${host}" is not fictional (end it with .internal)`);
}
for (const w of warnings) console.log('  warn ', w);
for (const e of errors) console.log('  ERROR', e);
console.log(`validate: ${cps.length} checkpoints, ${balance.waves.length} waves, ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length) process.exit(1);
