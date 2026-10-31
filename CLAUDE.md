# CLAUDE.md: integrating Cyber Fort into the Cyber Aware platform

This repository is **«قلعة سايبر: حماة الرستاق» (Cyber Fort: Defenders of Rustaq)**, a 3D tower-defence game for children
about layered cyber safety, in Arabic (RTL). It is a static web app (Vite + TypeScript + Babylon.js 8) that runs entirely on
the player's device (phone or desktop browser): no game server, no server GPU, any number of simultaneous players.

Your task in the platform repository: **place the game on the platform's game page and wire the result back.**

## How the game works
Rustaq Fort (modelled from the National Museum model of قلعة الرستاق) stands at the end of a wadi road. Threats walk the road
to the gate; the child builds towers on glowing pads. Each tower is a safety habit and each threat a real risk:

| Threat | What it stands for | The tower that stops it |
|---|---|---|
| المتنكر | phishing in disguise | فانوس «تحقق من المرسل» reveals it |
| روبوت التخمين | password guessing | برج «العبارة الطويلة» breaks it |
| المتصل المحتال | caller asking for the code | برج «التحقق الثنائي» (the only one that reaches the sky) |
| الدودة | malware from fake downloads | برج «التحديث» stops and slows it |
| وحش الفدية (boss) | ransomware | بئر «النسخة الاحتياطية» saves the treasure |

**Cyber's council (مجلس سايبر):** before each of the 5 waves, a decision. A safe answer unlocks the tower for the coming
threat. A "free gold" chest trap falls during wave 3; opening it releases worms onto the road.

Knowledge points come only from the 6 decisions. Waves, the fort's shield, coins and stars are for fun. Children never lose
the fort: Cyber recharges the shield. A game lasts about 6 to 10 minutes. Zoom with pinch, the mouse wheel or 🔍; ⏩
doubles the speed.

## What is here
- `dist/`: the ready-to-serve build (about 17 MB). It works from any sub-path.
- `integration/react/CyberAwareGame.tsx`: the React component (iframe + secure `postMessage`), the same one used by every
  Cyber Aware game.
- `src/`: the source.
  - `src/fort/*` is the game.
  - `src/game/assessment.ts` is the scoring engine.
  - `src/data/missions.json` holds the scoring rules, `content-ar.json` all the Arabic text, and `balance.json` the fun
    numbers.
- `tests/assessment.test.mjs`: scoring tests (`npm test`).
- `scripts/validate.mjs`: content, wave-order and safety checks (run by `npm run build`).
- `pipeline/build_fort.py`, `pipeline/build_units.py`: the Blender scripts that made the fort, towers and threats
  (`public/assets/fort.glb`, `units.glb`).
- `references/rustaq-fort-model.png`: the owner's reference photo.

## Integration steps (React platform)
1. Copy `dist/` to the platform's static files, e.g. `public/games/cyber-fort/`, keeping its structure.
2. Copy `integration/react/CyberAwareGame.tsx` once (skip if another Cyber Aware game already added it).
3. Render it in a container with a real height:
   ```tsx
   <div style={{ height: '100dvh' }}>
     <CyberAwareGame src="/games/cyber-fort/index.html" title="قلعة سايبر" onComplete={handleComplete} onEvent={handleEvent} />
   </div>
   ```
4. Messages (each is `{ type, protocolVersion: 1, gameId: 'cyber-fort-rustaq', data }`):
   - `game.started`: `{ gameId, runId }`.
   - `game.decision`: `{ gameId, checkpointId, actionId, safe }`.
   - `game.completed`, passed to `onComplete({ result, ledger, fun })`:
     - `result`: the knowledge score out of 100 (pass ≥ 70).
     - `ledger`: the ordered decisions.
     - `fun`: `{ stars, fortHealth, fell, treasureSaved, seconds }`. Never store `fun` as a grade.
5. To store scores, **send `gameId`, `runId` and `ledger` to the .NET API and recompute on the server**. The rules:
   - Process the ledger in order; only the first unresolved checkpoint may change.
   - An unsafe action marks the checkpoint `unsafe_seen`.
   - A safe action marks it `resolved_pristine` (full weight), or `resolved_recovered` after an unsafe attempt (× 0.6).
   - Pass means all six checkpoints are resolved and the score is ≥ 70.
   - Reject unknown ids, repeated `eventId`s, and a `runId` the server did not issue.
   - Port `src/game/assessment.ts` and test it against `src/data/scoring-fixtures.json`.

## Security and privacy
- The game posts only to the `?parentOrigin=` origin; the component accepts messages only from the game's origin and its
  iframe. Never use `'*'`.
- The nickname is display-only. All content is fictional (`*.internal` addresses, simulated codes).
- CSP for the game page:
  - `script-src 'self'`
  - `img-src 'self' blob: data:`
  - `media-src 'self' blob:`
  - `connect-src 'self'`
  - `worker-src 'self' blob:`
  - the platform page needs `frame-src` for the game's origin.

## Building from source
```bash
npm ci
npm test
npm run build       # validate + typecheck + dist/
npm run dev         # http://localhost:5173 ; dev-only test jumps: ?demo=build&wave=0, ?demo=boss, ?demo=results&skill=medium
```

## Status (honest)
Tested in Chromium:
- **Viewports:** 375×812 portrait and desktop.
- **Full games, automated with fixed time steps, for three player types** (skilled, medium, guards-only), with all safe
  answers and with all first answers unsafe:
  - knowledge scores of 100 and 60, checked against the rules;
  - the second chances, the trap and its worms;
  - the well saving the treasure, and Cyber's recharge.
- **Production build in an iframe:** `game.started` and `game.decision` posted only to the parent origin.

**Not tested yet:**
- real iPhone / Android: frame rate with many units, touch, pinch, sound;
- landscape on phones;
- the platform's own page.

Test on real phones before releasing to students.
