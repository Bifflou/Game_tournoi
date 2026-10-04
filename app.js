'use strict';

/* ---------- Catalogue des jeux ---------- */
// type 'duel' : 1 contre 1, le premier à `winTo` gagne.
// type 'ffa'  : chacun pour soi, `max` joueurs par partie.
//   input 'score' : on saisit un score par joueur — rule 'first' (un seul joueur atteint target),
//                   'sum' (la somme des scores vaut target), 'free' (libre).
//   input 'rank'  : on saisit l'ordre d'arrivée.
const GAMES = {
  mk1:   { name: 'Mortal Kombat 1', icon: '🐉', type: 'duel', winTo: 2, rules: '1 contre 1 · le premier à 2 rounds remporte le match' },
  mk92:  { name: 'Mortal Kombat (1992)', icon: '🕹️', type: 'duel', winTo: 2, rules: '1 contre 1 · le premier à 2 rounds remporte le match' },
  party: { name: 'Party Animals', icon: '🐶', type: 'duel', winTo: 3, rules: '1 contre 1 · le premier à 3 points remporte le match' },
  bfu:   { name: 'Boomerang Fu', icon: '🪃', type: 'ffa', max: 6, input: 'score', rule: 'free', parties: 3, target: 10, targetLabel: 'Limite de score', rules: 'Chacun pour soi (2 à 6) · le premier à la limite de score gagne la partie' },
  sr:    { name: 'SpeedRunners', icon: '🏃', type: 'ffa', max: 4, input: 'score', rule: 'first', parties: 3, target: 3, rules: 'Jusqu\'à 4 joueurs · le premier à 3 points remporte la map' },
  sr2:   { name: 'SpeedRunners 2', icon: '⚡', type: 'ffa', max: 4, input: 'score', rule: 'first', parties: 3, target: 3, rules: 'Jusqu\'à 4 joueurs · le premier à 3 points remporte la map' },
  uch:   { name: 'Ultimate Chicken Horse', icon: '🐔', type: 'ffa', max: 6, input: 'rank', parties: 2, rules: 'Jusqu\'à 6 joueurs · on note l\'ordre dans lequel chacun atteint le quota de points' },
  gb:    { name: 'Gang Beasts', icon: '🥊', type: 'ffa', max: 8, input: 'score', rule: 'sum', parties: 1, target: 5, targetLabel: 'Rounds par partie', rules: 'Le dernier en vie gagne le round · on note les rounds gagnés par chacun' },
};
const IMG = { mk1: 'mk1.png', mk92: 'mk92.webp', party: 'party.webp', bfu: 'bfu.png', sr: 'sr.webp', sr2: 'sr2.webp', uch: 'uch.webp', gb: 'gb.webp' };
// Expose le key art du jeu au CSS via la variable --art.
const art = key => `style="--art:url('img/${IMG[key]}')"`;
const FORMATS = { pool: 'Poule', poolfinal: 'Poule + finale', elim: 'Élimination directe' };
// Points de soirée attribués selon le classement final de chaque jeu.
const PLACE_POINTS = [10, 7, 5, 3, 2, 1, 0, 0];
const COLORS = ['#ff5d73', '#4cc9f0', '#ffd23f', '#7ae582', '#c77dff', '#ff9f1c', '#2ec4b6', '#f48fb1'];
const MAX_PLAYERS = 8;
const KEY = 'gametournoi.v1';

/* ---------- Utilitaires ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const shuffle = a => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// Attribue les places à une liste déjà triée ; les égalités partagent la même place.
const assignPlaces = (sorted, keyFn) => sorted.forEach((r, i) => {
  r.place = i > 0 && keyFn(r) === keyFn(sorted[i - 1]) ? sorted[i - 1].place : i + 1;
});

/* ---------- État ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.players)) return s;
  } catch (e) { /* stockage indisponible ou corrompu */ }
  return { players: [], setup: {}, soiree: null, history: [] };
}
let state = load();
const ui = { tab: 'soiree', gameId: null, drafts: {}, editing: {} };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
const player = pid => state.players.find(p => p.id === pid) || { name: '?', color: '#888' };
const defaultOpts = key => (GAMES[key].type === 'duel'
  ? { format: 'poolfinal' }
  : { parties: GAMES[key].parties, target: GAMES[key].target });

/* ---------- Génération des matchs ---------- */
// Tous contre tous (méthode du cercle) : chaque tour fait jouer tout le monde une fois.
function roundRobin(ids) {
  const a = [...ids];
  if (a.length % 2) a.push(null);
  const n = a.length, out = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      if (x && y) out.push({ round: r, a: x, b: y });
    }
    a.splice(1, 0, a.pop());
  }
  return out;
}

// Ordre des têtes de série dans un tableau : 4 -> [1,4,2,3], 8 -> [1,8,4,5,2,7,3,6].
function seedOrder(size) {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap(s => [s, n + 1 - s]);
  }
  return o;
}

// Compositions des parties chacun-pour-soi. S'il y a plus de joueurs que de places,
// on tourne : chaque joueur est au repos à tour de rôle et tous jouent le même nombre de parties.
function ffaPlan(order, max, parties) {
  const n = order.length;
  if (n <= max) return Array.from({ length: parties }, () => [...order]);
  const rest = n - max, cycles = Math.max(1, Math.round(parties / max)), out = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < n; i++) {
      const ex = new Set();
      for (let k = 0; k < rest; k++) ex.add(order[(i + k) % n]);
      out.push(order.filter(p => !ex.has(p)));
    }
  }
  return out;
}

function matchCount(key, opts, n) {
  const def = GAMES[key];
  if (n < 2) return '';
  if (def.type === 'duel') {
    if (opts.format === 'elim') return `${n - 1 + (n >= 4 ? 1 : 0)} matchs (petite finale incluse)`;
    const m = n * (n - 1) / 2;
    return opts.format === 'poolfinal' && n >= 3 ? `${m} matchs + la finale` : `${m} match${m > 1 ? 's' : ''}`;
  }
  const plan = ffaPlan(Array.from({ length: n }, (_, i) => i), def.max, opts.parties);
  return n > def.max
    ? `${plan.length} parties à ${def.max} (rotation, ${plan.length * def.max / n} par joueur)`
    : `${plan.length} partie${plan.length > 1 ? 's' : ''} à ${n}`;
}

/* ---------- Calcul des classements ---------- */
// Un résultat n'est valide que si ses joueurs correspondent toujours au match
// (un résultat modifié plus haut dans le tableau invalide les matchs suivants).
function duelRes(g, id, a, b) {
  const r = g.results[id];
  return r && r.a === a && r.b === b ? r : null;
}
const winnerOf = (m, res) => (res.sa > res.sb ? m.a : m.b);

function computePool(g) {
  const st = Object.fromEntries(g.order.map(p => [p, { pid: p, j: 0, w: 0, l: 0, f: 0, a: 0 }]));
  const beat = {};
  const matches = roundRobin(g.order).map((m, i) => {
    const id = 'p' + i, res = duelRes(g, id, m.a, m.b);
    if (res) {
      const A = st[m.a], B = st[m.b];
      A.j++; B.j++; A.f += res.sa; A.a += res.sb; B.f += res.sb; B.a += res.sa;
      const w = winnerOf(m, res), l = w === m.a ? m.b : m.a;
      st[w].w++; st[l].l++; beat[w + '>' + l] = true;
    }
    return { id, a: m.a, b: m.b, res, group: `Tour ${m.round + 1}` };
  });
  const key = r => `${r.w}|${r.f - r.a}|${r.f}`;
  const rows = Object.values(st).sort((x, y) =>
    y.w - x.w || (y.f - y.a) - (x.f - x.a) || y.f - x.f || (beat[y.pid + '>' + x.pid] ? 1 : beat[x.pid + '>' + y.pid] ? -1 : 0));
  assignPlaces(rows, key);
  if (!matches.some(m => m.res)) rows.forEach(r => { r.place = null; });
  const poolDone = matches.every(m => m.res);
  let complete = poolDone, final = null;
  if (g.opts.format === 'poolfinal' && g.order.length >= 3) {
    complete = false;
    if (poolDone) {
      final = { id: 'final', a: rows[0].pid, b: rows[1].pid, group: 'Finale' };
      final.res = duelRes(g, 'final', final.a, final.b);
      rows.forEach((r, i) => { if (i >= 2) r.place = Math.max(3, r.place); });
      if (final.res) {
        const w = winnerOf(final, final.res);
        if (w === rows[1].pid) [rows[0], rows[1]] = [rows[1], rows[0]];
        rows[0].place = 1; rows[1].place = 2;
        complete = true;
      }
    } else {
      final = { id: 'final', a: undefined, b: undefined, res: null, group: 'Finale' };
    }
  }
  rows.forEach(r => { r.vals = [r.j, r.w, r.l, (r.f - r.a > 0 ? '+' : '') + (r.f - r.a)]; });
  return { kind: 'pool', head: ['J', 'V', 'D', '+/-'], rows, matches, final, complete };
}

function computeElim(g) {
  const n = g.order.length;
  let size = 2;
  while (size < n) size *= 2;
  const R = Math.log2(size), rounds = [], place = {};
  let cur = seedOrder(size).map(s => g.order[s - 1] ?? null);
  for (let r = 0; r < R; r++) {
    const ms = [], next = [];
    for (let m = 0; m < cur.length; m += 2) {
      const a = cur[m], b = cur[m + 1], id = `r${r}m${m / 2}`;
      const bye = r === 0 && (a === null || b === null);
      let res = null, win, lose;
      if (bye) win = a ?? b;
      else if (a && b) {
        res = duelRes(g, id, a, b);
        if (res) { win = winnerOf({ a, b }, res); lose = win === a ? b : a; }
      }
      ms.push({ id, a, b, bye, res, win, lose });
      next.push(win);
    }
    rounds.push(ms);
    cur = next;
  }
  const names = ['Finale', 'Demi-finales', 'Quarts de finale'];
  rounds.forEach((ms, r) => { ms.name = names[R - 1 - r] || `Tour ${r + 1}`; });
  const final = rounds[R - 1][0];
  const semis = R >= 2 ? rounds[R - 2] : null;
  let third = null;
  if (semis && semis.every(m => !m.bye)) {
    third = { id: 'third', a: semis[0].lose, b: semis[1].lose, res: null };
    if (third.a && third.b) third.res = duelRes(g, 'third', third.a, third.b);
  }
  rounds.forEach((ms, r) => ms.forEach(m => {
    if (!m.lose) return;
    if (r === R - 1) { place[m.win] = 1; place[m.lose] = 2; }
    else if (r === R - 2) { if (!third) place[m.lose] = 3; }
    else place[m.lose] = 2 ** (R - r - 1) + 1;
  }));
  if (third && third.res) {
    const w = winnerOf(third, third.res);
    place[w] = 3; place[w === third.a ? third.b : third.a] = 4;
  }
  const rows = g.order.map(pid => ({ pid, place: place[pid] || null, vals: [] }))
    .sort((x, y) => (x.place || 99) - (y.place || 99));
  return { kind: 'elim', head: [], rows, rounds, third, complete: !!final.win && (!third || !!third.res) };
}

// Points d'une partie chacun-pour-soi à k joueurs : k-1, k-2, ... 0, avec +1 pour le vainqueur.
// Les ex æquo se partagent les points des places qu'ils occupent.
function ffaMatchPoints(pids, scores) {
  const s = [...pids].sort((x, y) => scores[y] - scores[x]), k = s.length, out = {};
  let i = 0;
  while (i < k) {
    let j = i, sum = 0;
    while (j + 1 < k && scores[s[j + 1]] === scores[s[i]]) j++;
    for (let q = i; q <= j; q++) sum += (k - 1 - q) + (q === 0 ? 1 : 0);
    for (let q = i; q <= j; q++) out[s[q]] = { pts: sum / (j - i + 1), place: i + 1 };
    i = j + 1;
  }
  return out;
}

function computeFfa(g) {
  const def = GAMES[g.key];
  const st = Object.fromEntries(g.order.map(p => [p, { pid: p, j: 0, w: 0, pts: 0 }]));
  const matches = ffaPlan(g.order, def.max, g.opts.parties).map((pids, i) => {
    const id = 'f' + i, r = g.results[id];
    const res = r && pids.length === Object.keys(r.scores).length && pids.every(p => p in r.scores) ? r : null;
    let points = null;
    if (res) {
      points = ffaMatchPoints(pids, res.scores);
      pids.forEach(p => { st[p].j++; st[p].pts += points[p].pts; if (points[p].place === 1) st[p].w++; });
    }
    return { id, pids, rest: g.order.filter(p => !pids.includes(p)), res, points, label: `Partie ${i + 1}` };
  });
  const rows = Object.values(st).sort((x, y) => y.pts - x.pts || y.w - x.w);
  assignPlaces(rows, r => `${r.pts}|${r.w}`);
  if (!matches.some(m => m.res)) rows.forEach(r => { r.place = null; });
  rows.forEach(r => { r.vals = [r.j, r.w, fmt(r.pts)]; });
  return { kind: 'ffa', head: ['J', 'V', 'Pts'], rows, matches, complete: matches.every(m => m.res) };
}

function compute(g) {
  if (GAMES[g.key].type === 'ffa') return computeFfa(g);
  return g.opts.format === 'elim' ? computeElim(g) : computePool(g);
}

// Points de soirée d'un jeu terminé (ex æquo : moyenne des places occupées).
function gamePoints(rows) {
  const byPlace = {}, out = {};
  rows.forEach(r => { if (r.place) (byPlace[r.place] = byPlace[r.place] || []).push(r.pid); });
  for (const [p, ids] of Object.entries(byPlace)) {
    let s = 0;
    for (let i = 0; i < ids.length; i++) s += PLACE_POINTS[+p - 1 + i] || 0;
    ids.forEach(id => { out[id] = s / ids.length; });
  }
  return out;
}

function leaderboard(soiree) {
  const st = Object.fromEntries(soiree.pids.map(p => [p, { pid: p, total: 0, wins: 0, per: {} }]));
  const comps = soiree.games.map(g => ({ g, c: compute(g) }));
  comps.forEach(({ g, c }) => {
    if (!c.complete) return;
    const pts = gamePoints(c.rows);
    c.rows.forEach(r => {
      st[r.pid].per[g.id] = pts[r.pid] || 0;
      st[r.pid].total += pts[r.pid] || 0;
      if (r.place === 1) st[r.pid].wins++;
    });
  });
  const rows = Object.values(st).sort((x, y) => y.total - x.total || y.wins - x.wins);
  assignPlaces(rows, r => `${r.total}|${r.wins}`);
  return { rows, comps };
}

/* ---------- Rendu ---------- */
const plHtml = (pid, cls = '') => {
  const p = player(pid);
  return `<span class="pl ${cls}" style="--c:${p.color}">${esc(p.name)}</span>`;
};
const medal = place => (place ? (['🥇', '🥈', '🥉'][place - 1] || place + 'e') : '—');

function renderSetup() {
  const present = state.players.filter(p => p.present);
  const n = present.length;
  const chosen = Object.keys(GAMES).filter(k => state.setup[k]);
  const players = state.players.map(p => `
    <div class="chip ${p.present ? 'on' : ''}" style="--c:${p.color}">
      <button class="chip-main" data-act="togglePresent" data-id="${p.id}" title="Présent ce soir ?">
        <span class="dot"></span>${esc(p.name)}
      </button>
      <button class="chip-x" data-act="delPlayer" data-id="${p.id}" title="Supprimer">×</button>
    </div>`).join('');

  const covers = Object.entries(GAMES).map(([key, def]) => `
    <button class="cover ${state.setup[key] ? 'on' : ''}" ${art(key)} data-act="toggleGame" data-key="${key}" aria-pressed="${!!state.setup[key]}">
      <span class="check">${state.setup[key] ? '✓' : '+'}</span>
      <span class="cover-name">${def.name}</span>
    </button>`).join('');

  const settings = chosen.map(key => {
    const def = GAMES[key], o = state.setup[key];
    const opts = def.type === 'duel'
      ? `<div class="seg">${Object.entries(FORMATS).map(([f, label]) =>
        `<button class="${o.format === f ? 'on' : ''}" data-act="fmt" data-key="${key}" data-v="${f}">${label}</button>`).join('')}</div>`
      : stepper('Parties', key, 'parties', o.parties) + (def.targetLabel ? stepper(def.targetLabel, key, 'target', o.target) : '');
    return `<div class="setting" ${art(key)}>
      <div class="setting-head"><span class="thumb"></span><div><b>${def.name}</b><small>${def.rules}</small></div></div>
      ${opts}<p class="hint">${matchCount(key, o, n) || 'Ajoute des joueurs pour voir le format'}</p></div>`;
  }).join('');

  const ready = n >= 2 && chosen.length > 0;
  return `
    <section class="panel">
      <h2>1 · Les joueurs <small>${n} présent${n > 1 ? 's' : ''}</small></h2>
      <form id="addPlayer" class="row">
        <input id="playerName" maxlength="16" placeholder="Nom du joueur" autocomplete="off" enterkeyhint="done">
        <button class="btn" ${state.players.length >= MAX_PLAYERS ? 'disabled' : ''}>Ajouter</button>
      </form>
      <div class="chips">${players || '<p class="hint">Ajoute les joueurs de la soirée (2 à 8).</p>'}</div>
      ${state.players.length ? '<p class="hint">Touche un nom pour indiquer s\'il joue ce soir.</p>' : ''}
    </section>
    <section class="panel">
      <h2>2 · Les jeux <small>${chosen.length} sélectionné${chosen.length > 1 ? 's' : ''}</small></h2>
      <div class="covers">${covers}</div>
    </section>
    ${chosen.length ? `<section class="panel"><h2>3 · Les formats</h2><div class="settings">${settings}</div></section>` : ''}
    <div class="cta"><button class="btn big" data-act="start" ${ready ? '' : 'disabled'}>${ready ? 'Lancer la soirée 🚀' : 'Il faut 2 joueurs et 1 jeu'}</button></div>`;
}

const stepper = (label, key, field, v) => `
  <div class="stepper"><span>${label}</span>
    <button data-act="opt" data-key="${key}" data-f="${field}" data-d="-1">−</button><b>${v}</b>
    <button data-act="opt" data-key="${key}" data-f="${field}" data-d="1">+</button>
  </div>`;

function renderDuel(g, m, label) {
  const def = GAMES[g.key];
  if (!m.a || !m.b) {
    return `<div class="match wait">${label ? `<div class="mlabel">${label}</div>` : ''}
      <div class="duel">${m.a ? plHtml(m.a) : '<i>à déterminer</i>'}<span class="vs">vs</span>${m.b ? plHtml(m.b) : '<i>à déterminer</i>'}</div></div>`;
  }
  const w = m.res ? winnerOf(m, m.res) : null;
  const lines = [];
  for (let j = 0; j < def.winTo; j++) lines.push([def.winTo, j]);
  for (let j = def.winTo - 1; j >= 0; j--) lines.push([j, def.winTo]);
  const chips = lines.map(([sa, sb]) => {
    const on = m.res && m.res.sa === sa && m.res.sb === sb;
    return `<button class="${on ? 'on' : ''}" data-act="duel" data-g="${g.id}" data-m="${m.id}" data-a="${m.a}" data-b="${m.b}" data-sa="${sa}" data-sb="${sb}">${sa}-${sb}</button>`;
  }).join('');
  return `<div class="match ${m.res ? 'done' : ''}">${label ? `<div class="mlabel">${label}</div>` : ''}
    <div class="duel">${plHtml(m.a, w === m.a ? 'win' : w ? 'lose' : '')}
      <span class="vs">${m.res ? `${m.res.sa} – ${m.res.sb}` : 'vs'}</span>
      ${plHtml(m.b, w === m.b ? 'win' : w ? 'lose' : '')}</div>
    <div class="scores" style="--n:${lines.length > 4 ? lines.length / 2 : lines.length}">${chips}</div></div>`;
}

function draftFor(g, m) {
  const k = g.id + ':' + m.id, def = GAMES[g.key];
  if (!ui.drafts[k]) {
    if (def.input === 'rank') {
      ui.drafts[k] = m.res ? [...m.pids].sort((x, y) => m.res.scores[y] - m.res.scores[x]) : [];
    } else {
      ui.drafts[k] = Object.fromEntries(m.pids.map(p => [p, m.res ? m.res.scores[p] : 0]));
    }
  }
  return ui.drafts[k];
}

// Renvoie un message d'erreur si la saisie n'est pas encore valide, sinon ''.
function ffaCheck(g, m, d) {
  const def = GAMES[g.key];
  if (def.input === 'rank') return d.length >= m.pids.length - 1 ? '' : 'Touche les joueurs dans l\'ordre d\'arrivée.';
  const vals = m.pids.map(p => d[p]), t = g.opts.target;
  if (def.rule === 'first') return vals.filter(v => v === t).length === 1 ? '' : `Un seul joueur doit avoir ${t} points.`;
  if (def.rule === 'sum') {
    const s = vals.reduce((x, y) => x + y, 0);
    return s === t ? '' : `${s} / ${t} rounds attribués.`;
  }
  return vals.some(v => v > 0) ? '' : 'Saisis le score de chaque joueur.';
}

function renderFfaMatch(g, m) {
  const def = GAMES[g.key], k = g.id + ':' + m.id;
  const rest = m.rest.length ? `<span class="rest">Au repos : ${m.rest.map(p => esc(player(p).name)).join(', ')}</span>` : '';
  const head = `<div class="mlabel">${m.label}${rest}</div>`;
  if (m.res && !ui.editing[k]) {
    const sorted = [...m.pids].sort((x, y) => m.points[x].place - m.points[y].place);
    return `<div class="match done">${head}
      <ol class="result">${sorted.map(p => `<li><span class="rk">${medal(m.points[p].place)}</span>${plHtml(p)}
        ${def.input === 'score' ? `<span class="raw">${m.res.scores[p]}</span>` : ''}<span class="gain">+${fmt(m.points[p].pts)}</span></li>`).join('')}</ol>
      <button class="link" data-act="editFfa" data-k="${k}">Modifier</button></div>`;
  }
  const d = draftFor(g, m), err = ffaCheck(g, m, d);
  let body;
  if (def.input === 'rank') {
    body = `<div class="ranktap">${m.pids.map(p => {
      const i = d.indexOf(p);
      return `<button class="${i >= 0 ? 'on' : ''}" style="--c:${player(p).color}" data-act="rankTap" data-k="${k}" data-p="${p}">
        <b>${i >= 0 ? i + 1 : '·'}</b>${esc(player(p).name)}</button>`;
    }).join('')}</div>`;
  } else {
    body = m.pids.map(p => `<div class="srow">${plHtml(p)}
      <span class="stepper"><button data-act="step" data-k="${k}" data-p="${p}" data-d="-1">−</button><b>${d[p]}</b>
      <button data-act="step" data-k="${k}" data-p="${p}" data-d="1" data-max="${def.rule === 'free' ? 99 : g.opts.target}">+</button></span></div>`).join('');
  }
  return `<div class="match">${head}${body}
    <div class="row end"><span class="hint">${err}</span>
    <button class="btn small" data-act="saveFfa" data-g="${g.id}" data-m="${m.id}" ${err ? 'disabled' : ''}>Valider</button></div></div>`;
}

function renderGame(g, c) {
  const def = GAMES[g.key];
  const pts = c.complete ? gamePoints(c.rows) : null;
  const table = `<div class="scroll"><table class="tbl"><thead><tr><th>#</th><th class="l">Joueur</th>${c.head.map(h => `<th>${h}</th>`).join('')}${pts ? '<th>Soirée</th>' : ''}</tr></thead>
    <tbody>${c.rows.map(r => `<tr><td>${medal(r.place)}</td><td class="l">${plHtml(r.pid)}</td>
      ${r.vals.map(v => `<td>${v}</td>`).join('')}${pts ? `<td class="gain">+${fmt(pts[r.pid] || 0)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;

  let body = '';
  if (c.kind === 'pool') {
    const groups = [...new Set(c.matches.map(m => m.group))];
    body = groups.map(gr => `<h4>${gr}</h4><div class="grid">${c.matches.filter(m => m.group === gr).map(m => renderDuel(g, m)).join('')}</div>`).join('');
    if (c.final) body += `<h4>🏆 Finale <small>les 2 premiers de la poule</small></h4><div class="grid">${renderDuel(g, c.final)}</div>`;
  } else if (c.kind === 'elim') {
    body = `<div class="bracket">${c.rounds.map(ms => `<div class="col"><h4>${ms.name}</h4>${ms.map(m =>
      (m.bye ? `<div class="match wait"><div class="duel">${plHtml(m.win)}<span class="vs">exempt</span><span></span></div></div>` : renderDuel(g, m))).join('')}</div>`).join('')}
      ${c.third ? `<div class="col"><h4>Petite finale</h4>${renderDuel(g, c.third)}</div>` : ''}</div>`;
  } else {
    body = `<h4>Parties</h4><div class="grid">${c.matches.map(m => renderFfaMatch(g, m)).join('')}</div>`;
  }
  const format = def.type === 'duel' ? FORMATS[g.opts.format] : matchCount(g.key, g.opts, g.order.length);
  return `<section class="panel">
    <div class="hero" ${art(g.key)}><span class="thumb"></span>
      <div><h2>${def.name}</h2><span class="tag ${c.complete ? '' : 'live'}">${c.complete ? 'Terminé' : 'En cours'}</span>
      <p class="hint">${def.rules}</p><p class="hint">${format}</p></div></div>
    ${table}${body}
    <button class="link danger center" data-act="delGame" data-id="${g.id}">Retirer ce jeu de la soirée</button></section>`;
}

function renderSoiree() {
  const s = state.soiree, { rows, comps } = leaderboard(s);
  if (!s.games.some(g => g.id === ui.gameId)) {
    ui.gameId = (comps.find(x => !x.c.complete) || comps[0] || { g: {} }).g.id;
  }
  const done = comps.filter(x => x.c.complete).length;
  const board = `<section class="panel board">
    <h2>Classement <small>${done}/${s.games.length} jeux terminés</small></h2>
    <div class="scroll"><table class="tbl"><thead><tr><th>#</th><th class="l">Joueur</th>
      ${s.games.map(g => `<th title="${GAMES[g.key].name}"><span class="mini" ${art(g.key)}></span></th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${done ? medal(r.place) : '—'}</td><td class="l">${plHtml(r.pid)}</td>
        ${s.games.map(g => `<td>${g.id in r.per ? fmt(r.per[g.id]) : '·'}</td>`).join('')}<td class="total">${fmt(r.total)}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Chaque jeu terminé rapporte ${PLACE_POINTS.slice(0, s.pids.length).join(' / ')} points selon la place.</p>
  </section>`;
  const tabs = `<div class="gtabs">${comps.map(({ g, c }) =>
    `<button class="gtab ${g.id === ui.gameId ? 'on' : ''} ${c.complete ? 'done' : ''}" ${art(g.key)} data-act="selGame" data-id="${g.id}" aria-label="${GAMES[g.key].name}"></button>`).join('')}</div>`;
  const cur = comps.find(x => x.g.id === ui.gameId);
  const add = `<section class="panel"><h2>Ajouter un jeu</h2><div class="gtabs">${Object.entries(GAMES).map(([k, d]) =>
    `<button class="gtab add" ${art(k)} data-act="addGame" data-key="${k}" aria-label="Ajouter ${d.name}"></button>`).join('')}</div></section>`;
  return `${board}${tabs}${cur ? renderGame(cur.g, cur.c) : '<p class="hint center">Aucun jeu pour l\'instant.</p>'}${add}
    <button class="btn big" data-act="finish">Terminer la soirée 🏁</button>
    <button class="link danger center" data-act="cancel">Annuler la soirée sans l'enregistrer</button>`;
}

function renderHistory() {
  if (!state.history.length) return '<p class="hint center">Aucune soirée enregistrée pour l\'instant.</p>';
  const titles = {};
  state.history.forEach(h => h.rows.filter(r => r.place === 1).forEach(r => { titles[r.name] = (titles[r.name] || 0) + 1; }));
  const hall = Object.entries(titles).sort((a, b) => b[1] - a[1])
    .map(([name, nb]) => `<span class="tag">🏆 ${esc(name)} × ${nb}</span>`).join(' ');
  return `<section class="panel"><h2>Palmarès</h2><div class="chips">${hall}</div></section>` + state.history.map(h => `
    <section class="panel">
      <div class="row between"><h2>${new Date(h.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        <button class="link danger" data-act="delHist" data-id="${h.id}">Supprimer</button></div>
      <table class="tbl"><tbody>${h.rows.map(r => `<tr><td>${medal(r.place)}</td>
        <td class="l"><span class="pl" style="--c:${r.color}">${esc(r.name)}</span></td><td class="total">${fmt(r.total)} pts</td></tr>`).join('')}</tbody></table>
      <p class="hint">${h.games.map(x => `${x.icon} ${x.name} : ${x.winners.map(esc).join(', ') || '—'}`).join(' · ')}</p>
    </section>`).join('');
}

function render() {
  document.getElementById('nav').innerHTML = [['soiree', 'Soirée'], ['history', 'Historique']].map(([t, l]) =>
    `<button class="${ui.tab === t ? 'on' : ''}" data-act="tab" data-t="${t}">${l}</button>`).join('');
  document.getElementById('app').innerHTML = ui.tab === 'history' ? renderHistory() : state.soiree ? renderSoiree() : renderSetup();
}

/* ---------- Actions ---------- */
const findGame = id => state.soiree.games.find(g => g.id === id);
const newGame = (key, opts, pids) => ({ id: uid(), key, opts: { ...opts }, order: shuffle(pids), results: {} });

const ACT = {
  tab: d => { ui.tab = d.t; },
  togglePresent: d => { const p = player(d.id); p.present = !p.present; },
  delPlayer: d => {
    if (confirm(`Supprimer ${player(d.id).name} ?`)) state.players = state.players.filter(p => p.id !== d.id);
  },
  toggleGame: d => {
    if (state.setup[d.key]) delete state.setup[d.key];
    else state.setup[d.key] = defaultOpts(d.key);
  },
  fmt: d => { state.setup[d.key].format = d.v; },
  opt: d => {
    const o = state.setup[d.key];
    o[d.f] = Math.min(d.f === 'parties' ? 10 : 30, Math.max(1, o[d.f] + +d.d));
  },
  start: () => {
    const pids = state.players.filter(p => p.present).map(p => p.id);
    const games = Object.keys(GAMES).filter(k => state.setup[k]).map(k => newGame(k, state.setup[k], pids));
    state.soiree = { id: uid(), date: new Date().toISOString(), pids, games };
    ui.gameId = null;
  },
  selGame: d => { ui.gameId = d.id; },
  duel: d => {
    const g = findGame(d.g), sa = +d.sa, sb = +d.sb, cur = g.results[d.m];
    if (cur && cur.a === d.a && cur.b === d.b && cur.sa === sa && cur.sb === sb) delete g.results[d.m];
    else g.results[d.m] = { a: d.a, b: d.b, sa, sb };
  },
  step: d => {
    const draft = ui.drafts[d.k];
    draft[d.p] = Math.min(d.max ? +d.max : 99, Math.max(0, draft[d.p] + +d.d));
  },
  rankTap: d => {
    const draft = ui.drafts[d.k], i = draft.indexOf(d.p);
    if (i >= 0) draft.splice(i, 1);
    else draft.push(d.p);
  },
  saveFfa: d => {
    const g = findGame(d.g), m = compute(g).matches.find(x => x.id === d.m), k = g.id + ':' + m.id;
    const draft = ui.drafts[k];
    let scores = draft;
    if (GAMES[g.key].input === 'rank') {
      // Le dernier joueur non touché prend la dernière place.
      const order = [...draft, ...m.pids.filter(p => !draft.includes(p))];
      scores = Object.fromEntries(order.map((p, i) => [p, order.length - i]));
    }
    g.results[m.id] = { scores: { ...scores } };
    delete ui.drafts[k];
    delete ui.editing[k];
  },
  editFfa: d => { ui.editing[d.k] = true; },
  addGame: d => {
    const g = newGame(d.key, state.setup[d.key] || defaultOpts(d.key), state.soiree.pids);
    state.soiree.games.push(g);
    ui.gameId = g.id;
  },
  delGame: d => {
    if (confirm('Retirer ce jeu de la soirée ? Ses résultats seront perdus.')) {
      state.soiree.games = state.soiree.games.filter(g => g.id !== d.id);
    }
  },
  finish: () => {
    const s = state.soiree, { rows, comps } = leaderboard(s);
    const open = comps.filter(x => !x.c.complete).length;
    const msg = open ? `${open} jeu(x) non terminé(s) ne compteront pas. Terminer quand même ?` : 'Terminer la soirée et l\'enregistrer dans l\'historique ?';
    if (!confirm(msg)) return;
    state.history.unshift({
      id: s.id, date: s.date,
      rows: rows.map(r => ({ name: player(r.pid).name, color: player(r.pid).color, total: r.total, place: r.place })),
      games: comps.filter(x => x.c.complete).map(({ g, c }) => ({
        name: GAMES[g.key].name, icon: GAMES[g.key].icon,
        winners: c.rows.filter(r => r.place === 1).map(r => player(r.pid).name),
      })),
    });
    state.soiree = null;
    ui.tab = 'history';
  },
  cancel: () => { if (confirm('Annuler la soirée ? Tous les résultats seront perdus.')) state.soiree = null; },
  delHist: d => { if (confirm('Supprimer cette soirée de l\'historique ?')) state.history = state.history.filter(h => h.id !== d.id); },
};

if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    ACT[el.dataset.act](el.dataset);
    save();
    render();
  });
  document.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('playerName').value.trim();
    if (!name || state.players.length >= MAX_PLAYERS) return;
    const color = COLORS.find(c => !state.players.some(p => p.color === c)) || COLORS[0];
    state.players.push({ id: uid(), name, color, present: true });
    save();
    render();
    document.getElementById('playerName').focus();
  });
  render();
} else {
  module.exports = { GAMES, compute, leaderboard, newGame, ffaPlan, roundRobin, gamePoints };
}
