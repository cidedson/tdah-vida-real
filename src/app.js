import { db, exportAll, importAll, wipeAll, uid, todayKey } from './db.js';
import * as N from './native.js';
import { CHAPTERS, PRINCIPLES, RULES, HELP, ROUTINES, BODY_CHECKS, BAD_DAY_CHECKS, WEEK_CHECKS } from './content.js';
import { keyStore, PROVIDERS, modelOptions, listGeminiModels, buildSystem, runAgent, QUICK, planTask } from './assistant.js';
import { shareLink, shareCodeFromUrl, decodeShare } from './sharelink.js';
import { parseCapture, nextOccurrence, repLabel, validRep, guessCat, whenLabel, keyToDate, dateKey } from './capture.js';
import { MOODS, moodOf, face, phraseOfDay } from './mood.js';

const VERSION = '1.7 (navegador)';

// ---------------- Estado ----------------
const S = {
  tab: 'hoje', settings: null, page: null, viewingPast: false, pastList: null,
  routines: [], logs: [], strat: {}, projects: [], ideas: [], habits: [], week: null, reminders: [],
  calPerm: 'unknown', events: null, eventsWeek: null, notif: false,
  guideQuery: '', guideFilter: 'all', openRoutine: null, editRoutine: false, openProject: null,
  tool: 'remedios', timer: null, importMode: 'merge',
  chat: null, sending: false, meds: [], exact: 'unknown', onb: null, houseForm: false, calendars: null,
  appVersion: null, driveBusy: false,
  drawer: false, prevTab: 'hoje', focus: null, parkOpen: false, medEdit: false,
  catFilter: null, weekPages: {}, whenOpen: {},
};

// ---------------- Utilidades ----------------
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const hm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = 86400000;
const saveTimers = {};
function later(key, fn, ms = 350) { clearTimeout(saveTimers[key]); saveTimers[key] = setTimeout(fn, ms); }

function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
}

function fmtDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    o = o[k];
  }
  o[parts[parts.length - 1]] = value;
}
function getPath(obj, path) { return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }

// ---------------- Carregamento ----------------
function newPage(id) {
  return {
    id, energy: null, dump: '', top3: [{ t: '', s: '', d: false }, { t: '', s: '', d: false }, { t: '', s: '', d: false }],
    blocks: { manha: '', tarde: '', noite: '' }, body: {}, done: [], good: '',
    bad: false, badChecks: {}, badTask: '', badTomorrow: '',
  };
}

async function loadAll() {
  S.settings = await db.get('settings', 'main');
  if (!S.settings) {
    S.settings = { id: 'main', name: '', bodyChecks: [...BODY_CHECKS], createdAt: Date.now(), lastBackup: null };
    await db.put('settings', S.settings);
  }
  if (!Array.isArray(S.settings.bodyChecks)) S.settings.bodyChecks = [...BODY_CHECKS];
  if (!Array.isArray(S.settings.cats)) { S.settings.cats = DEFAULT_CATS.map(([id, name, color]) => ({ id, name, color })); await db.put('settings', S.settings); }
  let routines = await db.all('routines');
  if (!routines.length) {
    routines = ROUTINES.map((r, i) => ({ ...r, steps: [...r.steps], order: i, notifyTime: null, run: null }));
    await db.putMany('routines', routines);
  }
  S.routines = routines.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  S.logs = await db.all('logs');
  S.strat = Object.fromEntries((await db.all('strategies')).map(x => [x.id, x]));
  S.projects = (await db.all('projects')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  S.ideas = (await db.all('ideas')).sort((a, b) => (b.at || 0) - (a.at || 0));
  S.habits = (await db.all('habits')).sort((a, b) => (a.order || 0) - (b.order || 0));
  S.reminders = await db.all('reminders');
  S.meds = (await db.all('meds')).sort((a, b) => (a.order || 0) - (b.order || 0));
  S.week = (await db.get('misc', 'week')) || { id: 'week', checks: {}, top3: [{ t: '', s: '', d: false }, { t: '', s: '', d: false }, { t: '', s: '', d: false }], notes: '' };
  S.chat = (await db.get('misc', 'chat')) || { id: 'chat', display: [] };
  await loadPage(todayKey());
  await loadWeekPages();
  await tidyTasks();
}

// Últimos 7 dias (hoje incluso), para o humor da semana e o resumo.
const lastDays = (n = 7) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return todayKey(d); });
const pageFor = k => (S.page && S.page.id === k ? S.page : S.weekPages[k]) || null;
async function loadWeekPages() {
  const out = {};
  for (const k of lastDays()) out[k] = k === S.page.id ? S.page : await db.get('pages', k);
  S.weekPages = out;
}

async function loadPage(key) {
  const p = await db.get('pages', key);
  S.page = p ? { ...newPage(key), ...p } : newPage(key);
  S.viewingPast = key !== todayKey();
}

function savePage() { S.page.updatedAt = Date.now(); return db.put('pages', S.page); }

function objFor(store, id) {
  switch (store) {
    case 'pages': return S.page;
    case 'settings': return S.settings;
    case 'misc': return S.week;
    case 'routines': return S.routines.find(r => r.id === id);
    case 'projects': return S.projects.find(r => r.id === id);
    case 'ideas': return S.ideas.find(r => r.id === id);
    case 'habits': return S.habits.find(r => r.id === id);
    case 'reminders': return S.reminders.find(r => r.id === id);
    case 'meds': return S.meds.find(r => r.id === id);
    case 'strategies': return S.strat[id] || (S.strat[id] = { id, fav: false, status: '', note: '' });
    default: return null;
  }
}

function persist(store, obj, now = false) {
  if (!obj) return;
  if (store === 'pages') obj.updatedAt = Date.now();
  const run = () => db.put(store, obj).catch(e => toast('Erro ao salvar: ' + e.message));
  if (now) return run();
  later(store + ':' + obj.id, run);
}

// ---------------- Agenda do celular ----------------
async function loadEvents() {
  if (S.calPerm !== 'granted') return;
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(start.getTime() + DAY);
    const weekEnd = new Date(start.getTime() + 8 * DAY);
    S.events = await N.eventsBetween(start, tomorrow);
    S.eventsWeek = await N.eventsBetween(tomorrow, weekEnd);
  } catch (e) {
    S.events = []; S.eventsWeek = [];
    toast('Não consegui ler a agenda: ' + (e.message || e));
  }
}

function focusGaps(events) {
  // Brechas de 45 min ou mais entre 8h e 18h, a partir de agora.
  const start = new Date(); start.setHours(8, 0, 0, 0);
  const end = new Date(); end.setHours(18, 0, 0, 0);
  let cursor = Math.max(start.getTime(), Date.now());
  const busy = (events || []).filter(e => !e.allDay).map(e => [e.start, e.end]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  for (const [s, e] of busy) {
    if (s - cursor >= 45 * 60000 && s <= end.getTime()) gaps.push([cursor, Math.min(s, end.getTime())]);
    cursor = Math.max(cursor, e);
  }
  if (end.getTime() - cursor >= 45 * 60000) gaps.push([cursor, end.getTime()]);
  return gaps.slice(0, 4);
}

// ---------------- Remédios e água ----------------
const followMin = () => (S.settings.doseFollowMin ?? 30);
const carryMin = () => (S.settings.carryMin ?? 60);
const KINDS = [['remedio', 'Remédio'], ['agua', 'Água'], ['outro', 'Outro']];

function dosesForDay() {
  const out = [];
  for (const m of S.meds) for (const t of (m.times || [])) {
    if (/^\d{2}:\d{2}$/.test(t)) out.push({ key: `${m.id}@${t}`, medId: m.id, name: m.name || 'Sem nome', kind: m.kind || 'remedio', time: t, carry: m.kind !== 'agua' && m.carry !== false });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}
function atTime(day, hhmm) { const [hr, mi] = hhmm.split(':').map(Number); const d = new Date(day); d.setHours(hr, mi, 0, 0); return d; }

// Compromissos (não de dia inteiro) que cobrem o horário de um remédio: de 15 min antes do início até o fim.
function carryPlan(events) {
  const doses = dosesForDay().filter(d => d.carry);
  const res = [];
  if (!doses.length) return res;
  for (const e of (events || [])) {
    if (e.allDay || !(e.end > e.start)) continue;
    const day0 = new Date(e.start); day0.setHours(0, 0, 0, 0);
    for (let d = new Date(day0); d.getTime() < e.end; d = new Date(d.getTime() + DAY)) {
      const items = doses.filter(x => { const t = atTime(d, x.time).getTime(); return t >= e.start - 15 * 60000 && t < e.end; });
      if (items.length) res.push({ event: e, dayKey: todayKey(d), items, notifyAt: new Date(e.start - carryMin() * 60000) });
    }
  }
  return res;
}

function doseRow(d) {
  const p = S.page; const taken = (p.doses || {})[d.key];
  const isToday = p.id === todayKey();
  const late = isToday && !taken && Date.now() > atTime(new Date(), d.time).getTime();
  const st = taken ? `tomado às ${hm(taken)}` : late ? (d.kind === 'agua' ? 'passou do horário' : 'ainda não marcado') : (d.carry && carryToday().has(d.key) ? 'levar junto' : '');
  return `<div class="dose-row ${taken ? 'done' : ''}"><span class="t">${d.time}</span><span class="nm">${h(d.name)}${st ? `<div class="small" style="font-weight:500;${late || st === 'levar junto' ? 'color:var(--warn)' : ''}">${st}</div>` : ''}</span><button class="circ ${taken ? 'on' : ''}" onclick="A.toggleDose('${d.key}')" aria-label="${taken ? 'Desmarcar' : 'Marcar'} ${h(d.name)} das ${d.time}">${taken ? svg('check', 16, 3) : ''}</button></div>`;
}
// Chaves das doses de hoje que caem dentro de um compromisso
function carryToday() {
  const out = new Set();
  for (const c of carryPlan(S.events)) if (c.dayKey === todayKey()) c.items.forEach(i => out.add(i.key));
  return out;
}

function dosesCard() {
  const doses = dosesForDay();
  if (!doses.length) {
    return `<div class="card"><h2>Remédios e água</h2><p class="hint">Cadastre os horários para receber lembretes, marcar quando tomar e ser avisado de levar o remédio quando tiver compromisso.</p><button onclick="A.tab('remedios')">Cadastrar horários</button></div>`;
  }
  const p = S.page; p.doses = p.doses || {};
  const done = doses.filter(d => p.doses[d.key]).length;
  const pending = doses.filter(d => !p.doses[d.key]).slice(0, 3);
  const rows = pending.map(doseRow).join('') || '<p class="hint" style="margin:0">Tudo marcado por hoje.</p>';
  return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Remédios e água</h2><span class="tag">${done}/${doses.length}</span></div><div class="mt">${rows}</div>
    <button class="ghost mini mt" onclick="A.tab('remedios')">Ver todos</button></div>`;
}

async function syncDoses() {
  if (!N.isNative()) return;
  const doses = dosesForDay();
  const today = todayKey();
  const tp = S.page.id === today ? S.page : ((await db.get('pages', today)) || {});
  const takenToday = (tp && tp.doses) || {};
  const daily = doses.map(d => {
    const [hour, minute] = d.time.split(':').map(Number);
    const title = d.kind === 'agua' ? `Água: ${d.name}` : `Hora de: ${d.name}`;
    const body = d.kind === 'agua' ? 'Beba agora e toque em Tomei.' : `Horário das ${d.time}. Toque em Tomei quando tomar.`;
    return { key: d.key, hour, minute, title, body, extra: { kind: 'dose', key: d.key, title, body } };
  });
  const once = [];
  const follow = followMin();
  if (follow > 0) {
    for (let i = 0; i < 7; i++) {
      const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + i);
      const dk = todayKey(day);
      for (const d of doses) {
        if (d.kind === 'agua' || (dk === today && takenToday[d.key])) continue;
        const title = `Ainda não marcou: ${d.name}`, body = `Era às ${d.time}. Já tomou? Toque em Tomei.`;
        once.push({ id: N.hashId(`fu:${d.key}:${dk}`), title, body, at: new Date(atTime(day, d.time).getTime() + follow * 60000), actions: true, extra: { kind: 'dose-followup', key: d.key, day: dk, title, body } });
      }
    }
  }
  for (const c of carryPlan([...(S.events || []), ...(S.eventsWeek || [])])) {
    once.push({ id: N.hashId(`carry:${c.event.id}:${c.dayKey}`), title: 'Leve o remédio', body: `${c.items.map(i => `${i.name} (${i.time})`).join(', ')}. Você vai estar em "${c.event.title}" às ${hm(c.event.start)}.`, at: c.notifyAt, extra: { kind: 'carry' } });
  }
  try { await N.syncDoseNotifications({ daily, once }); } catch (e) { toast('Erro ao agendar lembretes: ' + (e.message || e)); }
}

async function markDose(key, day, value) {
  const page = S.page.id === day ? S.page : { ...newPage(day), ...((await db.get('pages', day)) || {}) };
  page.doses = page.doses || {};
  if (value) page.doses[key] = Date.now(); else delete page.doses[key];
  page.updatedAt = Date.now();
  await db.put('pages', page);
  if (value) await N.cancelIds([N.hashId(`fu:${key}:${day}`)]);
  else await syncDoses();
}

async function onDoseAction(actionId, extra) {
  if (extra && extra.kind === 'fixo') {
    lastPinKey = null; // o Android tira a notificação ao tocar: postar de novo
    if (S.page.id !== todayKey()) await loadPage(todayKey());
    if (actionId === 'fixo_tomei' && extra.dose) { await markDose(extra.dose, todayKey(), true); toast('Marcado como tomado'); }
    else if (actionId === 'fixo_feito') await completeCurrent(extra);
    S.tab = 'hoje'; S.openRoutine = null; S.drawer = false; render(); return;
  }
  if (extra && String(extra.kind || '').startsWith('focus')) {
    if (S.focus && S.focus.phase === 'run' && focusLeft() <= 0) focusFinished();
    if (S.focus) { if (S.tab !== 'foco') { S.prevTab = S.tab; S.tab = 'foco'; } S.drawer = false; render(); }
    return;
  }
  if (extra && extra.key === 'resumo-semana') { S.tab = 'semana'; S.drawer = false; render(); return; }
  if (extra && extra.key && actionId === 'taken') { await markDose(extra.key, extra.day || todayKey(), true); toast('Marcado como tomado'); }
  else if (extra && extra.key && actionId === 'snooze') { await N.snoozeDose(extra, 15); toast('Aviso de novo em 15 min'); }
  if (S.page.id !== todayKey() && !S.viewingPast) await loadPage(todayKey());
  S.tab = 'hoje'; S.openRoutine = null; render();
}

function toolRemedios() {
  const list = S.meds.map(m => `<div class="top3"><div class="row"><div class="grow">${input('meds', m.id, 'name', m.name, 'Nome e dose, ex.: Remédio X 10 mg')}</div><button class="icon" onclick="A.removeMed('${m.id}')">×</button></div>
    <div class="pills mt">${KINDS.map(([k, l]) => `<button class="pill ${(m.kind || 'remedio') === k ? 'on' : ''}" onclick="A.setMedKind('${m.id}', '${k}')">${l}</button>`).join('')}</div>
    <div class="small mt">Horários</div>
    <div class="pills" style="margin-top:4px">${(m.times || []).map((t, i) => `<button class="pill on" onclick="A.removeTime('${m.id}', ${i})" title="Remover">${t} ×</button>`).join('') || '<span class="small">Nenhum horário ainda</span>'}</div>
    <div class="row mt"><input type="time" id="t-${m.id}" class="grow"><button class="mini" onclick="A.addTime('${m.id}')">+ horário</button></div>
    ${(m.kind || 'remedio') !== 'agua' ? toggle(m.carry !== false, 'Avisar para levar se eu tiver compromisso nesse horário', `A.toggleCarry('${m.id}')`) : ''}</div>`).join('');
  const body = S.settings.bodyChecks;
  const fromBody = body.length ? `<div class="card"><h2>Trazer do "Corpo em dia"</h2><p class="hint">Toque num item para virar um lembrete com horário. Ele sai da lista do Corpo em dia.</p>
    ${body.map((c, i) => `<div class="list-item"><div class="grow">${h(c)}</div><button class="mini ghost" onclick="A.bodyToMed(${i})">Trazer</button></div>`).join('')}</div>` : '';
  const opt = (v, cur, l) => `<option value="${v}" ${Number(cur) === v ? 'selected' : ''}>${l}</option>`;
  const exact = !N.isNative() ? '' : S.exact === 'granted'
    ? '<p class="small mt">Alarmes exatos: permitidos. Os avisos chegam na hora certa.</p>'
    : `<div class="alert mt">Para os avisos chegarem na hora exata, permita "Alarmes e lembretes" para este app.</div><button class="mt" style="width:100%" onclick="A.openExact()">Permitir alarmes exatos</button>`;
  return `<div class="card"><h2>Remédios e água</h2><p class="hint">Cada horário vira um aviso diário com o botão "Tomei". Se você não marcar, o app avisa de novo. Se tiver um compromisso no horário, avisa antes para você levar.</p>
    <div class="row"><input class="grow" type="text" id="medInput" placeholder="Novo item, ex.: Água ou Remédio X 10 mg" onkeydown="if(event.key==='Enter')A.addMed()"><button onclick="A.addMed()">+</button></div>
    <div class="mt">${list || '<p class="hint" style="margin:0">Nada cadastrado ainda.</p>'}</div></div>
  ${fromBody}
  <div class="card"><h2>Avisos</h2>
    <h3>Se eu não marcar "Tomei", avisar de novo</h3><select onchange="A.setDoseSetting('doseFollowMin', this.value)">${opt(0, followMin(), 'Não avisar de novo')}${opt(15, followMin(), '15 min depois')}${opt(30, followMin(), '30 min depois')}${opt(60, followMin(), '1 hora depois')}</select>
    <h3>Aviso de levar o remédio</h3><select onchange="A.setDoseSetting('carryMin', this.value)">${opt(30, carryMin(), '30 min antes do compromisso')}${opt(60, carryMin(), '1 hora antes do compromisso')}${opt(90, carryMin(), '1h30 antes do compromisso')}${opt(120, carryMin(), '2 horas antes do compromisso')}</select>
    <p class="small mt">O aviso de levar usa a agenda do celular dos próximos 7 dias e se atualiza toda vez que você abre o app.</p>
    ${exact}</div>`;
}

function scrRemedios() {
  const doses = dosesForDay();
  const plus = `<button class="iconbtn" style="background:var(--accent-soft);color:var(--accent);border-radius:22px" onclick="A.medAdd()" aria-label="Adicionar item">${svg('plus', 22, 2.2)}</button>`;
  if (!doses.length) return ['Remédios e água', 'Horários com aviso e botão Tomei', toolRemedios(), { right: plus }];
  const p = S.page; p.doses = p.doses || {}; const tk = p.doses;
  const isToday = p.id === todayKey();
  const n = doses.length, done = doses.filter(d => tk[d.key]).length;
  const agua = doses.filter(d => d.kind === 'agua'), rem = doses.filter(d => d.kind !== 'agua');
  const parts = [agua.length ? `Água ${agua.filter(d => tk[d.key]).length}/${agua.length}` : '', rem.length ? `Remédios ${rem.filter(d => tk[d.key]).length}/${rem.length}` : ''].filter(Boolean).join(' · ');
  const bar = n <= 16
    ? `<div class="segbar" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${doses.map(d => `<i class="${tk[d.key] ? 'on' : ''}"></i>`).join('')}</div>`
    : `<div class="segbar" style="grid-template-columns:1fr"><i style="background:linear-gradient(90deg,var(--accent) ${Math.round(100 * done / n)}%,var(--line2) 0)"></i></div>`;
  let hero = '';
  if (isToday) {
    const now = Date.now();
    const next = doses.find(d => !tk[d.key] && atTime(new Date(), d.time).getTime() > now - 2 * 3600000) || doses.find(d => !tk[d.key]);
    if (next) {
      const c = carryPlan(S.events).find(x => x.dayKey === todayKey() && x.items.some(i => i.key === next.key));
      const late = atTime(new Date(), next.time).getTime() < now;
      hero = `<div class="hero"><div class="row" style="align-items:flex-start"><div class="grow"><p class="eyebrow">${late ? 'Atrasado' : 'Próximo'} · ${next.time}</p><p class="bigname">${h(next.name)}</p></div>${c ? '<span class="tag warn">Levar junto</span>' : ''}</div>
        ${c ? `<p class="sub2 mt">Você vai estar em "${h(c.event.title)}" das ${hm(c.event.start)} às ${hm(c.event.end)}. O aviso de levar chega às ${hm(c.notifyAt.getTime())}.</p>` : ''}
        <div class="row mt" style="gap:10px"><button class="light" style="display:inline-flex;align-items:center;justify-content:center;gap:8px" onclick="A.toggleDose('${next.key}')">${svg('check', 18, 2.6)}Tomei</button><button class="outline" onclick="A.snoozeNow('${next.key}')">Lembrar em 15 min</button></div></div>`;
    } else hero = `<div class="hero"><p class="eyebrow">Hoje</p><p class="bigname">Tudo marcado por hoje.</p></div>`;
  }
  const hr = d => Number(d.time.slice(0, 2));
  const grp = (lbl, list) => list.length ? `<p class="eyebrow" style="margin:12px 0 2px">${lbl}</p>${list.map(doseRow).join('')}` : '';
  const list = grp('Manhã', doses.filter(d => hr(d) < 12)) + grp('Tarde', doses.filter(d => hr(d) >= 12 && hr(d) < 18)) + grp('Noite', doses.filter(d => hr(d) >= 18));
  const body = `<div class="card"><div class="row" style="align-items:baseline"><p class="grow" style="margin:0;font-size:26px;font-weight:800">${done} <span style="font-size:16px;font-weight:600;color:var(--muted)">de ${n} hoje</span></p><span class="small" style="font-weight:600">${parts}</span></div>${bar}</div>
    ${hero}
    <div class="card" style="padding-top:4px">${list}</div>
    <button class="ghost" style="width:100%;margin-bottom:12px" onclick="A.toggleMedEdit()">${S.medEdit ? 'Fechar edição' : 'Editar horários e avisos'}</button>
    ${S.medEdit ? toolRemedios() : ''}`;
  return ['Remédios e água', isToday ? 'Toque no círculo quando tomar' : `Página de ${fmtDateKey(p.id)}`, body, { right: plus }];
}

// ---------------- Próximo fixo na barra de notificações ----------------
// O que está em andamento nas 3 do dia: a primeira não feita, com o próximo passo da tarefa ligada.
function currentAction() {
  const p = S.page; if (!p) return null;
  const i = p.top3.findIndex(t => (t.t || '').trim() && !t.d);
  if (i < 0) return null;
  const t = p.top3[i];
  const task = t.task ? S.projects.find(x => x.id === t.task && !x.done) : null;
  const st = task ? nextStep(task) : null;
  return { top: i, title: t.t, step: st ? st.t : (t.s || ''), taskId: task ? task.id : null, stepIdx: st ? task.steps.indexOf(st) : null };
}
// Remédio: o primeiro não marcado de hoje. Água atrasada mais de 1 h sai da frente.
function pinnedDose() {
  const tk = (S.page && S.page.doses) || {};
  const now = Date.now();
  return dosesForDay().find(d => !tk[d.key] && !(d.kind === 'agua' && atTime(new Date(), d.time).getTime() < now - 3600000)) || null;
}
function pinnedPlan() {
  const st = S.settings;
  if (!st || st.pinOn === false || !S.page || S.page.id !== todayKey()) return null;
  const dose = pinnedDose();
  const cur = st.pinTasks === false ? null : currentAction();
  if (!dose && !cur) return null;
  const now = Date.now();
  const lines = [];
  let title, body, actionType;
  if (dose) {
    const late = atTime(new Date(), dose.time).getTime() < now;
    title = `${late ? 'Atrasado' : 'Próximo'}: ${dose.time} · ${dose.name}`;
    const c = dose.carry ? carryPlan(S.events).find(x => x.dayKey === todayKey() && x.items.some(i => i.key === dose.key)) : null;
    if (c) lines.push(`Leve junto: você vai estar em "${c.event.title}" às ${hm(c.event.start)}.`);
  }
  if (cur) {
    const curTxt = `${cur.title}${cur.step && cur.step !== cur.title ? ' — ' + cur.step : ''}`;
    if (dose) { body = `Agora: ${curTxt}`; lines.push(body); actionType = 'FIXO_DP'; }
    else { title = `Agora: ${cur.title}`; body = cur.step && cur.step !== cur.title ? `Passo: ${cur.step}` : 'Toque em Feito quando terminar.'; lines.push(body); actionType = 'FIXO_P'; }
  } else { body = lines[0] || 'Toque em Tomei quando tomar.'; actionType = 'FIXO_D'; if (!lines.length) lines.push(body); }
  const nextEv = (S.events || []).filter(e => !e.allDay && e.start > now).sort((a, b) => a.start - b.start)[0];
  if (nextEv) lines.push(`Agenda: ${hm(nextEv.start)} ${nextEv.title}`);
  const { done, total } = progressToday();
  if (total) lines.push(`Hoje: ${done} de ${total} feitos.`);
  return { title, body, big: lines.join('\n'), actionType, extra: { dose: dose ? dose.key : null, top: cur ? cur.top : null, taskId: cur ? cur.taskId : null, stepIdx: cur ? cur.stepIdx : null } };
}
let lastPinKey = null;
// force = postar de novo mesmo sem mudança (volta ao topo da lista e reaparece se foi tirada).
async function updatePinned(force = false) {
  if (!N.isNative()) return;
  const plan = pinnedPlan();
  const key = JSON.stringify(plan);
  if (!force && key === lastPinKey) return;
  lastPinKey = key;
  try { if (plan) await N.showPinned(plan); else await N.clearPinned(); } catch (e) { lastPinKey = null; }
}
// Botão "Feito" da notificação fixa: marca o passo da tarefa ou a prioridade.
async function completeCurrent(x) {
  const task = x.taskId ? S.projects.find(t => t.id === x.taskId) : null;
  if (task && x.stepIdx != null && task.steps[x.stepIdx]) {
    task.steps[x.stepIdx].d = true;
    let next = null;
    if (!nextStep(task)) next = await finishTask(task);
    else { await db.put('projects', task); await syncTopForTask(task); }
    toast(task.done ? `Tarefa concluída: ${task.title}${next ? '. ' + nextLabel(next) : ''}` : 'Passo feito');
  } else if (x.top != null && S.page.top3[x.top]) {
    S.page.top3[x.top].d = true; await savePage(); toast('Feito');
  }
}

// ---------------- Backup no Google Drive ----------------
const DRIVE_KEYS = ['driveUri', 'driveName', 'lastDriveBackup', 'driveError'];
const AUTO_BACKUP_MS = 6 * 3600000;

// Dados para backup, sem o que só vale neste aparelho (arquivo do Drive conectado).
async function backupPayload() {
  const data = await exportAll();
  data.appVersion = S.appVersion || VERSION;
  data.stores.settings = (data.stores.settings || []).map(o => { const c = { ...o }; DRIVE_KEYS.forEach(k => delete c[k]); return c; });
  return data;
}

async function driveBackup(silent = false) {
  if (!S.settings.driveUri || S.driveBusy) return false;
  S.driveBusy = true;
  try {
    const text = JSON.stringify(await backupPayload());
    await N.drive.write(S.settings.driveUri, text);
    const back = await N.drive.read(S.settings.driveUri).catch(() => null);
    if (back && back.data) {
      const parsed = JSON.parse(back.data);
      if (!parsed || parsed.app !== 'tdah-vida-real') throw new Error('o arquivo gravado não confere');
    }
    S.settings.lastDriveBackup = Date.now(); S.settings.lastBackup = Date.now(); S.settings.driveError = null;
    await db.put('settings', S.settings);
    if (!silent) toast('Backup salvo no Google Drive');
    return true;
  } catch (e) {
    S.settings.driveError = String(e.message || e);
    await db.put('settings', S.settings);
    if (!silent) toast('Backup no Drive falhou: ' + S.settings.driveError);
    return false;
  } finally { S.driveBusy = false; }
}

function maybeAutoBackup(maxAge = AUTO_BACKUP_MS) {
  if (!N.isNative() || !S.settings.driveUri) return;
  if (Date.now() - (S.settings.lastDriveBackup || 0) < maxAge) return;
  driveBackup(true).then(() => { if (S.tab === 'ajustes' || S.tab === 'hoje') render(); });
}

function driveCard() {
  const s = S.settings;
  if (!N.isNative()) return `<div class="card"><h2>Backup no Google Drive</h2><p class="hint" style="margin:0">Disponível no app Android.</p></div>`;
  const when = s.lastDriveBackup ? new Date(s.lastDriveBackup).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ainda não';
  if (!s.driveUri) {
    return `<div class="card"><h2>Backup no Google Drive</h2>
      <p class="hint">Conecte um arquivo no seu Google Drive. O app grava o backup nele sozinho, enquanto você usa, e você restaura se reinstalar ou trocar de celular.</p>
      <ol class="small" style="padding-left:18px;margin:0 0 10px"><li>Toque em Conectar Google Drive.</li><li>Na tela que abrir, toque no menu ☰ e escolha <b>Drive</b> (a sua conta).</li><li>Escolha a pasta e toque em <b>Salvar</b>.</li></ol>
      <button style="width:100%" onclick="A.connectDrive()" ${S.driveBusy ? 'disabled' : ''}>Conectar Google Drive</button>
      <button class="ghost mt" style="width:100%" onclick="A.restoreDrive()">Restaurar do Google Drive</button></div>`;
  }
  return `<div class="card"><h2>Backup no Google Drive</h2>
    <p style="margin:0 0 6px">Conectado: <b>${h(s.driveName || 'arquivo do Drive')}</b></p>
    <p class="hint">Último backup: ${when}. O app grava sozinho a cada 6 horas de uso.</p>
    ${s.driveError ? `<div class="alert" style="margin-bottom:10px">O último backup falhou: ${h(s.driveError)}. Tente de novo ou conecte o arquivo outra vez.</div>` : ''}
    <button style="width:100%" onclick="A.backupNow()" ${S.driveBusy ? 'disabled' : ''}>Fazer backup agora</button>
    <div class="row mt"><button class="ghost grow" onclick="A.connectDrive()">Trocar arquivo</button><button class="ghost grow" onclick="A.disconnectDrive()">Desconectar</button></div>
    <button class="ghost mt" style="width:100%" onclick="A.restoreDrive()">Restaurar do Google Drive</button></div>`;
}

// ---------------- Notificações ----------------
async function syncNotifications() {
  if (!N.isNative()) return;
  S.notif = await N.notificationsAllowed(false);
  if (!S.notif) return;
  await N.syncRoutineReminders(S.routines);
  for (const r of S.reminders) {
    if (!r.done && r.at) await N.scheduleOnce(r.id, 'Lembrete', r.title, new Date(r.at));
    else await N.cancelOnce(r.id);
  }
  await syncDoses();
  await scheduleWeekNotif();
}

// ---------------- Componentes ----------------
function check(on, label, action, sub = '') {
  return `<div class="check ${on ? 'on' : ''}" onclick="${action}"><div class="box"></div><div class="grow"><div class="lbl">${label}</div>${sub ? `<div class="small">${sub}</div>` : ''}</div></div>`;
}
// Opção liga/desliga (sem riscar o texto quando marcada)
function toggle(on, label, action, sub = '') { return check(on, label, action, sub).replace('class="check ', 'class="check toggle '); }
const fieldAttr = (store, id, path) => `oninput="A.field('${store}', ${typeof id === 'number' ? id : `'${id}'`}, '${path}', this.value)"`;
function input(store, id, path, value, ph = '') {
  return `<input type="text" value="${h(value)}" placeholder="${h(ph)}" ${fieldAttr(store, id, path)}>`;
}
function area(store, id, path, value, ph = '', rows = 3) {
  return `<textarea rows="${rows}" placeholder="${h(ph)}" ${fieldAttr(store, id, path)}>${h(value)}</textarea>`;
}

const MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-3px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const ICONS = {
  hoje: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  remedios: '<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  rotinas: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>',
  guia: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  assistente: '<path d="M12 3l1.8 4.6L18.5 9.4l-4.7 1.8L12 16l-1.8-4.8L5.5 9.4l4.7-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  foco: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/>',
  semana: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tarefas: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  ideias: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  habitos: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M15 17.5l2 2 4-4"/>',
  lembretes: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9.5 15.5l2 2 3.5-4"/>',
  kit: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4l-5.2 2.8 1-5.9L3.5 9.2l5.9-.8z"/>',
  menu: '<path d="M4 7h16M4 12h10M4 17h16"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  dump: '<path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
};
const svg = (k, size = 22, sw = 2) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

function nav() {
  const b = (k, l) => `<button class="${S.tab === k ? 'on' : ''}" onclick="A.tab('${k}')"><span class="icw">${svg(k)}</span>${l}</button>`;
  return `<nav class="tabs">${b('hoje', 'Hoje')}${b('remedios', 'Remédios')}<button class="fab" onclick="A.fab()" aria-label="Falar com o assistente">${svg('mic', 26)}</button>${b('rotinas', 'Rotinas')}${b('guia', 'Guia')}</nav>`;
}

function sinceLabel(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return min <= 1 ? 'agora' : `há ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const d = Math.round(hr / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

function backupLine() {
  const s = S.settings;
  if (s.driveUri && s.driveError) return 'Backup no Drive falhou';
  if (s.driveUri && s.lastDriveBackup) return `Backup no Drive ${sinceLabel(s.lastDriveBackup)}`;
  if (s.lastBackup) return `Último backup ${sinceLabel(s.lastBackup)}`;
  return 'Sem backup ainda';
}

function drawer() {
  if (!S.drawer) return '';
  const s = S.settings;
  const dz = dosesForDay(); const tk = (S.page.id === todayKey() && S.page.doses) || {};
  const remToday = S.reminders.filter(r => !r.done && r.at && dueLabel(r.at).startsWith('hoje')).length;
  const ideas = S.ideas.filter(i => !i.done).length;
  const favs = Object.values(S.strat).filter(x => x.fav).length;
  const openProj = activeTasks().length;
  const focusCnt = S.focus && ['run', 'paused'].includes(S.focus.phase) ? fmtClock(focusLeft()) : '';
  const item = (k, label, cnt = '', act = null) => `<button class="item ${S.tab === k ? 'on' : ''}" onclick="${act || `A.tab('${k}')`}">${svg(k)}<span>${label}</span>${cnt !== '' && cnt !== 0 ? `<span class="cnt">${cnt}</span>` : ''}</button>`;
  return `<div class="scrim" onclick="A.menu(false)"></div><nav class="drawer" aria-label="Menu">
    <div class="who"><div class="avatar">${h((s.name || '?').trim().charAt(0).toUpperCase())}</div><div class="grow"><div style="font-weight:800;font-size:16px">${h(s.name || 'Bem-vindo')}</div><div class="small">${backupLine()}</div></div></div>
    <p class="grp">Dia a dia</p>
    ${item('hoje', 'Hoje')}${item('remedios', 'Remédios e água', dz.length ? `${dz.filter(d => tk[d.key]).length}/${dz.length}` : '')}${item('rotinas', 'Rotinas')}${item('assistente', 'Assistente', '', 'A.openAssistant()')}${item('foco', 'Bloco de foco', focusCnt)}
    <p class="grp">Organizar</p>
    ${item('semana', 'Semana')}${item('tarefas', 'Prioridades', openProj)}${item('ideias', 'Ideias', ideas)}${item('habitos', 'Hábitos')}${item('lembretes', 'Lembretes', remToday ? `${remToday} hoje` : '')}
    <p class="grp">Juntos e aprender</p>
    ${item('agenda', 'Agenda da casa')}${item('guia', 'Guia · 100 estratégias', '', 'A.openGuide()')}${item('kit', 'Meu kit', favs, "A.openKit()")}
    <div class="foot">${item('ajustes', 'Ajustes')}<p class="small" style="margin:6px 14px 0">versão ${h(S.appVersion || VERSION)}</p></div>
  </nav>`;
}

// ---------------- Tela: Hoje ----------------
function welcomeCard() {
  return `<div class="card"><h2>Bem-vindo</h2><p class="hint">Como você quer ser chamado? Se já tem um arquivo de perfil ou backup, importe e o app fica pronto.</p>
  <div class="row"><input class="grow" type="text" id="nameInput" placeholder="Seu nome"><button onclick="A.saveName()">Salvar</button></div>
  <button class="ghost mt" onclick="A.pickImport('merge')">Importar perfil ou backup</button>
  <button class="ghost mt" onclick="A.startOnboarding()">Configuração guiada</button></div>`;
}

function backupNudge() {
  if (S.settings.driveUri && S.settings.driveError) {
    return `<div class="card row"><div class="grow small">O backup no Google Drive falhou.</div><button class="mini" onclick="A.tab('ajustes')">Resolver</button></div>`;
  }
  const last = S.settings.lastBackup;
  const hasData = S.settings.name || S.logs.length || S.ideas.length;
  if (!hasData) return '';
  const days = last ? Math.floor((Date.now() - last) / DAY) : null;
  if (days !== null && days < 14) return '';
  return `<div class="card row"><div class="grow small">${days === null ? 'Você ainda não fez backup dos dados.' : `Último backup há ${days} dias.`}</div><button class="mini" onclick="A.exportData()">Fazer backup</button></div>`;
}

function agendaCard() {
  if (!N.isNative()) return `<div class="card"><h2>Agenda de hoje</h2><p class="hint" style="margin:0">A agenda do celular aparece aqui no app Android.</p></div>`;
  if (S.calPerm !== 'granted') {
    return `<div class="card"><h2>Agenda de hoje</h2><p class="hint">Conecte a agenda do celular para ver aqui seus compromissos pessoais e do trabalho, de todas as contas sincronizadas no aparelho.</p><button onclick="A.connectCalendar()">Conectar agenda</button></div>`;
  }
  const ev = S.events || [];
  const house = S.settings.houseCalendarId;
  const casaTag = e => (house && e.calendarId === house) ? ' <span class="tag">Casa</span>' : '';
  const list = ev.length
    ? ev.map(e => `<div class="ev"><div class="t">${e.allDay ? 'dia' : hm(e.start)}</div>${e.color ? `<div class="dot" style="background:${h(e.color)}"></div>` : ''}<div class="grow">${h(e.title)}${casaTag(e)}${e.location ? `<div class="small">${h(e.location)}</div>` : ''}</div></div>`).join('')
    : '<p class="hint" style="margin:0">Nada na agenda hoje.</p>';
  const houseHtml = !house
    ? `<button class="ghost mini mt" onclick="A.tab('ajustes')">Configurar agenda da casa</button>`
    : S.houseForm ? houseFormHtml()
    : `<button class="ghost mini mt" onclick="A.openHouseForm()">+ Compromisso da casa</button>`;
  const gaps = focusGaps(ev);
  const gapsHtml = gaps.length ? `<h3>Brechas para foco</h3><div class="pills">${gaps.map(([a, b]) => `<span class="tag">${hm(a)}–${hm(b)}</span>`).join('')}</div>` : '';
  const wk = S.eventsWeek || [];
  let weekHtml = '';
  if (wk.length) {
    const byDay = {};
    for (const e of wk) { const k = todayKey(new Date(e.start)); (byDay[k] = byDay[k] || []).push(e); }
    const hk = S.settings.houseCalendarId;
    weekHtml = `<details class="mt"><summary style="font-size:15px">Próximos 7 dias (${wk.length})</summary>${Object.keys(byDay).sort().map(k => `<h3>${cap(fmtDateKey(k))}</h3>${byDay[k].map(e => `<div class="ev"><div class="t">${e.allDay ? 'dia' : hm(e.start)}</div><div class="grow">${h(e.title)}${hk && e.calendarId === hk ? ' <span class="tag">Casa</span>' : ''}</div></div>`).join('')}`).join('')}</details>`;
  }
  return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Agenda de hoje</h2><button class="icon" onclick="A.refreshEvents()" title="Atualizar">⟳</button></div><div class="mt">${list}</div>${gapsHtml}${weekHtml}${houseHtml}</div>`;
}

function houseFormHtml() {
  const d = new Date(Date.now() + 60 * 60000); d.setMinutes(0, 0, 0);
  const local = `${todayKey(d)}T${pad(d.getHours())}:00`;
  return `<div class="top3 mt"><h3 style="margin-top:0">Compromisso da casa</h3><p class="small" style="margin-top:0">Vai para "${h(S.settings.houseCalendarTitle || 'Agenda da casa')}" e aparece no celular de quem compartilha a agenda.</p>
    <div class="stack"><input type="text" id="hTitle" placeholder="O quê, ex.: reunião da escola"><input type="datetime-local" id="hStart" value="${local}">
    <select id="hDur">${[[30, '30 min'], [60, '1 hora'], [90, '1h30'], [120, '2 horas'], [180, '3 horas']].map(([v, l]) => `<option value="${v}" ${v === 60 ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input type="text" id="hLoc" placeholder="Local (opcional)"></div>
    <div class="row mt"><button class="ghost" onclick="A.closeHouseForm()">Cancelar</button><div class="grow"></div><button onclick="A.saveHouseEvent()">Salvar na agenda</button></div></div>`;
}

async function createHouseEvent({ title, start, durMin = 60, location = '' }) {
  if (!S.settings.houseCalendarId) throw new Error('Agenda da casa não configurada. Escolha em Ajustes.');
  if (!(start instanceof Date) || isNaN(start)) throw new Error('Data e hora inválidas.');
  const end = new Date(start.getTime() + (Number(durMin) || 60) * 60000);
  await N.createCalendarEvent({ calendarId: S.settings.houseCalendarId, title, start, end, location, description: `Criado no app TDAH na Vida Real por ${S.settings.name || 'alguém da casa'}.`, alertMin: 30 });
  await loadEvents(); await syncDoses();
  return `Compromisso criado na agenda da casa: ${title} (${start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} às ${hm(start.getTime())}).`;
}

function dueLabel(at) {
  if (!at) return 'sem data';
  const d = new Date(at); if (isNaN(d)) return h(at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that - today) / DAY);
  const time = (d.getHours() || d.getMinutes()) ? ' ' + hm(d) : '';
  if (diff === 0) return 'hoje' + time;
  if (diff === 1) return 'amanhã' + time;
  if (diff > 1 && diff < 7) return `em ${diff} dias`;
  if (diff < 0) return 'já passou';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + time;
}

function sortedReminders() {
  return [...S.reminders].sort((a, b) => (a.done - b.done) || ((a.at ? new Date(a.at).getTime() : 9e15) - (b.at ? new Date(b.at).getTime() : 9e15)));
}

function remindersCard() {
  const soon = sortedReminders().filter(r => !r.done && (!r.at || new Date(r.at).getTime() < Date.now() + 14 * DAY)).slice(0, 5);
  if (!soon.length) return '';
  return `<div class="card"><h2>Lembretes</h2>${soon.map(r => check(false, h(r.title), `A.toggleReminder('${r.id}')`, dueLabel(r.at) + (r.note ? ' · ' + h(r.note) : ''))).join('')}
  <button class="ghost mini mt" onclick="A.goTool('lembretes')">Ver todos</button></div>`;
}

function progressToday() {
  const p = S.page;
  const tops = p.top3.filter(t => (t.t || '').trim());
  const dz = dosesForDay(); const tk = p.doses || {};
  const body = S.settings.bodyChecks;
  const total = tops.length + dz.length + body.length;
  const done = tops.filter(t => t.d).length + dz.filter(d => tk[d.key]).length + body.filter(c => p.body[c]).length;
  return { done, total };
}
function nextUp() {
  const p = S.page; const tk = p.doses || {};
  const now = new Date();
  const d = dosesForDay().find(x => !tk[x.key] && atTime(now, x.time).getTime() > Date.now() - 2 * 3600000);
  if (d) return `${d.time} · ${d.name}`;
  const t = p.top3.find(x => (x.t || '').trim() && !x.d);
  return t ? t.t : '';
}
function ringSvg(done, total, size = 64, stroke = 7, color = 'var(--hero-chip)', track = 'rgba(255,255,255,.2)') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = total ? Math.min(1, done / total) : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function heroCard() {
  const { done, total } = progressToday();
  const nx = S.viewingPast ? '' : nextUp();
  return `<div class="hero"><div class="row" style="gap:14px"><div style="position:relative;width:64px;height:64px;flex:none">${ringSvg(done, total)}<div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:800;font-size:15px">${done}/${total}</div></div>
    <div class="grow"><p class="eyebrow">${S.page.bad ? 'Dia ruim · só o mínimo' : 'Seu dia'}</p><p style="margin:2px 0 0;font-size:17px;font-weight:800">${total ? `${done} de ${total} feitos` : 'Comece pelas 3 do dia'}</p>${nx ? `<p class="sub2">Próximo: ${h(nx)}</p>` : ''}</div></div></div>`;
}
function carryAlerts() {
  if (S.page.id !== todayKey()) return '';
  const now = Date.now();
  return carryPlan(S.events).filter(c => c.dayKey === S.page.id && c.event.end > now).map(c => `<div class="alert" style="margin-bottom:12px"><b>Leve com você:</b> ${c.items.map(i => `${h(i.name)} (${i.time})`).join(', ')}. Você vai estar em "${h(c.event.title)}" das ${hm(c.event.start)} às ${hm(c.event.end)}.</div>`).join('');
}
function quickActions() {
  const q = (icon, label, act, warm = false) => `<button onclick="${act}"><span class="qi ${warm ? 'warm' : ''}">${svg(icon)}</span>${label}</button>`;
  const bad = S.page.bad;
  return `<div class="quick">${q('dump', 'Descarregar', 'A.quickDump()')}${q('foco', 'Foco 25', 'A.focusStart(25)')}${bad ? q('hoje', 'Dia normal', 'A.setBad(false)') : q('cloud', 'Dia ruim', 'A.setBad(true)', true)}${q('plus', 'Anotar', 'A.newTask()')}</div>`;
}
function top3Card() {
  const p = S.page, id = p.id;
  const top = p.top3.map((t, i) => `<div class="top3 ${t.d ? 'done' : ''}"><div class="row"><div class="num">${i + 1}</div><div class="grow">${input('pages', id, `top3.${i}.t`, t.t, 'Prioridade')}</div><button class="circ ${t.d ? 'on' : ''}" onclick="A.toggleTop(${i})" aria-label="Feito">${t.d ? svg('check', 16, 3) : ''}</button></div>
    <div class="row mt"><div class="grow">${input('pages', id, `top3.${i}.s`, t.s, 'Primeiro passo físico')}</div>${t.task && S.projects.some(x => x.id === t.task) ? `<button class="ghost mini" onclick="A.openProject('${t.task}')" aria-label="Abrir a tarefa">${svg('tarefas', 16)}</button>` : ''}${(t.t || '').trim() && !t.d && !S.viewingPast ? `<button class="ghost mini" onclick="A.focusStart(25, ${i})" aria-label="Focar nesta">${svg('foco', 18)}</button>` : ''}</div></div>`).join('');
  const empty = !p.top3.some(t => (t.t || '').trim());
  const sug = empty && !S.viewingPast && S.settings.prioSuggest !== false ? suggestThree() : [];
  return `<div class="card"><div class="row"><h2 class="grow" style="margin:0">As 3 do dia</h2>${S.viewingPast ? '' : `<button class="ghost mini" onclick="A.tab('tarefas')">Matriz</button>`}</div><p class="hint mt">Só três. Se der tempo, você pega mais depois.</p>${sug.length ? `<button style="width:100%;margin-bottom:10px" onclick="A.useThree()">Puxar ${sug.length} da matriz</button>` : ''}${top}</div>`;
}
function restOfDay() {
  const p = S.page, id = p.id;
  const energy = ['baixa', 'média', 'alta'].map(e => `<button class="pill ${p.energy === e ? 'on' : ''}" onclick="A.setEnergy('${e}')">${e}</button>`).join('');
  const body = S.settings.bodyChecks.map((c, i) => check(!!p.body[c], h(c), `A.toggleBody(${i})`)).join('');
  const done = (p.done || []).map((d, i) => `<div class="list-item"><div class="grow">${h(d)}</div><button class="icon" onclick="A.removeDone(${i})">×</button></div>`).join('');
  return `
  <div class="card" id="dumpCard"><div class="row"><h2 class="grow" style="margin:0">Descarrego mental</h2><button class="ghost mini" onclick="A.voiceDump()">${MIC} Falar</button></div><p class="hint mt">Tudo que está rodando na cabeça, sem ordem e sem filtro.</p><textarea id="dumpArea" rows="5" placeholder="Joga tudo aqui…" ${fieldAttr('pages', id, 'dump')}>${h(p.dump)}</textarea>${hasAI() && !S.viewingPast ? `<button class="ghost mini mt" onclick="A.organizeDump()">${svg('assistente', 16)} Organizar com a IA</button>` : ''}</div>
  ${S.settings.moodOn === false || S.viewingPast ? `<div class="card"><h2>Energia agora</h2><div class="pills">${energy}</div></div>` : ''}
  <div class="card"><h2>Meu dia em blocos</h2><p class="hint">Sem horário exato, só onde cada coisa cabe.</p>
    <div class="stack"><div><div class="small">Manhã</div>${area('pages', id, 'blocks.manha', p.blocks.manha, '', 2)}</div>
    <div><div class="small">Tarde</div>${area('pages', id, 'blocks.tarde', p.blocks.tarde, '', 2)}</div>
    <div><div class="small">Noite</div>${area('pages', id, 'blocks.noite', p.blocks.noite, '', 2)}</div></div></div>
  <div class="card"><h2>Corpo em dia</h2>${body || '<p class="hint">Edite esta lista em Ajustes.</p>'}</div>
  <div class="card"><h2>Feito hoje</h2><p class="hint">Vale tudo, até o que não estava na lista.</p>${done}
    <div class="row mt"><input class="grow" type="text" id="doneInput" placeholder="O que eu fiz" onkeydown="if(event.key==='Enter')A.addDone()"><button onclick="A.addDone()" aria-label="Adicionar">+</button></div></div>
  <div class="card"><h2>Uma coisa boa de hoje</h2>${input('pages', id, 'good', p.good, '')}</div>`;
}

// ---------------- Humor em 1 toque ----------------
function moodWeek(size = 22) {
  return `<div class="moodweek">${lastDays().map(k => { const pg = pageFor(k); const m = pg && pg.mood; const d = keyToDate(k); return `<div class="${k === todayKey() ? 'today' : ''}" title="${h(moodOf(m) ? moodOf(m)[1] : 'sem registro')}">${m ? face(m, size) : '<i class="mdot"></i>'}<small>${'DSTQQSS'[d.getDay()]}</small></div>`; }).join('')}</div>`;
}
function moodBlock() {
  const p = S.page;
  if (!p.mood) return `<div class="card mood"><h2>Como você está agora?</h2><p class="hint">Um toque. Em troca, a frase do dia.</p><div class="moods">${MOODS.map(([k, l]) => `<button onclick="A.setMood('${k}')">${face(k, 40)}<span>${l}</span></button>`).join('')}</div></div>`;
  const m = moodOf(p.mood) || MOODS[1];
  const low = lastDays().filter(k => (pageFor(k) || {}).mood === 'pra-baixo').length;
  const energy = ['baixa', 'média', 'alta'].map(e => `<button class="pill ${p.energy === e ? 'on' : ''}" onclick="A.setEnergy('${e}')">${e}</button>`).join('');
  return `<div class="card mood"><div class="row">${face(p.mood, 40)}<div class="grow"><p class="eyebrow">Agora</p><p style="margin:1px 0 0;font-size:17px;font-weight:800">${m[1]}</p></div><button class="ghost mini" onclick="A.moodReset()">Mudar</button></div>
    <div class="fortune ${S.moodJust ? 'pop' : ''}"><p class="eyebrow">Frase do dia</p><p>${h(phraseOfDay(p.mood, p.id))}</p></div>
    <div class="row mt" style="gap:10px;align-items:center"><span class="small" style="font-weight:700">Energia</span><div class="pills grow" style="flex-wrap:nowrap">${energy}</div></div>
    <p class="eyebrow" style="margin-top:14px">Sua semana</p>${moodWeek()}
    ${low >= 3 ? '<div class="alert mt">Vários dias pra baixo nesta semana. Vale contar para alguém de confiança ou para quem te acompanha. Se pesar demais: CVV 188, de graça, a qualquer hora.</div>' : ''}</div>`;
}

// ---------------- Resumo da semana ----------------
function weekStats() {
  const days = lastDays(); const start = keyToDate(days[0]).getTime();
  const doneTasks = S.projects.filter(t => t.done && !t.skipped && (t.doneAt || 0) >= start);
  let top = 0, topT = 0, doses = 0, used = 0, feitos = 0, moods = 0;
  const score = {};
  for (const k of days) {
    const pg = pageFor(k); if (!pg) continue; used++;
    const tt = (pg.top3 || []).filter(t => (t.t || '').trim());
    topT += tt.length; top += tt.filter(t => t.d).length;
    doses += Object.values(pg.doses || {}).filter(Boolean).length;
    feitos += (pg.done || []).length; if (pg.mood) moods++;
    score[k] = tt.filter(t => t.d).length + (pg.done || []).length;
  }
  for (const t of doneTasks) { const k = todayKey(new Date(t.doneAt)); score[k] = (score[k] || 0) + 1; }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  const perDay = dosesForDay().length;
  return { days, doneTasks, top, topT, doses, dosePct: perDay && used ? Math.min(100, Math.round(100 * doses / (perDay * used))) : null, feitos, moods, best: best && best[1] > 0 ? best[0] : null };
}
const weekId = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 7) % 7)); return todayKey(d); }; // domingo da semana
function showWeekOnHoje() {
  if (S.settings.weekSummary === false) return false;
  const d = new Date(), wd = d.getDay(), hr = d.getHours();
  const id = wd === 1 ? todayKey(new Date(Date.now() - DAY)) : weekId();
  return ((wd === 0 && hr >= 17) || (wd === 1 && hr < 12)) && S.settings.weekSeen !== id;
}
function weekSummaryCard(onHoje = false) {
  const st = weekStats();
  const a = keyToDate(st.days[0]), z = keyToDate(st.days[6]);
  const f = d => d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'numeric' }).replace('.', '');
  const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const best = st.best ? keyToDate(st.best).toLocaleDateString('pt-BR', { weekday: 'long' }) : '';
  return `<div class="card weekcard"><div class="row"><h2 class="grow" style="margin:0">Sua semana</h2>${onHoje ? '<button class="icon" onclick="A.weekDismiss()" aria-label="Fechar">×</button>' : ''}</div>
    <p class="hint mt">Últimos 7 dias, de ${f(a)} a ${f(z)}.</p>
    <div class="stats">${tile(st.doneTasks.length, st.doneTasks.length === 1 ? 'tarefa concluída' : 'tarefas concluídas')}${tile(st.topT ? `${st.top}/${st.topT}` : '0', 'das 3 do dia')}${st.dosePct !== null ? tile(st.dosePct + '%', 'remédios e água') : tile(st.doses, 'horários marcados')}${tile(st.feitos, 'no Feito hoje')}</div>
    ${st.moods ? `<p class="eyebrow" style="margin-top:14px">Humor</p>${moodWeek()}` : ''}
    ${best ? `<p class="small mt" style="margin-bottom:0">Dia que mais rendeu: <b>${best}</b>.</p>` : ''}
    ${st.doneTasks.length ? `<details class="mt"><summary style="font-size:14px">O que você concluiu (${st.doneTasks.length})</summary><div class="mt">${st.doneTasks.slice(0, 12).map(t => `<div class="small" style="padding:3px 0">${cdot(taskCat(t))}${h(t.title)}</div>`).join('')}</div></details>` : ''}
    ${hasAI() ? `<button class="${onHoje ? 'light' : 'ghost'} mt" style="width:100%" onclick="A.askWeek()">${svg('assistente', 16)} Resumo com a IA</button>` : ''}
    ${onHoje ? `<button class="ghost mini mt" onclick="A.tab('semana')">Abrir a revisão da semana</button>` : ''}</div>`;
}
async function scheduleWeekNotif() {
  if (!N.isNative()) return;
  if (S.settings.weekSummary === false) return N.cancelOnce('resumo-semana');
  const at = new Date(); at.setHours(19, 0, 0, 0); at.setDate(at.getDate() + ((7 - at.getDay()) % 7));
  if (at <= new Date()) at.setDate(at.getDate() + 7);
  await N.scheduleOnce('resumo-semana', 'Sua semana', 'O resumo da semana está pronto. Toque para ver.', at);
}

function badDay() {
  const p = S.page, id = p.id;
  return `<div class="card"><h2>Dia ruim</h2><p class="hint">Hoje o objetivo é só atravessar o dia. Marcou estas cinco, o dia está cumprido.</p>
  ${BAD_DAY_CHECKS.map((c, i) => check(!!p.badChecks[i], h(c), `A.toggleBadCheck(${i})`)).join('')}
  <h3>A tarefa de hoje foi</h3>${input('pages', id, 'badTask', p.badTask, '')}
  <h3>O que eu preciso amanhã para o dia ser um pouco melhor</h3>${input('pages', id, 'badTomorrow', p.badTomorrow, 'Dormir cedo, pedir ajuda, adiar algo…')}
  <div class="alert mt">Se os dias ruins viram semanas, ou aparecem pensamentos de se machucar, procure ajuda. CVV: 188, gratuito e 24 horas. Emergência: SAMU 192.</div></div>`;
}

function pastPages() {
  if (S.pastList === null) return `<button class="ghost" style="width:100%" onclick="A.loadPast()">Páginas anteriores</button>`;
  const items = S.pastList.filter(k => k !== S.page.id);
  return `<div class="card"><h2>Páginas anteriores</h2>${items.length ? items.map(k => `<div class="list-item"><div class="grow">${cap(fmtDateKey(k))}</div><button class="mini ghost" onclick="A.openPage('${k}')">Abrir</button></div>`).join('') : '<p class="hint" style="margin:0">Nenhuma ainda. Dia em branco é só um dia em branco.</p>'}</div>`;
}

function scrHoje() {
  const p = S.page;
  const title = greeting() + (S.settings.name ? `, ${h(S.settings.name)}` : '');
  const sub = S.viewingPast ? `Página de ${fmtDateKey(p.id)}` : cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  let b = '';
  if (!S.settings.name && !S.viewingPast) b += welcomeCard();
  if (S.viewingPast) b += `<div class="card row"><div class="grow small">Você está vendo uma página anterior.</div><button class="mini" onclick="A.openPage('${todayKey()}')">Voltar para hoje</button></div>`;
  b += backupNudge();
  b += heroCard();
  if (!S.viewingPast) b += carryAlerts() + quickActions();
  if (!S.viewingPast && showWeekOnHoje()) b += weekSummaryCard(true);
  if (!S.viewingPast && S.settings.moodOn !== false) b += moodBlock();
  b += p.bad ? badDay() : top3Card();
  if (!S.viewingPast) b += agendaCard();
  b += dosesCard();
  if (!S.viewingPast) b += remindersCard();
  if (!p.bad) b += restOfDay();
  b += pastPages();
  const s = S.settings;
  const right = s.driveUri ? `<button class="chip ${s.driveError ? 'warn' : ''}" onclick="A.tab('ajustes')">${svg('cloud', 14, 2.2)}${s.driveError ? 'Backup falhou' : 'Backup ok'}</button>` : '';
  return [title, sub, b, { right }];
}

// ---------------- Tela: Rotinas ----------------
function runOf(r) {
  const k = todayKey();
  if (!r.run || r.run.date !== k) r.run = { date: k, checks: [], minimal: false };
  return r.run;
}
function timesLast7(rid) {
  const since = Date.now() - 7 * DAY;
  return S.logs.filter(l => l.routineId === rid && l.at >= since).length;
}

function scrRotinas() {
  if (S.openRoutine) return routineDetail(S.routines.find(r => r.id === S.openRoutine));
  const cards = S.routines.map(r => {
    const run = runOf(r);
    const done = run.checks.filter(Boolean).length;
    const n = timesLast7(r.id);
    return `<div class="card" onclick="A.openRoutine('${r.id}')" style="cursor:pointer"><div class="row"><div class="grow"><h2 style="margin:0">${h(r.title)}</h2><div class="small">${h(r.when)} · ${h(r.duration)}${r.notifyTime ? ` · lembrete ${r.notifyWeekday ? WEEKDAYS[r.notifyWeekday - 1].slice(0, 3).toLowerCase() + ' ' : ''}${h(r.notifyTime)}` : ''}</div></div><span class="tag">${done}/${r.steps.length}</span></div>
    <div class="small mt">${n ? `Feita ${n} ${n === 1 ? 'vez' : 'vezes'} nos últimos 7 dias` : 'Comece por uma só. Sem cobrança.'}</div></div>`;
  }).join('');
  return ['Rotinas', 'Sete rotinas prontas. Escolha uma e comece hoje.', cards];
}

function timerCard(r) {
  const f = S.focus;
  if (f && ['run', 'paused'].includes(f.phase)) return `<div class="card"><h2>Timer</h2><p class="hint">Bloco de foco em andamento: ${fmtClock(focusLeft())} restantes.</p><button style="width:100%" onclick="A.tab('foco')">Abrir o foco</button></div>`;
  return `<div class="card"><h2>Timer</h2><p class="hint">Abre o bloco de foco, com som no final.</p><div class="pills">${[15, 25, 50].map(m => `<button class="pill" onclick="A.focusStart(${m}, null, ${h(JSON.stringify(r.title))})">${m} min</button>`).join('')}</div></div>`;
}

function routineDetail(r) {
  if (!r) { S.openRoutine = null; return scrRotinas(); }
  const run = runOf(r);
  const back = `<button class="ghost mini" onclick="A.closeRoutine()">← Rotinas</button>`;
  if (S.editRoutine) {
    const steps = r.steps.map((s, i) => `<div class="row" style="margin-bottom:6px"><input class="grow" type="text" value="${h(s)}" ${fieldAttr('routines', r.id, `steps.${i}`)}><button class="icon" onclick="A.removeStep(${i})">×</button></div>`).join('');
    return [h(r.title), 'Editando', `${back}<div class="card mt"><h2>Nome</h2>${input('routines', r.id, 'title', r.title)}
      <h3>Quando</h3>${input('routines', r.id, 'when', r.when)}<h3>Duração</h3>${input('routines', r.id, 'duration', r.duration)}
      <h3>Gatilho</h3>${input('routines', r.id, 'trigger', r.trigger)}
      <h3>Passos</h3>${steps}<button class="ghost mini" onclick="A.addStep()">+ passo</button>
      <h3>Se travar</h3>${area('routines', r.id, 'ifStuck', r.ifStuck, '', 2)}
      <h3>Versão mínima</h3>${input('routines', r.id, 'minimal', r.minimal)}
      <button class="mt" onclick="A.doneEditing()">Pronto</button></div>`];
  }
  const steps = run.minimal
    ? check(!!run.checks[0], h(r.minimal), 'A.toggleStep(0)')
    : r.steps.map((s, i) => check(!!run.checks[i], h(s), `A.toggleStep(${i})`)).join('');
  const body = `${back}
  <div class="card mt"><div class="small">${h(r.when)} · ${h(r.duration)}</div><div class="mt"><b>Gatilho:</b> ${h(r.trigger)}</div>
    <div class="pills mt"><button class="pill ${!run.minimal ? 'on' : ''}" onclick="A.setMinimal(false)">Completa</button><button class="pill ${run.minimal ? 'on' : ''}" onclick="A.setMinimal(true)">Versão mínima</button></div></div>
  <div class="card">${steps}<button class="mt" style="width:100%" onclick="A.finishRoutine()">Concluí a rotina</button></div>
  ${r.timer ? timerCard(r) : ''}
  <div class="card"><b>Se travar:</b> ${h(r.ifStuck)}${r.alert ? `<div class="alert mt">${h(r.alert)}</div>` : ''}</div>
  <div class="card"><h2>Lembrete diário</h2><p class="hint">${N.isNative() ? 'O celular avisa todo dia neste horário.' : 'Disponível no app Android.'}</p>
    <div class="row"><select id="notifyDay" style="width:130px">${['Todo dia', ...WEEKDAYS].map((w, k) => `<option value="${k}" ${Number(r.notifyWeekday || 0) === k ? 'selected' : ''}>${w}</option>`).join('')}</select><input class="grow" type="time" id="notifyTime" value="${h(r.notifyTime || '')}"></div>
    <div class="row mt"><button class="grow" onclick="A.saveNotify()">Salvar lembrete</button>${r.notifyTime ? '<button class="ghost" onclick="A.clearNotify()">Tirar</button>' : ''}</div></div>
  <button class="ghost" style="width:100%" onclick="A.editRoutine()">Editar esta rotina</button>`;
  return [h(r.title), `Feita ${timesLast7(r.id)}x nos últimos 7 dias`, body];
}

// ---------------- Tela: Guia ----------------
const STATUS = [['', 'Sem status'], ['quero', 'Quero testar'], ['testando', 'Testando'], ['funcionou', 'Funcionou'], ['nao', 'Não funcionou']];

function stratCard([n, t, txt]) {
  const st = S.strat[n] || {};
  return `<div class="strat"><div class="row" style="align-items:flex-start"><div class="grow"><div class="ttl"><span class="n">${n}.</span>${h(t)}</div><div class="mt" style="margin-top:4px">${h(txt)}</div></div>
    <button class="star ${st.fav ? 'on' : ''}" onclick="A.toggleFav(${n})" title="Meu kit">${st.fav ? '★' : '☆'}</button></div>
    <div class="row mt"><select class="grow" onchange="A.setStatus(${n}, this.value)">${STATUS.map(([v, l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <details class="mt"><summary style="font-size:14px;font-weight:500;color:var(--muted)">Anotação${st.note ? ' ·' : ''}</summary><div class="mt">${area('strategies', n, 'note', st.note || '', 'Como aplico isso na minha vida…', 2)}</div></details></div>`;
}

function guideList() {
  const q = S.guideQuery.trim().toLowerCase();
  const f = S.guideFilter;
  const match = ([n, t, txt]) => {
    const st = S.strat[n] || {};
    if (f === 'kit' && !st.fav) return false;
    if (f === 'testando' && st.status !== 'testando' && st.status !== 'quero') return false;
    if (f === 'funcionou' && st.status !== 'funcionou') return false;
    if (q && !(`${n} ${t} ${txt} ${st.note || ''}`.toLowerCase().includes(q))) return false;
    return true;
  };
  const filtering = q || f !== 'all';
  let out = '';
  for (const ch of CHAPTERS) {
    const items = ch.items.filter(match);
    if (!items.length) continue;
    out += `<div class="card"><details ${filtering ? 'open' : ''}><summary>${h(ch.title)} <span class="small">(${items.length})</span></summary><p class="hint mt">${h(ch.intro)}</p>${items.map(stratCard).join('')}</details></div>`;
  }
  return out || '<p class="hint">Nada encontrado com esse filtro.</p>';
}

function scrGuia() {
  const favs = Object.values(S.strat).filter(s => s.fav).length;
  const filters = [['all', 'Todas'], ['kit', `Meu kit (${favs})`], ['testando', 'Testando'], ['funcionou', 'Funcionou']];
  const body = `
  <div class="card"><details><summary>Como usar o guia</summary>
    <p class="mt">Escolha 3 estratégias, teste por 7 dias e fique só com o que funcionar. Marque com a estrela as que entram no seu kit.</p>
    <h3>As cinco ideias por trás</h3>${PRINCIPLES.map(([a, b]) => `<div class="list-item"><div><b>${h(a)}</b> — ${h(b)}</div></div>`).join('')}
    <h3>Regras do jogo</h3>${RULES.map((r, i) => `<div class="list-item"><div>${i + 1}. ${h(r)}</div></div>`).join('')}
  </details></div>
  <input type="text" placeholder="Buscar estratégia, ex.: alarme, dinheiro, foco" value="${h(S.guideQuery)}" oninput="A.guideSearch(this.value)">
  <div class="seg mt">${filters.map(([k, l]) => `<button class="pill ${S.guideFilter === k ? 'on' : ''}" onclick="A.guideFilter('${k}')">${l}</button>`).join('')}</div>
  <div id="glist">${guideList()}</div>
  <div class="card"><details><summary>Quando procurar ajuda profissional</summary>${HELP.map(([a, b]) => `<div class="list-item"><div><b>${h(a)}.</b> ${h(b)}</div></div>`).join('')}
  <p class="small mt">Este app complementa, mas não substitui, avaliação e acompanhamento profissional.</p></details></div>`;
  return ['Guia', '100 estratégias para uma rotina que nem sempre coopera', body];
}

// ---------------- Ferramentas (semana, ideias, hábitos, lembretes) ----------------
function toolSemana() {
  const w = S.week;
  return `<div class="card"><h2>Revisão de 15 minutos</h2><p class="hint">Use no dia que preferir. Quinze minutos aqui economizam horas de "o que eu tinha que fazer mesmo?".</p>
    ${WEEK_CHECKS.map((c, i) => check(!!w.checks[i], h(c), `A.toggleWeekCheck(${i})`)).join('')}</div>
  <div class="card"><h2>As 3 da semana</h2>${w.top3.map((t, i) => `<div class="top3"><div class="row"><div class="num">${i + 1}</div><div class="grow">${input('misc', 'week', `top3.${i}.t`, t.t, 'Prioridade da semana')}</div><button class="icon" onclick="A.toggleWeekTop(${i})" style="color:${t.d ? 'var(--ok)' : 'var(--muted)'}">${t.d ? '✔' : '○'}</button></div><div class="mt">${input('misc', 'week', `top3.${i}.s`, t.s, 'Próximo passo')}</div></div>`).join('')}</div>
  <div class="card"><h2>Compromissos e prazos</h2>${area('misc', 'week', 'notes', w.notes, 'Um por linha. Criou o lembrete? Marque com ✓', 5)}</div>
  <button class="ghost" style="width:100%" onclick="A.newWeek()">Começar nova semana</button>`;
}

// ---------------- Prioridades: matriz + tarefa em 3 fases ----------------
const QUADS = { q1: ['Faz hoje', 'importante e urgente'], q2: ['Agenda', 'importante, sem pressa'], q3: ['Rápido ou repassa', 'urgente, pouco importante'], q4: ['Solta', 'nem um nem outro'] };
const PHASES = [['oque', 'O quê'], ['como', 'Como'], ['faz', 'Faz']];
function deadlineDays(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.deadline || '');
  if (!m) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / DAY);
}
function deadlineLabel(t) {
  const dd = deadlineDays(t);
  if (dd === null) return t.deadline ? `prazo ${t.deadline}` : '';
  if (dd < 0) return 'prazo passou'; if (dd === 0) return 'vence hoje'; if (dd === 1) return 'prazo amanhã';
  if (dd < 7) return `prazo em ${dd} dias`;
  const [y, m, d] = t.deadline.split('-').map(Number);
  return 'prazo ' + new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
function isUrgent(t) { if (t.urg === true) return true; const dd = deadlineDays(t); return S.settings.prioAuto !== false && dd !== null && dd <= 1; }
function quadOf(t) { if (t.imp !== true && t.imp !== false) return null; const imp = t.imp, urg = isUrgent(t); return imp && urg ? 'q1' : imp ? 'q2' : urg ? 'q3' : 'q4'; }
function phaseOf(t) { if (t.done) return 'feito'; if (!t.whatDone || !(t.what || '').trim()) return 'oque'; if (!t.ready) return 'como'; return 'faz'; }
const realSteps = t => (t.steps || []).filter(x => (x.t || '').trim());
function nextStep(t) { return (t.steps || []).find(x => (x.t || '').trim() && !x.d) || null; }
// Repetição com a próxima data a mais de 3 dias fica fora da matriz, em "Repetições agendadas".
function isParked(t) { if (!t.rep || t.done || t.someday) return false; const dd = deadlineDays(t); return dd !== null && dd > 3; }
const activeTasks = () => S.projects.filter(t => !t.done && !t.someday && !isParked(t));
const DEFAULT_CATS = [['casa', 'Casa', '#2f7d6d'], ['trabalho', 'Trabalho', '#3d5a99'], ['saude', 'Saúde', '#b5523b'], ['familia', 'Família', '#8a5a9e'], ['financas', 'Finanças', '#a07c1f']];
const CAT_COLORS = ['#2f7d6d', '#3d5a99', '#b5523b', '#8a5a9e', '#a07c1f', '#4f7f2f', '#9e4e6e', '#5c6770'];
const cats = () => S.settings.cats || [];
const taskCat = t => cats().find(c => c.id === t.cat) || null;
const catByName = n => { const f = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); return cats().find(c => f(c.name) === f(n)) || null; };
const cdot = c => c ? `<i class="cdot" style="background:${h(c.color)}"></i>` : '';
function whenText(t) { return t.time && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '') ? whenLabel(t.deadline, t.time) : deadlineLabel(t); }
function taskSub(t) {
  const st = realSteps(t), d = st.filter(x => x.d).length;
  const steps = st.length > 1 ? `${d}/${st.length} passos` : st.length ? '' : (phaseOf(t) === 'oque' ? 'definir o quê' : 'definir o como');
  return [whenText(t), t.place || '', t.rep ? '↻ ' + repLabel(t.rep) : '', steps].filter(Boolean).join(' · ');
}
function findTask(q) {
  const s = String(q || '').trim().toLowerCase(); if (!s) return null;
  const list = S.projects.filter(t => !t.done);
  return list.find(t => (t.title || '').toLowerCase() === s) || list.find(t => (t.title || '').toLowerCase().includes(s)) || list.find(t => s.includes((t.title || '').toLowerCase()) && t.title) || null;
}
// Tarefas na "Solta" por 7 dias vão para "Talvez um dia".
async function tidyTasks() {
  for (const t of S.projects) {
    if (t.done || t.someday || t.rep) continue;
    const q = quadOf(t); let changed = false;
    if (q === 'q4' && !t.soltaSince) { t.soltaSince = Date.now(); changed = true; }
    if (q !== 'q4' && t.soltaSince) { t.soltaSince = null; changed = true; }
    if (q === 'q4' && t.soltaSince && Date.now() - t.soltaSince > 7 * DAY) { t.someday = true; changed = true; }
    if (changed) await db.put('projects', t);
  }
}
function suggestThree() {
  const act = activeTasks().filter(t => quadOf(t));
  const by = q => act.filter(t => quadOf(t) === q).sort((a, b) => ((deadlineDays(a) ?? 999) - (deadlineDays(b) ?? 999)) || ((a.createdAt || 0) - (b.createdAt || 0)));
  const q1 = by('q1'), q2 = by('q2'), q3 = by('q3');
  const pick = [q1[0], q2[0], q3[0]].filter(Boolean);
  for (const t of [...q1.slice(1), ...q2.slice(1), ...q3.slice(1)]) { if (pick.length >= 3) break; pick.push(t); }
  return pick.slice(0, 3);
}
function newTaskObj(title, plan) {
  const t = { id: uid(), title: title.trim(), deadline: '', steps: [], createdAt: Date.now(), what: '', need: '', when: '', imp: null, urg: null, ready: false, done: false, someday: false };
  if (plan) applyPlan(t, plan, true);
  return t;
}
function applyPlan(t, p, full) {
  if (p.pronto_quando) { t.what = String(p.pronto_quando); t.whatDone = true; }
  if (typeof p.importante === 'boolean') t.imp = p.importante;
  if (typeof p.urgente === 'boolean') t.urg = p.urgente ? true : null;
  if (p.prazo !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(p.prazo || '')) t.deadline = p.prazo;
  if (p.preciso_de) t.need = String(p.preciso_de);
  if (Array.isArray(p.passos) && p.passos.length) {
    const keep = full ? [] : (t.steps || []).filter(x => x.d && (x.t || '').trim());
    t.steps = [...keep, ...p.passos.map(x => ({ t: String(x.texto || '').trim(), est: x.minutos || '', d: false }))].filter(x => x.t);
  }
}
const hasAI = () => !!keyStore.get();

// Aviso no horário da tarefa: um lembrete ligado a ela (aparece em Lembretes e notifica).
const ALERTS = [[0, 'Na hora'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
const localIso = d => `${todayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function taskAlarmAt(t) {
  if (t.done || t.someday || !t.time || !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '')) return null;
  const d = keyToDate(t.deadline); const [hh, mi] = t.time.split(':').map(Number); d.setHours(hh, mi, 0, 0);
  return new Date(d.getTime() - (Number(t.alertMin) || 0) * 60000);
}
async function syncTaskAlarm(t) {
  const at = taskAlarmAt(t);
  let r = S.reminders.find(x => x.taskId === t.id);
  if (!at) { if (r) { S.reminders = S.reminders.filter(x => x !== r); await db.del('reminders', r.id); await N.cancelOnce(r.id); } return; }
  if (!r) { r = { id: uid(), taskId: t.id }; S.reminders.push(r); }
  Object.assign(r, { title: t.title + (t.place ? ` · ${t.place}` : ''), at: localIso(at), note: t.alertMin ? `começa às ${t.time}` : 'tarefa', done: false });
  await db.put('reminders', r);
  await N.scheduleOnce(r.id, t.alertMin ? `Às ${t.time}` : 'Lembrete', r.title, at);
}
// Concluir: guarda, tira o aviso e, se repete, cria a próxima.
async function finishTask(t, skipped = false) {
  t.done = true; t.doneAt = Date.now(); if (skipped) t.skipped = true;
  await db.put('projects', t); await syncTaskAlarm(t);
  const next = t.rep && !t.spawned ? await spawnNext(t) : null;
  await syncTopForTask(t);
  return next;
}
async function spawnNext(t) {
  const base = keyToDate(t.deadline); const today = keyToDate(todayKey());
  const d = nextOccurrence(t.rep, base && base > today ? base : today, false);
  if (!d) return null;
  t.spawned = true; await db.put('projects', t);
  const n = JSON.parse(JSON.stringify(t));
  Object.assign(n, { id: uid(), createdAt: Date.now(), done: false, doneAt: null, skipped: false, spawned: false, someday: false, soltaSince: null, deadline: dateKey(d), series: t.series || t.id, steps: realSteps(t).map(x => ({ ...x, d: false })) });
  S.projects.unshift(n); await db.put('projects', n); await syncTaskAlarm(n);
  return n;
}
const nextLabel = n => n ? `Próxima: ${whenText(n)}` : '';

// Captura: junta o que o leitor local achou com o que a IA devolveu (o leitor ganha em data e hora).
function repFromAI(p) {
  const k = { diaria: 'dia', dias_uteis: 'semana', semanal: 'semana', mensal: 'mes' }[p && p.repete];
  if (!k) return null;
  if (p.repete === 'dias_uteis') return { kind: 'semana', days: [1, 2, 3, 4, 5] };
  return validRep({ kind: k, days: p.dias_semana || [], dom: p.dia_mes });
}
function finalizeCapture(c) {
  const now = new Date();
  if (c.rep && !c.date) { let d = nextOccurrence(c.rep, now, true); if (d && c.time && todayKey(d) === todayKey()) { const [hh, mi] = c.time.split(':').map(Number); const at = new Date(); at.setHours(hh, mi, 0, 0); if (at <= now) d = nextOccurrence(c.rep, now, false); } c.date = d ? dateKey(d) : ''; }
  if (c.time && !c.date) { const [hh, mi] = c.time.split(':').map(Number); const at = new Date(); at.setHours(hh, mi, 0, 0); const d = new Date(); if (at <= now) d.setDate(d.getDate() + 1); c.date = todayKey(d); }
  if (c.alertMin == null) c.alertMin = c.place ? 30 : 0;
  return c;
}
function mergeCapture(local, p, manualCat) {
  const okDate = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : '';
  const okTime = x => { const m = /^(\d{1,2}):(\d{2})$/.exec(x || ''); return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : ''; };
  const none = manualCat === 'none';
  const c = { title: local.title, date: local.date, time: local.time, place: local.place, rep: local.rep, cat: none ? null : manualCat || null, alertMin: null };
  if (p) {
    if ((p.titulo || '').trim()) c.title = p.titulo.trim();
    c.date = c.date || okDate(p.data) || '';
    c.time = c.time || okTime(p.hora);
    if ((p.local || '').trim()) c.place = p.local.trim();
    c.rep = c.rep || repFromAI(p);
    if (!c.cat && !none && p.categoria) { const k = catByName(p.categoria); if (k) c.cat = k.id; }
    if (Number.isFinite(Number(p.avisar_antes_min)) && p.avisar_antes_min !== '' && p.avisar_antes_min !== null) c.alertMin = Math.max(0, Math.round(Number(p.avisar_antes_min)));
  }
  if (!c.cat && !none) c.cat = guessCat(local.title + ' ' + (local.place || ''), cats());
  return finalizeCapture(c);
}
function applyCapture(t, c) {
  if (!c) return t;
  t.title = c.title || t.title;
  if (c.date) t.deadline = c.date;
  t.time = c.time || ''; t.place = c.place || ''; t.rep = c.rep || null; t.cat = c.cat || null; t.alertMin = c.alertMin || 0;
  if (t.rep && !t.series) t.series = t.id;
  return t;
}
function captureChips(c) {
  if (!c) return '';
  const k = taskCat({ cat: c.cat });
  const chip = (txt, icon) => `<span class="cchip">${icon ? svg(icon, 14, 2.2) : ''}${h(txt)}</span>`;
  return [c.date ? chip(whenLabel(c.date, c.time), 'semana') : '', c.place ? chip(c.place, 'pin') : '', c.rep ? chip(repLabel(c.rep), 'rotinas') : '', k ? `<span class="cchip">${cdot(k)}${h(k.name)}</span>` : ''].join('');
}

function quadPills(t) {
  const q = quadOf(t);
  return `<div class="pills">${Object.entries(QUADS).map(([k, [l]]) => `<button class="pill ${q === k ? 'on' : ''}" onclick="A.setQuad('${t.id}','${k}')">${l}</button>`).join('')}</div>`;
}

// Mantém as 3 do dia ligadas a uma tarefa em dia com o próximo passo.
async function syncTopForTask(t) {
  const today = todayKey();
  const page = S.page.id === today ? S.page : null;
  if (!page || !page.top3.some(x => x.task === t.id)) return;
  for (const x of page.top3) if (x.task === t.id) { const st = nextStep(t); x.t = t.title; x.s = st ? st.t : ''; if (t.done) x.d = true; }
  await savePage();
}

const ntEffCat = n => n.cat === 'none' ? null : n.cat || ((n.title || '').trim() ? guessCat(parseCapture(n.title).title + ' ' + parseCapture(n.title).place, cats()) : null);
function ntCatPills(n) {
  if (!cats().length) return '';
  const eff = ntEffCat(n);
  return cats().map(c => `<button class="pill ${eff === c.id ? 'on' : ''}" style="white-space:nowrap" onclick="A.ntCat('${c.id}')">${cdot(c)}${h(c.name)}</button>`).join('');
}
function newTaskSheet() {
  const n = S.newTask; if (!n) return '';
  const p = n.plan;
  let inner;
  if (n.busy) inner = `<p class="hint" style="margin:14px 0 0">${svg('assistente', 16)} ${S.settings.autoSlice !== false ? 'Lendo e fatiando com a IA…' : 'Lendo com a IA…'}</p>`;
  else if (p) {
    const c = n.cap || {};
    const total = p.passos.reduce((a, x) => a + (Number(x.minutos) || 0), 0);
    const q = quadOf({ imp: p.importante, urg: p.urgente ? true : null, deadline: c.date || p.prazo || '' });
    const when = !c.time && p.sugestao_quando && !isNaN(new Date(p.sugestao_quando)) && new Date(p.sugestao_quando) > new Date() ? new Date(p.sugestao_quando) : null;
    const chips = captureChips(c);
    inner = `<p style="margin:14px 0 4px;font-size:17px;font-weight:800">${h(c.title || n.title)}</p>${chips ? `<div class="cchips">${chips}</div>` : ''}
      <p style="margin:12px 0 10px;font-weight:800;color:var(--accent-ink)">${svg('assistente', 16)} ${p.grande ? `Tarefa grande. Fatiei em ${p.passos.length} passos, revise:` : `Tarefa rápida, uns ${total} min.`}</p>
      <div class="row" style="align-items:stretch"><div class="grow" style="background:var(--bg);border-radius:14px;padding:9px 12px"><p class="eyebrow">Pronto quando</p><p style="margin:2px 0 0;font-size:14px">${h(p.pronto_quando)}</p></div>
      <div class="grow" style="background:var(--accent-soft);border-radius:14px;padding:9px 12px"><p class="eyebrow">Prioridade</p><p style="margin:2px 0 0;font-size:14px;font-weight:800;color:var(--accent-ink)">${q ? QUADS[q][0] : '—'}${!c.date && p.prazo ? ` · ${h(deadlineLabel({ deadline: p.prazo }))}` : ''}</p></div></div>
      ${p.grande ? `<div class="steps mt">${p.passos.map((x, i) => `<div class="steprow"><span class="sn ${i === 0 ? 'cur' : ''}">${i + 1}</span><span class="grow" style="${i === 0 ? 'font-weight:700' : ''}">${h(x.texto)}</span><span class="small">${x.minutos} min</span></div>`).join('')}</div>` : ''}
      <p class="small mt">${total ? `Total: ${total >= 60 ? `${Math.floor(total / 60)} h ${total % 60 ? (total % 60) + ' min' : ''}` : total + ' min'}.` : ''}${c.time ? ` Aviso ${c.alertMin ? ALERTS.find(a => a[0] === c.alertMin)?.[1].toLowerCase() || c.alertMin + ' min antes' : 'na hora'}.` : ''}${when ? ` Sugiro o passo 1 ${dueLabel(when.toISOString())}.` : ''}${p.preciso_de ? ` Precisa de: ${h(p.preciso_de)}.` : ''}</p>
      <button style="width:100%;margin-top:6px" onclick="A.ntAccept(${when ? 'true' : 'false'})">${when ? 'Aceitar e agendar o passo 1' : 'Aceitar'}</button>
      <div class="row mt">${p.grande ? '<button class="ghost grow" onclick="A.ntFiner()">Fatiar mais fino</button>' : ''}<button class="ghost grow" onclick="A.ntEdit()">Editar</button></div>`;
  } else {
    const pre = (n.title || '').trim() ? captureChips({ ...mergeCapture(parseCapture(n.title), null, null), cat: null }) : '';
    inner = `<div id="ntPreview" class="cchips" ${pre ? '' : 'style="display:none"'}>${pre}</div>${cats().length ? `<div id="ntCats" class="pills catbar" style="margin:10px -2px 0">${ntCatPills(n)}</div>` : ''}
      ${n.error ? `<div class="alert mt">${h(n.error)}</div><button class="ghost mt" style="width:100%" onclick="A.ntPlain()">Adicionar sem a IA</button>` : ''}
      <div class="row mt"><button class="ghost grow" onclick="A.ntClose()">Cancelar</button><button class="grow" onclick="A.ntSubmit()">${hasAI() && S.settings.autoSlice !== false ? 'Adicionar e fatiar' : 'Adicionar'}</button></div>
      <p class="small mt" style="margin-bottom:0">Escreva do seu jeito: "dentista sexta 15h no centro", "pagar a luz todo dia 10". O app pega a data, a hora, o local e a repetição.${hasAI() && S.settings.autoSlice !== false ? ' A IA ainda fatia em passos pequenos. Nada é salvo sem você aceitar.' : ''}</p>`;
  }
  return `<div class="scrim" style="z-index:32" onclick="A.ntClose()"></div><div class="sheet" role="dialog" aria-label="Nova tarefa"><div class="grab"></div>
    <div class="row"><input class="grow" type="text" id="ntTitle" placeholder="Ex.: dentista sexta 15h no centro" value="${h(n.title)}" oninput="A.ntSet(this.value)" onkeydown="if(event.key==='Enter')A.ntSubmit()" ${n.busy || p ? 'disabled' : ''}><button class="iconbtn" style="background:var(--accent-soft);color:var(--accent)" onclick="A.ntVoice()" aria-label="Ditar a tarefa" ${n.busy || p ? 'disabled' : ''}>${svg('mic', 22)}</button></div>${inner}</div>`;
}

function scrTarefas() {
  if (S.openProject) {
    const t = S.projects.find(x => x.id === S.openProject);
    if (t) return taskDetail(t);
    S.openProject = null;
  }
  const plus = `<button class="iconbtn" style="background:var(--accent-soft);color:var(--accent);border-radius:22px" onclick="A.newTask()" aria-label="Nova tarefa">${svg('plus', 22, 2.2)}</button>`;
  const cf = S.catFilter && cats().some(c => c.id === S.catFilter) ? S.catFilter : null;
  const inCat = t => !cf || t.cat === cf;
  const act = activeTasks().filter(inCat);
  const loose = act.filter(t => !quadOf(t));
  const chip = t => `<button class="tk" onclick="A.openProject('${t.id}')">${cdot(taskCat(t))}${h(t.title || 'Sem título')}<span>${h(taskSub(t))}</span></button>`;
  const quad = k => { const list = act.filter(t => quadOf(t) === k); return `<div class="quad ${k}"><p class="qt">${QUADS[k][0]}</p><p class="qs">${QUADS[k][1]}</p>${list.map(chip).join('') || '<p class="qs" style="margin-top:8px">Nada aqui.</p>'}${k === 'q4' && list.length ? '<p class="qs" style="margin-top:6px">Vai pro "Talvez um dia" em 7 dias, sem culpa.</p>' : ''}</div>`; };
  const sug = S.settings.prioSuggest !== false ? suggestThree() : [];
  const someday = S.projects.filter(t => !t.done && t.someday && inCat(t));
  const parked = S.projects.filter(t => isParked(t) && inCat(t)).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const done = S.projects.filter(t => t.done && !t.skipped && inCat(t)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 10);
  const used = new Set(S.projects.filter(t => !t.done).map(t => t.cat));
  const filt = cats().length && S.projects.some(t => t.cat) ? `<div class="pills catbar">${[`<button class="pill ${!cf ? 'on' : ''}" onclick="A.setCatFilter(null)">Todas</button>`, ...cats().filter(c => used.has(c.id) || c.id === cf).map(c => `<button class="pill ${cf === c.id ? 'on' : ''}" onclick="A.setCatFilter('${c.id}')">${cdot(c)}${h(c.name)}</button>`)].join('')}</div>` : '';
  let b = filt + `<p class="hint"><b style="color:var(--ink)">Importante</b> te leva pra frente. <b style="color:var(--ink)">Urgente</b> tem prazo agora.</p>`;
  if (!S.projects.length) b += `<div class="card"><h2>Comece por uma</h2><p class="hint" style="margin:0">Toque no + e escreva ou dite a tarefa. ${hasAI() ? 'A IA fatia em passos pequenos e sugere onde ela entra na matriz.' : 'Depois você define onde ela entra e os passos.'}</p></div>`;
  if (loose.length) b += `<div class="card"><h2>Para classificar (${loose.length})</h2>${loose.map(t => `<div class="top3"><button class="tk plain" onclick="A.openProject('${t.id}')">${h(t.title || 'Sem título')}<span>${h(taskSub(t))}</span></button><div class="mt">${quadPills(t)}</div></div>`).join('')}</div>`;
  b += `<div class="mhead"><p class="eyebrow">Urgente</p><p class="eyebrow">Sem pressa</p></div><div class="matrix">${quad('q1')}${quad('q2')}${quad('q3')}${quad('q4')}</div>`;
  if (sug.length) b += `<div class="hero" style="margin-top:12px"><div class="row"><p class="grow" style="margin:0;font-weight:800;font-size:16px">Sugestão para as 3 do dia</p></div><p class="sub2" style="font-size:13px">1 do Faz hoje, 1 da Agenda e 1 rápida, quando houver.</p>
    <div class="pills mt">${sug.map(t => `<span class="tag ${quadOf(t) === 'q1' ? 'warn' : ''}" style="font-size:13px;padding:5px 10px">${h(t.title)}</span>`).join('')}</div>
    <button class="light" style="width:100%;margin-top:12px" onclick="A.useThree()">Usar estas ${sug.length}</button></div>`;
  if (parked.length) b += `<div class="card mt"><details><summary style="font-size:15px">Repetições agendadas (${parked.length})</summary><p class="hint mt">Entram na matriz 3 dias antes.</p>${parked.map(t => `<div class="list-item" onclick="A.openProject('${t.id}')" style="cursor:pointer"><div class="grow">${cdot(taskCat(t))}${h(t.title)}<div class="small">${h(whenText(t))} · ↻ ${h(repLabel(t.rep))}</div></div></div>`).join('')}</details></div>`;
  if (someday.length) b += `<div class="card mt"><details><summary style="font-size:15px">Talvez um dia (${someday.length})</summary><div class="mt">${someday.map(t => `<div class="list-item"><div class="grow">${h(t.title)}</div><button class="ghost mini" onclick="A.taskBack('${t.id}')">Trazer de volta</button></div>`).join('')}</div></details></div>`;
  if (done.length) b += `<div class="card"><details><summary style="font-size:15px">Concluídas (${done.length})</summary><div class="mt">${done.map(t => `<div class="list-item"><div class="grow muted" style="text-decoration:line-through">${h(t.title)}</div><button class="ghost mini" onclick="A.taskReopen('${t.id}')">Reabrir</button></div>`).join('')}</div></details></div>`;
  return ['Prioridades', `${act.length} ${act.length === 1 ? 'tarefa' : 'tarefas'} na matriz`, b, { right: plus }];
}

// ---------------- Compartilhar e receber tarefas ----------------
// Só os campos preenchidos: cada caractere a menos deixa o link mais curto (o WhatsApp corta mensagem longa).
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)));
function taskPayload(t) {
  const tarefa = compact({ title: t.title, what: t.what, imp: t.imp, urg: t.urg, deadline: t.deadline, need: t.need, when: t.when, steps: realSteps(t).map(x => compact({ t: x.t, est: x.est })),
    time: t.time, place: t.place, rep: t.rep, alertMin: t.alertMin || null, cat: taskCat(t) ? taskCat(t).name : null });
  return compact({ app: 'tdah-vida-real', kind: 'tarefa', v: 1, de: S.settings.name, tarefa });
}
// Com link, ele vai logo no começo: o WhatsApp recolhe mensagem longa em "Ler mais"
// e, recolhida, o toque abre só o pedaço visível do link.
function taskShareText(t, link) {
  const st = realSteps(t);
  const lines = [];
  const quem = S.settings.name ? `${S.settings.name} te mandou uma tarefa` : 'Tarefa';
  if (link) { lines.push(`${quem}. Toque no link para adicionar no app TDAH na Vida Real:`); lines.push(link); lines.push(''); }
  else lines.push(quem + ':');
  lines.push(`*${t.title}*`);
  if (t.what) lines.push(`Pronto quando: ${t.what}`);
  const dl = whenText(t); if (dl) lines.push(cap(dl) + '.');
  if (t.place) lines.push(`Local: ${t.place}`);
  if (t.rep) lines.push(`Repete: ${repLabel(t.rep)}`);
  if (st.length) { lines.push(''); lines.push('Passos:'); st.forEach((x, i) => lines.push(`${i + 1}. ${x.t}${x.est ? ` (${x.est} min)` : ''}`)); }
  if (t.need) lines.push(`Precisa de: ${t.need}`);
  return lines.join('\n');
}
const slugify = s => String(s || 'tarefa').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tarefa';

// Conteúdo de um arquivo aberto com o app: tarefa (mostra a folha para aceitar) ou backup/perfil (oferece importar).
async function handleIncomingData(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return toast('Esse arquivo não é do TDAH na Vida Real.'); }
  if (data && data.app === 'tdah-vida-real' && data.kind === 'tarefa' && data.tarefa && data.tarefa.title) {
    S.incoming = { de: String(data.de || ''), task: data.tarefa }; S.drawer = false; render(); return;
  }
  if (data && data.stores) {
    if (!confirm('Importar este arquivo de perfil ou backup? Ele mescla com os seus dados, sem apagar nada.')) return;
    const keep = Object.fromEntries(DRIVE_KEYS.map(k => [k, S.settings[k]]));
    const n = await importAll(data, 'merge'); await loadAll();
    Object.assign(S.settings, keep); await db.put('settings', S.settings); await syncNotifications();
    toast(`Importado: ${n} registros`); render(); return;
  }
  toast('Esse arquivo não é do TDAH na Vida Real.');
}
async function handleIncomingUri(uri) {
  if (!uri) return;
  const code = shareCodeFromUrl(uri);
  if (!code && !/^(content|file):/i.test(uri)) return;
  try { if (sessionStorage.getItem('last_incoming') === uri) return; sessionStorage.setItem('last_incoming', uri); } catch (e) { /* segue */ }
  try {
    const text = code ? await decodeShare(code) : await N.readSharedUri(uri);
    await handleIncomingData(text);
  } catch (e) { code ? toast('O link chegou cortado. No WhatsApp, toque em "Ler mais" na mensagem e depois no link.', 8000) : toast('Não consegui abrir o arquivo: ' + (e.message || e)); }
}
function incomingSheet() {
  const inc = S.incoming; if (!inc) return '';
  const t = inc.task, st = (t.steps || []).filter(x => (x.t || '').trim());
  const q = quadOf({ imp: t.imp, urg: t.urg, deadline: t.deadline || '' });
  const total = st.reduce((a, x) => a + (Number(x.est) || 0), 0);
  const dup = S.projects.some(p => !p.done && (p.title || '').trim().toLowerCase() === String(t.title).trim().toLowerCase());
  return `<div class="scrim" style="z-index:32" onclick="A.incomingClose()"></div><div class="sheet" role="dialog" aria-label="Tarefa recebida"><div class="grab"></div>
    <p class="eyebrow">Tarefa recebida</p>
    <h2 style="margin:4px 0 2px;font-size:20px;font-weight:800">${h(t.title)}</h2>
    <p class="hint">${inc.de ? `${h(inc.de)} te mandou esta tarefa.` : 'Alguém te mandou esta tarefa.'}</p>
    ${t.what || q ? `<div class="row" style="align-items:stretch">${t.what ? `<div class="grow" style="background:var(--bg);border-radius:14px;padding:9px 12px"><p class="eyebrow">Pronto quando</p><p style="margin:2px 0 0;font-size:14px">${h(t.what)}</p></div>` : ''}${q ? `<div class="grow" style="background:var(--accent-soft);border-radius:14px;padding:9px 12px"><p class="eyebrow">Prioridade</p><p style="margin:2px 0 0;font-size:14px;font-weight:800;color:var(--accent-ink)">${QUADS[q][0]}${t.deadline ? ` · ${h(deadlineLabel({ deadline: t.deadline }))}` : ''}</p></div>` : ''}</div>` : ''}
    ${st.length ? `<div class="steps mt">${st.map((x, i) => `<div class="steprow"><span class="sn">${i + 1}</span><span class="grow">${h(x.t)}</span>${x.est ? `<span class="small">${h(x.est)} min</span>` : ''}</div>`).join('')}</div>` : ''}
    ${total ? `<p class="small mt">Total: ${total} min.</p>` : ''}
    ${dup ? '<div class="alert mt">Você já tem uma tarefa com esse nome. Se adicionar, fica com as duas.</div>' : ''}
    <button style="width:100%;margin-top:12px" onclick="A.incomingAccept()">Adicionar às minhas tarefas</button>
    <button class="ghost mt" style="width:100%" onclick="A.incomingClose()">Agora não</button></div>`;
}

function whenCard(t) {
  const id = t.id, rep = t.rep, kind = rep ? rep.kind : 'nao';
  const dk = /^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '') ? t.deadline : '';
  const sum = [whenText(t), t.place || '', rep ? '↻ ' + repLabel(rep) : '', taskCat(t) ? taskCat(t).name : ''].filter(Boolean).join(' · ') || 'sem data';
  const open = S.whenOpen[id] ?? (phaseOf(t) === 'oque');
  const reps = [['nao', 'Não'], ['dia', 'Todo dia'], ['semana', 'Semanal'], ['mes', 'Mensal']].map(([k, l]) => `<button class="pill ${kind === k ? 'on' : ''}" onclick="A.setRep('${id}','${k}')">${l}</button>`).join('');
  const wd = kind === 'semana' ? `<div class="wdays mt">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => `<button class="${rep.days.includes(i) ? 'on' : ''}" aria-label="${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][i]}" onclick="A.toggleRepDay('${id}', ${i})">${l}</button>`).join('')}</div>` : '';
  const dm = kind === 'mes' ? `<div class="row mt"><span class="small">Todo dia</span><input type="number" min="1" max="31" inputmode="numeric" style="width:90px" value="${rep.dom}" onchange="A.setRepDom('${id}', this.value)"><span class="small grow">do mês</span></div>` : '';
  return `<div class="card"><details ${open ? 'open' : ''} ontoggle="A.whenToggle('${id}', this.open)"><summary class="fsum"><span class="grow"><b>Quando e onde</b><span class="small" style="display:block;font-weight:500">${h(sum)}</span></span></summary>
    <div class="grid2 mt"><label><span class="small">Data ou prazo</span><input type="date" value="${dk}" onchange="A.setDeadline('${id}', this.value)"></label><label><span class="small">Horário</span><input type="time" value="${h(t.time || '')}" onchange="A.setTaskTime('${id}', this.value)"></label></div>
    ${t.time ? `<label class="mt" style="display:block"><span class="small">Avisar</span><select onchange="A.setTaskAlert('${id}', this.value)">${ALERTS.map(([v, l]) => `<option value="${v}" ${(Number(t.alertMin) || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <label class="mt" style="display:block"><span class="small">Local</span><input type="text" value="${h(t.place || '')}" placeholder="Opcional" oninput="A.setTaskPlace('${id}', this.value)"></label>
    <h3>Repetir</h3><div class="pills">${reps}</div>${wd}${dm}
    ${rep ? `<p class="small mt" style="margin-bottom:0">Ao concluir, a próxima volta sozinha para a matriz.</p>` : ''}
    ${cats().length ? `<h3>Categoria</h3><div class="pills">${cats().map(c => `<button class="pill ${t.cat === c.id ? 'on' : ''}" onclick="A.setTaskCat('${id}','${c.id}')">${cdot(c)}${h(c.name)}</button>`).join('')}</div>` : ''}
  </details></div>`;
}

function taskDetail(t) {
  const ph = phaseOf(t);
  const q = quadOf(t);
  const idx = PHASES.findIndex(([k]) => k === ph);
  const stepper = `<div class="stepper">${PHASES.map(([k, l], i) => `<div class="${ph === 'feito' || i < idx ? 'done' : i === idx ? 'cur' : ''}">${ph === 'feito' || i < idx ? svg('check', 14, 3) : ''}${i + 1} ${l}</div>`).join('')}</div>`;
  const busy = S.taskBusy === t.id;
  const st = t.steps || [];
  const total = st.reduce((a, x) => a + (Number(x.est) || 0), 0);
  let b = `<div class="card"><input type="text" class="title-input" value="${h(t.title)}" placeholder="Nome da tarefa" ${fieldAttr('projects', t.id, 'title')}>${q || taskCat(t) ? `<div class="mt">${q ? `<span class="tag ${q === 'q1' ? 'warn' : ''}">${QUADS[q][0]}</span> ` : ''}${taskCat(t) ? `<span class="tag">${cdot(taskCat(t))}${h(taskCat(t).name)}</span> ` : ''}${t.deadline ? `<span class="small">${h(whenText(t))}</span>` : ''}</div>` : ''}${t.from ? `<p class="small" style="margin:8px 0 0">Recebida de ${h(t.from)}</p>` : ''}</div>${stepper}`;

  // 1. O quê
  if (ph === 'oque' || S.editWhat === t.id) {
    b += `<div class="card"><h2>1. O quê</h2><p class="hint">Uma frase: como você sabe que acabou?</p>${input('projects', t.id, 'what', t.what || '', 'Ex.: PDF enviado ao gestor')}
      <h3>Onde ela entra</h3>${quadPills(t)}
      ${t.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline) ? `<p class="small mt">Prazo anotado antes: ${h(t.deadline)}</p>` : ''}
      <button style="width:100%;margin-top:14px" onclick="A.taskNext('${t.id}')">${ph === 'oque' ? 'Próximo: como fazer' : 'Pronto'}</button></div>`;
  } else {
    b += `<div class="card row" style="align-items:flex-start"><div class="grow"><p class="eyebrow">Pronto quando</p><p style="margin:3px 0 0">${h(t.what)}</p></div><button class="icon" onclick="A.editWhat('${t.id}')" aria-label="Editar o quê">✎</button></div>`;
  }

  if (ph !== 'feito') b += whenCard(t);

  // 2. Como
  if (ph === 'como') {
    const rows = st.map((x, i) => `<div class="top3"><div class="row"><div class="num">${i + 1}</div><div class="grow">${input('projects', t.id, `steps.${i}.t`, x.t, 'Verbo + objeto')}</div><button class="icon" onclick="A.removeProjStep(${i})" aria-label="Tirar passo">×</button></div>
      <div class="row mt"><input type="number" inputmode="numeric" min="0" style="width:100px" value="${h(x.est)}" placeholder="min" ${fieldAttr('projects', t.id, `steps.${i}.est`)}><span class="small grow">minutos</span></div></div>`).join('');
    b += `<div class="card"><div class="row"><h2 class="grow" style="margin:0">2. Como vou fazer</h2>${hasAI() ? `<button class="chip" onclick="A.taskSlice('${t.id}')" ${busy ? 'disabled' : ''}>${busy ? 'Fatiando…' : 'IA: fatiar pra mim'}</button>` : ''}</div>
      <p class="hint mt">Fatie até o primeiro passo parecer fácil a ponto de ser bobo.</p>${rows}<button class="ghost mini" onclick="A.addProjStep()">+ passo</button>
      ${total ? `<p class="small mt">Estimativa: ${total} min. Com a margem de 1,5x: ${Math.round(total * 1.5)} min.</p>` : ''}
      <h3>Preciso de</h3>${input('projects', t.id, 'need', t.need || '', 'Material, acesso, alguém')}
      <h3>Quando</h3>${input('projects', t.id, 'when', t.when || '', 'Ex.: amanhã às 9h, 35 min')}
      <button style="width:100%;margin-top:14px" onclick="A.taskReady('${t.id}')">Pronto, agora é só fazer →</button>
      <p class="small mt" style="margin-bottom:0;text-align:center">No "Faz" os passos ficam travados. Ideia nova vai pro estacionamento.</p></div>`;
  } else if (ph === 'faz' || ph === 'feito') {
    const cur = nextStep(t);
    const list = st.filter(x => (x.t || '').trim()).map(x => { const i = st.indexOf(x); return `<div class="steprow ${x.d ? 'done' : ''}" onclick="A.toggleProjStep(${i})" style="cursor:pointer"><span class="sn ${x === cur ? 'cur' : ''} ${x.d ? 'ok' : ''}">${x.d ? svg('check', 13, 3) : i + 1}</span><span class="grow" style="${x === cur ? 'font-weight:800' : ''}">${h(x.t)}</span>${x.est ? `<span class="small">${x.est} min</span>` : ''}</div>`; }).join('');
    b += `<div class="card"><h2>${ph === 'feito' ? 'Passos' : '3. Faz'}</h2>${ph === 'faz' && cur ? `<p class="hint">Agora é só o próximo passo. Sem decidir nada no meio.</p>` : ''}<div class="steps">${list}</div>
      ${t.need || t.when ? `<p class="small mt" style="margin-bottom:0">${t.need ? `Preciso de: ${h(t.need)}. ` : ''}${t.when ? `Quando: ${h(t.when)}.` : ''}</p>` : ''}</div>`;
    if (ph === 'faz') {
      if (cur) b += `<button style="width:100%;height:54px;font-size:16px" onclick="A.taskFocus('${t.id}')">${svg('foco', 20)} Começar no foco: passo ${st.indexOf(cur) + 1}</button>
        <div class="row mt"><button class="ghost grow" style="font-size:14px;padding:11px 6px" onclick="A.taskStuck('${t.id}')" ${busy ? 'disabled' : ''}>${busy ? 'Quebrando…' : 'Travei neste passo'}</button><button class="ghost grow" style="font-size:14px;padding:11px 6px" onclick="A.taskEdit('${t.id}')">Editar o plano</button></div>`;
      else b += `<button style="width:100%;height:54px;font-size:16px" onclick="A.taskComplete('${t.id}')">Concluir tarefa</button>`;
      if (t.rep) b += `<button class="ghost mt" style="width:100%" onclick="A.taskSkip('${t.id}')">Pular esta vez</button>`;
    } else b += `<div class="card"><p style="margin:0;font-weight:700">Concluída${t.doneAt ? ' em ' + new Date(t.doneAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : ''}.</p><button class="ghost mini mt" onclick="A.taskReopen('${t.id}')">Reabrir</button></div>`;
  }
  b += `<button class="ghost" style="width:100%;margin-top:16px;display:flex;align-items:center;justify-content:center;gap:8px" onclick="A.shareTask('${t.id}')">${svg('share', 18)}Compartilhar tarefa</button>`;
  b += `<div class="row" style="margin-top:10px"><button class="ghost grow" onclick="A.taskSomeday('${t.id}')">Talvez um dia</button><button class="danger grow" onclick="A.deleteProject()">Apagar</button></div>`;
  return ['Tarefa', ph === 'feito' ? 'Concluída' : `Fase: ${PHASES[idx][1]}`, b, { back: 'A.closeProject()' }];
}

function toolIdeias() {
  const open = S.ideas.filter(i => !i.done), done = S.ideas.filter(i => i.done);
  const row = i => `<div class="top3"><div class="row"><div class="grow">${input('ideas', i.id, 't', i.t)}</div><button class="icon" onclick="A.toggleIdea('${i.id}')" style="color:${i.done ? 'var(--ok)' : 'var(--muted)'}">${i.done ? '✔' : '○'}</button><button class="icon" onclick="A.removeIdea('${i.id}')">×</button></div><div class="mt">${input('ideas', i.id, 'when', i.when, 'Quando olho isso de novo?')}</div></div>`;
  return `<div class="card"><h2>Estacionamento de ideias</h2><p class="hint">Ideia boa fora de hora vem para cá. Você não perde a ideia nem o foco.</p>
    <div class="row"><input class="grow" type="text" id="ideaInput" placeholder="Nova ideia" onkeydown="if(event.key==='Enter')A.addIdea()"><button onclick="A.addIdea()">+</button></div>
    <div class="mt">${open.map(row).join('') || '<p class="hint" style="margin:0">Vazio por enquanto.</p>'}</div>
    ${done.length ? `<details class="mt"><summary style="font-size:14px">Já resolvidas (${done.length})</summary><div class="mt">${done.map(row).join('')}</div></details>` : ''}</div>`;
}

function toolHabitos() {
  const list = S.habits.map(hb => `<div class="top3"><div class="row"><div class="grow">${input('habits', hb.id, 't', hb.t)}</div><button class="icon" onclick="A.removeHabit('${hb.id}')">×</button></div>
    <div class="habit-boxes">${(hb.marks || []).map((m, i) => `<button class="hb ${m ? 'on' : ''}" onclick="A.toggleHabit('${hb.id}', ${i})">${i + 1}</button>`).join('')}</div>
    <div class="row mt"><span class="small grow">${(hb.marks || []).filter(Boolean).length} de 7</span><button class="ghost mini" onclick="A.resetHabit('${hb.id}')">Zerar</button></div></div>`).join('');
  return `<div class="card"><h2>Rastreador de hábitos sem data</h2><p class="hint">Quadradinho vazio não é falha: é informação para ajustar o hábito. O que falhou mais precisa ficar menor, mais fácil ou mudar de horário.</p>
    <div class="row"><input class="grow" type="text" id="habitInput" placeholder="Novo hábito" onkeydown="if(event.key==='Enter')A.addHabit()"><button onclick="A.addHabit()">+</button></div>
    <div class="mt">${list || '<p class="hint" style="margin:0">Nenhum hábito ainda.</p>'}</div></div>`;
}

function toolLembretes() {
  const list = sortedReminders().map(r => `<div class="top3 ${r.done ? 'muted' : ''}"><div class="row"><div class="grow">${input('reminders', r.id, 't_title', r.title)}</div><button class="icon" onclick="A.toggleReminder('${r.id}')" style="color:${r.done ? 'var(--ok)' : 'var(--muted)'}">${r.done ? '✔' : '○'}</button><button class="icon" onclick="A.removeReminder('${r.id}')">×</button></div>
    <div class="small mt">${dueLabel(r.at)}${r.note ? ' · ' + h(r.note) : ''}</div></div>`).join('');
  return `<div class="card"><h2>Novo lembrete</h2><p class="hint">Escreva com verbo: "Confirmar consulta no app", não só "Consulta".</p>
    <div class="stack"><input type="text" id="remTitle" placeholder="O que fazer"><input type="datetime-local" id="remAt"><input type="text" id="remNote" placeholder="Detalhe (opcional)"><button onclick="A.addReminder()">Adicionar</button></div></div>
    <div class="card"><h2>Todos os lembretes</h2>${list || '<p class="hint" style="margin:0">Nenhum lembrete.</p>'}</div>`;
}

function scrSemana() { return ['Semana', 'Resumo, revisão de 15 minutos e as 3 da semana', weekSummaryCard(false) + toolSemana()]; }
function scrIdeias() { return ['Ideias', 'Ideia boa fora de hora vem para cá', toolIdeias()]; }
function scrHabitos() { return ['Hábitos', 'Rastreador sem data', toolHabitos()]; }
function scrLembretes() { return ['Lembretes', 'Com verbo e com horário', toolLembretes()]; }
function scrAgenda() { return ['Agenda', 'Seus compromissos e a agenda da casa', agendaCard()]; }

// ---------------- Tela: Assistente ----------------
function md(text) {
  // Markdown mínimo e seguro: escapa tudo, depois aplica negrito e quebras de linha.
  return h(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

function buildContext() {
  const p = S.page.id === todayKey() ? S.page : null;
  const lines = [];
  lines.push(`Sobre a pessoa: ${S.settings.about || '(não preenchido)'}`);
  if (S.calPerm === 'granted') {
    const hk = S.settings.houseCalendarId, ct = e => (hk && e.calendarId === hk ? ' [Casa]' : '');
    lines.push('Agenda de hoje: ' + ((S.events || []).map(e => `${e.allDay ? 'dia todo' : hm(e.start) + '–' + hm(e.end)} ${e.title}${ct(e)}`).join('; ') || 'nada'));
    lines.push('Próximos 7 dias: ' + ((S.eventsWeek || []).slice(0, 20).map(e => `${fmtDateKey(todayKey(new Date(e.start)))} ${e.allDay ? 'dia todo' : hm(e.start)} ${e.title}${ct(e)}`).join('; ') || 'nada'));
    lines.push(hk ? `Agenda da casa: "${S.settings.houseCalendarTitle || ''}" (eventos marcados com [Casa]).` : 'Agenda da casa: não configurada.');
  } else lines.push('Agenda do celular: não conectada.');
  if (p) {
    lines.push(`Página de hoje: humor ${moodOf(p.mood) ? moodOf(p.mood)[1].toLowerCase() : 'não marcado'}; energia ${p.energy || 'não marcada'}; ${p.bad ? 'marcado como DIA RUIM' : 'dia normal'}.`);
    const mw = lastDays().map(k => { const pg = pageFor(k); return pg && pg.mood ? `${fmtDateKey(k)}: ${moodOf(pg.mood)[1].toLowerCase()}` : null; }).filter(Boolean);
    if (mw.length) lines.push('Humor nos últimos 7 dias: ' + mw.join('; '));
    lines.push('As 3 do dia: ' + p.top3.map((t, i) => `${i + 1}) ${t.t || '(vazio)'}${t.s ? ' — 1º passo: ' + t.s : ''}${t.d ? ' [feito]' : ''}`).join(' | '));
    if (p.dump) lines.push('Descarrego mental: ' + p.dump.slice(0, 1200));
    if (p.done.length) lines.push('Feito hoje: ' + p.done.join('; '));
    if (S.settings.shareBody) {
      const body = S.settings.bodyChecks.map(c => `${c}: ${p.body[c] ? 'sim' : 'não'}`).join('; ');
      if (body) lines.push('Corpo em dia: ' + body);
    } else {
      const n = S.settings.bodyChecks.filter(c => p.body[c]).length;
      lines.push(`Corpo em dia: ${n} de ${S.settings.bodyChecks.length} itens marcados (detalhes não compartilhados).`);
    }
  }
  if (S.meds.length) {
    const share = !!S.settings.shareBody;
    const items = S.meds.filter(m => share || m.kind !== 'remedio').map(m => `${m.name} [${m.kind || 'remedio'}]: ${(m.times || []).join(', ') || 'sem horário'}`);
    const hidden = share ? 0 : S.meds.filter(m => m.kind === 'remedio').length;
    lines.push('Itens de Remédios e água: ' + (items.join('; ') || 'nenhum visível') + (hidden ? ` (+${hidden} remédio(s) com nomes não compartilhados)` : ''));
  }
  const dz = dosesForDay();
  if (dz.length) {
    const tk = (p && p.doses) || {};
    lines.push(S.settings.shareBody
      ? 'Remédios e água hoje: ' + dz.map(d => `${d.time} ${d.name}${tk[d.key] ? ' (tomado)' : ''}`).join('; ')
      : `Remédios e água hoje: ${dz.filter(d => tk[d.key]).length} de ${dz.length} horários marcados (detalhes não compartilhados).`);
  }
  lines.push('Rotinas: ' + S.routines.map(r => { const run = runOf(r); return `${r.title} (${run.checks.filter(Boolean).length}/${r.steps.length} hoje, ${timesLast7(r.id)}x em 7 dias${r.notifyTime ? ', lembrete ' + r.notifyTime : ''})`; }).join('; '));
  const kit = Object.values(S.strat).filter(s => s.fav).map(s => `${s.id}${s.status ? ' (' + s.status + ')' : ''}`);
  lines.push('Meu kit (números do guia): ' + (kit.join(', ') || 'vazio'));
  const rem = sortedReminders().filter(r => !r.done).slice(0, 12).map(r => `${r.title} — ${dueLabel(r.at)}`);
  lines.push('Lembretes pendentes: ' + (rem.join('; ') || 'nenhum'));
  const act = activeTasks().slice(0, 20).map(t => {
    const q = quadOf(t), real = realSteps(t), nx = nextStep(t);
    return `- ${t.title} | ${q ? QUADS[q][0] : 'sem classificar'}${taskCat(t) ? ' | ' + taskCat(t).name : ''}${t.time ? ' | ' + whenText(t) : ''}${t.place ? ' | local: ' + t.place : ''}${t.rep ? ' | repete ' + repLabel(t.rep) : ''} | fase ${PHASES.find(([k]) => k === phaseOf(t))[1]} | ${real.filter(x => x.d).length}/${real.length} passos${t.deadline ? ' | ' + deadlineLabel(t) : ''}${t.what ? ' | pronto quando: ' + t.what : ''}${nx ? ' | próximo passo: ' + nx.t : ''}`;
  });
  lines.push('Tarefas na matriz de prioridades:' + (act.length ? '\n' + act.join('\n') : ' nenhuma'));
  const pk = S.projects.filter(isParked);
  if (pk.length) lines.push('Repetições agendadas (fora da matriz até 3 dias antes): ' + pk.map(t => `${t.title} (${repLabel(t.rep)}, próxima ${whenText(t)})`).join('; '));
  if (cats().length) lines.push('Categorias de tarefa: ' + cats().map(c => c.name).join(', '));
  const ws = weekStats();
  lines.push(`Últimos 7 dias: ${ws.doneTasks.length} tarefas concluídas${ws.doneTasks.length ? ' (' + ws.doneTasks.slice(0, 10).map(t => t.title).join('; ') + ')' : ''}; 3 do dia: ${ws.top} de ${ws.topT} feitas; ${ws.feitos} itens no Feito hoje${ws.best ? '; dia que mais rendeu: ' + fmtDateKey(ws.best) : ''}.`);
  const sd = S.projects.filter(t => !t.done && t.someday).length;
  if (sd) lines.push(`Talvez um dia: ${sd} tarefas guardadas.`);
  if (S.habits.length) lines.push('Hábitos: ' + S.habits.map(hb => `${hb.t} ${(hb.marks || []).filter(Boolean).length}/7`).join('; '));
  const now = new Date().toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return { name: S.settings.name, now, tone: S.settings.aiTone || 'direto', text: lines.join('\n') };
}

// Campos de captura que o assistente pode mandar ao criar ou mudar uma tarefa.
function applyAiExtras(t, x) {
  const has = k => x[k] !== undefined && x[k] !== null;
  if (has('hora')) { const m = /^(\d{1,2}):(\d{2})$/.exec(x.hora || ''); t.time = m ? `${pad(+m[1])}:${m[2]}` : ''; }
  if (has('local')) t.place = String(x.local || '').trim();
  if (has('avisar_antes_min')) t.alertMin = Math.max(0, Math.round(Number(x.avisar_antes_min) || 0));
  if (has('categoria')) { const c = catByName(x.categoria); t.cat = c ? c.id : null; }
  if (has('repete')) {
    t.rep = x.repete === 'nao' ? null : repFromAI(x);
    if (t.rep) { t.series = t.series || t.id; t.spawned = false; }
  }
  if ((t.time || t.rep) && !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '')) { const c = finalizeCapture({ time: t.time, rep: t.rep, date: '' }); t.deadline = c.date; }
  if (t.place && !has('avisar_antes_min') && t.alertMin == null) t.alertMin = 30;
}

async function execTool(name, input) {
  if (S.page.id !== todayKey()) await loadPage(todayKey());
  const p = S.page;
  switch (name) {
    case 'definir_tres_do_dia': {
      (input.itens || []).slice(0, 3).forEach((it, i) => { p.top3[i] = { t: it.prioridade || '', s: it.primeiro_passo || '', d: false }; });
      await savePage();
      return 'As 3 do dia foram definidas.';
    }
    case 'adicionar_lembrete': {
      const r = { id: uid(), title: input.titulo, at: input.quando || '', note: input.detalhe || '', done: false };
      S.reminders.push(r); await db.put('reminders', r);
      if (r.at) await N.scheduleOnce(r.id, 'Lembrete', r.title, new Date(r.at));
      return `Lembrete criado: ${r.title}${r.at ? ' (' + dueLabel(r.at) + ')' : ''}.`;
    }
    case 'criar_tarefa_grande': {
      const t = newTaskObj(String(input.titulo || 'Tarefa'), { pronto_quando: input.pronto_quando, importante: input.importante, urgente: input.urgente, prazo: input.prazo, passos: (input.passos || []).map(x => ({ texto: x.texto, minutos: x.minutos })), preciso_de: input.preciso_de });
      t.ready = realSteps(t).length > 0 && !!(t.what || '').trim();
      applyAiExtras(t, input);
      S.projects.unshift(t); await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks();
      const q = quadOf(t);
      return `Tarefa criada: ${t.title}${q ? ` (${QUADS[q][0]})` : ''}, ${realSteps(t).length} passos${t.time ? `, ${whenText(t)}` : ''}${t.rep ? `, ${repLabel(t.rep)}` : ''}.`;
    }
    case 'atualizar_tarefa': {
      const t = findTask(input.tarefa); if (!t) throw new Error(`Não achei a tarefa "${input.tarefa}".`);
      if (input.novo_titulo) t.title = String(input.novo_titulo);
      applyPlan(t, { pronto_quando: input.pronto_quando, importante: input.importante, urgente: input.urgente, passos: input.passos, prazo: input.prazo }, false);
      if (input.prazo === '') t.deadline = '';
      if (typeof input.urgente === 'boolean' && !input.urgente) t.urg = null;
      if (Array.isArray(input.passos) && input.passos.length && (t.what || '').trim()) t.ready = true;
      if (input.talvez_um_dia) t.someday = true;
      applyAiExtras(t, input);
      await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); await syncTopForTask(t);
      if (input.concluir) { const nx = await finishTask(t); return `Tarefa concluída: ${t.title}.${nx ? ' ' + nextLabel(nx) + '.' : ''}`; }
      return input.talvez_um_dia ? `${t.title} foi para Talvez um dia.` : `Tarefa atualizada: ${t.title}.`;
    }
    case 'marcar_passo': {
      const t = findTask(input.tarefa); if (!t) throw new Error(`Não achei a tarefa "${input.tarefa}".`);
      const real = realSteps(t); const st = real[Number(input.passo) - 1];
      if (!st) throw new Error(`A tarefa tem ${real.length} passos.`);
      st.d = input.feito !== false;
      if (!nextStep(t)) await finishTask(t);
      else { await db.put('projects', t); await syncTopForTask(t); }
      return t.done ? `Último passo feito: ${t.title} concluída.` : `Passo ${input.passo} de ${t.title} ${st.d ? 'feito' : 'desmarcado'}.`;
    }
    case 'guardar_ideia': {
      const i = { id: uid(), t: input.texto, when: input.quando_rever || '', at: Date.now(), done: false };
      S.ideas.unshift(i); await db.put('ideas', i);
      return `Ideia guardada: ${i.t}.`;
    }
    case 'registrar_feito': {
      p.done.push(input.texto); await savePage();
      return `Registrado em Feito hoje: ${input.texto}.`;
    }
    case 'definir_horarios': {
      const nome = String(input.nome || '').trim(); if (!nome) throw new Error('Informe o nome do item.');
      const times = (input.horarios || []).map(t => { const m = String(t).match(/^(\d{1,2}):(\d{2})$/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${pad(Number(m[1]))}:${m[2]}` : null; }).filter(Boolean);
      if (!times.length) throw new Error('Nenhum horário válido (use HH:MM).');
      const norm = x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      let med = S.meds.find(m => norm(m.name) === norm(nome)) || S.meds.find(m => norm(m.name).includes(norm(nome)) || norm(nome).includes(norm(m.name)));
      const kind = input.tipo || (med && med.kind) || (/^\s*agua/.test(norm(nome)) ? 'agua' : 'remedio');
      if (!med) { med = { id: uid(), name: nome, kind, times: [], carry: kind === 'remedio', order: S.meds.length }; S.meds.push(med); }
      med.kind = kind;
      med.times = [...new Set([...(input.modo === 'adicionar' ? (med.times || []) : []), ...times])].sort();
      await db.put('meds', med);
      if (N.isNative() && !S.notif) S.notif = await N.notificationsAllowed(true);
      await syncDoses();
      return `Horários diários de "${med.name}": ${med.times.join(', ')}.`;
    }
    case 'criar_compromisso_casa': {
      return await createHouseEvent({ title: input.titulo, start: new Date(input.inicio), durMin: input.duracao_min || 60, location: input.local || '' });
    }
    case 'adicionar_ao_kit': {
      const n = Number(input.numero);
      if (!(n >= 1 && n <= 100)) throw new Error('Número fora do guia.');
      const o = objFor('strategies', n); o.fav = true; if (!o.status) o.status = 'quero'; await db.put('strategies', o);
      return `Estratégia ${n} adicionada ao Meu kit.`;
    }
    default: throw new Error('Ferramenta desconhecida: ' + name);
  }
}

const SUGGEST = [['Planeja meu dia', 0], ['Estou travado', 1], ['Fatia uma tarefa', 2], ['Fecha meu dia', 5], ['Resumo da semana', 6], ['Dia ruim', 3], ['Qual estratégia testar?', 4]];
function scrAssistente() {
  const prov = keyStore.provider();
  const P = PROVIDERS[prov];
  const key = keyStore.get();
  const bar = `<header class="appbar"><button class="iconbtn" onclick="A.back()" aria-label="Fechar o assistente">${svg('close')}</button><div class="ttl"><h1>Assistente</h1><div class="sub">Vê sua agenda e o seu dia</div></div>${key ? `<span class="chip">${h(P.label.split(' (')[0])}</span>` : ''}</header>`;
  if (!key) {
    return { raw: bar + `<main><div class="card"><h2>Escolha a IA</h2>
      <div class="pills">${Object.entries(PROVIDERS).map(([k, v]) => `<button class="pill ${prov === k ? 'on' : ''}" onclick="A.setProvider('${k}')">${v.label}</button>`).join('')}</div>
      <p class="hint mt">${h(P.billing)} A chave fica só neste celular e não vai no backup.</p>
      ${P.warning ? `<div class="alert" style="margin-bottom:10px">${h(P.warning)}</div>` : ''}
      <ol class="small" style="padding-left:18px;margin:0 0 10px">${P.howTo.map(x => `<li>${h(x)}</li>`).join('')}</ol>
      ${keyLink(P)}
      <input class="mt" type="text" id="apiKey" placeholder="${h(P.keyHint)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="mt" style="width:100%" onclick="A.saveKey()">Salvar chave</button></div></main>` };
  }
  const msgs = S.chat.display;
  const list = msgs.map(m => m.role === 'user'
    ? `<div class="bubble me">${md(m.text)}</div>`
    : `<div class="bubble ai">${md(m.text || '…')}${(m.actions || []).length ? `<div class="mt">${m.actions.map(x => `<span class="tag" style="margin:2px 4px 2px 0">✓ ${h(x)}</span>`).join('')}</div>` : ''}</div>`).join('');
  const empty = !msgs.length ? `<div class="card"><p style="margin:0;font-weight:800">Fale ou escreva o que está rolando.</p><p class="hint mt" style="margin-bottom:0">Ele vê sua agenda, a página de hoje, as rotinas, o kit e os lembretes. Pode criar e fatiar tarefas na matriz, marcar passos, montar as 3 do dia, criar lembretes e organizar o seu descarrego.</p></div>` : '';
  const thinking = S.sending ? '<div class="bubble ai"><span class="muted">Pensando…</span></div>' : '';
  const dis = S.sending ? 'disabled' : '';
  const comp = `<div class="composer"><div class="suggest">${SUGGEST.map(([l, i]) => `<button onclick="A.send(${h(JSON.stringify(QUICK[i]))})" ${dis}>${l}</button>`).join('')}</div>
    <div class="row"><textarea id="chatInput" rows="1" aria-label="Mensagem" placeholder="Escreva ou toque no microfone" ${dis}></textarea><button class="send" onclick="A.send()" aria-label="Enviar" ${dis}>${svg('send', 20, 2.2)}</button></div>
    <div class="microw"><button class="ghost mini" style="width:118px;white-space:nowrap;font-size:13px;padding:7px 6px" onclick="A.newChat()">Nova conversa</button><button class="micbig" onclick="A.voiceSend()" aria-label="Falar com o assistente" ${dis}>${svg('mic', 28)}</button><span class="small" style="width:118px;text-align:right">Toque e fale</span></div></div>`;
  return { raw: bar + `<main class="chat"><div class="msgs" id="chatList">${empty}${list}${thinking}</div></main>` + comp };
}

// ---------------- Bloco de foco ----------------
const FOCUS_KEY = 'focus_state';
const PREP = ['Água por perto e banheiro antes', 'Só uma aba ou janela aberta', 'Celular virado ou longe da mão'];
const RING_C = 2 * Math.PI * 104;
const fmtClock = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
function saveFocus() { try { if (S.focus) localStorage.setItem(FOCUS_KEY, JSON.stringify(S.focus)); else localStorage.removeItem(FOCUS_KEY); } catch (e) { /* sem armazenamento */ } }
function loadFocus() {
  try { S.focus = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null'); } catch (e) { S.focus = null; }
  if (S.focus && S.focus.phase === 'run' && S.focus.end <= Date.now()) S.focus.phase = S.focus.mode === 'pausa' ? 'breakdone' : 'done';
}
function focusLeft() { const f = S.focus; if (!f) return 0; return f.phase === 'paused' ? f.left : f.phase === 'run' ? Math.max(0, f.end - Date.now()) : 0; }
const focusRunning = () => !!(S.focus && ['run', 'paused'].includes(S.focus.phase));
function focusSoundMode() { const s = S.settings; return s.focusSound === false ? 'mudo' : s.focusSilent ? 'alarme' : 'som'; }
async function scheduleFocusAlerts() {
  const f = S.focus;
  if (!f || f.phase !== 'run') { await N.cancelFocus(); return; }
  const pausa = f.mode === 'pausa';
  let ok = false;
  try {
    ok = await N.scheduleFocus({
      end: f.end, warnAt: !pausa && S.settings.focusWarn && f.total > 5 * 60000 ? f.end - 2 * 60000 : null,
      title: pausa ? 'Pausa acabou' : 'Bloco de foco terminou', body: pausa ? 'Bora para o próximo bloco?' : `${f.label ? f.label + '. ' : ''}Hora da pausa de 5 min.`, mode: focusSoundMode(),
    });
  } catch (e) { ok = false; }
  if (S.focus) { S.focus.native = ok; saveFocus(); }
  if (N.isNative() && !ok && !S._warnedNotif) { S._warnedNotif = true; toast('Ative os lembretes em Ajustes para o sino tocar com a tela apagada'); }
}
let audioCtx = null;
function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) audioCtx = new AC();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* sem áudio */ }
}
// Sino suave: três toques com harmônicos que somem devagar.
function chime() {
  try {
    primeAudio(); if (!audioCtx) return;
    const t0 = audioCtx.currentTime + 0.05;
    for (const off of [0, 0.95, 1.9]) {
      for (const [mult, gain, decay] of [[1, 0.5, 1.4], [2, 0.22, 0.9], [2.76, 0.14, 0.6], [5.4, 0.06, 0.3]]) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 784 * mult;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(gain, t0 + off + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + decay * 1.6);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + off); o.stop(t0 + off + decay * 1.6 + 0.05);
      }
    }
  } catch (e) { /* sem áudio */ }
}
function focusTick() {
  clearInterval(A._fiv);
  if (!S.focus || S.focus.phase !== 'run') return;
  A._fiv = setInterval(() => {
    const f = S.focus;
    if (!f || f.phase !== 'run') { clearInterval(A._fiv); return; }
    const left = focusLeft();
    if (left <= 0) { focusFinished(); return; }
    const el = document.getElementById('ftime'); if (el) el.textContent = fmtClock(left);
    const ring = document.getElementById('fring'); if (ring) ring.setAttribute('stroke-dasharray', `${(RING_C * left / f.total).toFixed(1)} ${RING_C.toFixed(1)}`);
  }, 1000);
}
function focusFinished() {
  const f = S.focus; clearInterval(A._fiv);
  if (!f) return;
  f.phase = f.mode === 'pausa' ? 'breakdone' : 'done'; f.answered = ''; f.rang = S.settings.focusSound !== false;
  saveFocus();
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); } catch (e) { /* sem vibração */ }
  if (!f.native && S.settings.focusSound !== false) chime();
  if (S.tab !== 'foco') { if (!['assistente', 'ajustes'].includes(S.tab)) S.prevTab = S.tab; S.tab = 'foco'; S.drawer = false; }
  const active = document.activeElement;
  if (!active || !['INPUT', 'TEXTAREA'].includes(active.tagName)) render();
}

function stepLabel(f) {
  const t = f.taskId && S.projects.find(x => x.id === f.taskId);
  if (!t || f.stepIdx == null) return 'Primeiro passo';
  const real = realSteps(t);
  return `Passo ${real.indexOf(t.steps[f.stepIdx]) + 1} de ${real.length}`;
}
function scrFoco() {
  const f = S.focus;
  const head = (title, sub) => `<header class="appbar"><button class="iconbtn" onclick="A.back()" aria-label="Voltar">${svg('back')}</button><div class="ttl"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div></header>`;
  const prep = arr => `<div class="fcard" style="padding:4px 16px">${PREP.map((t, i) => check(!!(arr || [])[i], h(t), `A.focusPrep(${i})`)).join('')}</div>`;
  const park = () => S.parkOpen
    ? `<div class="fcard"><p class="eyebrow">Estacionar ideia</p><div class="row mt"><input class="grow" type="text" id="parkInput" placeholder="A ideia, do jeito que vier" onkeydown="if(event.key==='Enter')A.parkSave()"><button class="fbtn" onclick="A.parkSave()">Guardar</button></div></div>`
    : `<button class="coral" style="width:100%;margin-top:14px;height:54px;display:flex;align-items:center;justify-content:center;gap:10px" onclick="A.parkToggle()">${svg('ideias', 20)}Estacionar uma ideia sem sair do foco</button>`;
  const ring = (frac, center) => `<div class="ringwrap"><svg aria-hidden="true" width="240" height="240" viewBox="0 0 240 240"><circle cx="120" cy="120" r="104" fill="none" stroke="#1e3532" stroke-width="14"/><circle id="fring" cx="120" cy="120" r="104" fill="none" stroke="#6fc2b8" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(RING_C * frac).toFixed(1)} ${RING_C.toFixed(1)}" transform="rotate(-90 120 120)"/></svg><div class="center">${center}</div></div>`;

  if (!f) {
    const min = S.focusMin || 25;
    const tops = S.page.id === todayKey() ? S.page.top3.map((t, i) => [t, i]).filter(([t]) => (t.t || '').trim() && !t.d) : [];
    const pick = S.focusPick;
    return { raw: `<div class="focus">${head('Bloco de foco', 'Escolha o tempo e no que vai focar')}
      <div class="fcard"><p class="eyebrow">Tempo</p><div class="pills mt">${[15, 25, 50].map(m => `<button class="pill ${min === m ? 'on' : ''}" onclick="A.focusMinSet(${m})">${m} min</button>`).join('')}</div></div>
      <div class="fcard"><p class="eyebrow">No que vou focar</p>${tops.length ? `<div class="pills mt">${tops.map(([t, i]) => `<button class="pill ${pick === i ? 'on' : ''}" onclick="A.focusPickSet(${i})">${h(t.t)}</button>`).join('')}</div>` : ''}
        <input class="mt" type="text" id="focusLabel" placeholder="${tops.length ? 'Ou escreva outra coisa' : 'Ex.: relatório do mês'}" value="${h(S.focusDraft || '')}" oninput="A.focusDraftSet(this.value)"></div>
      <p class="eyebrow" style="margin:18px 4px 0">Antes de começar</p>${prep(S.focusPrepDraft)}
      <button class="fbtn" style="width:100%;margin-top:16px;height:56px;font-size:16px" onclick="A.focusGo()">Começar ${min} min</button></div>` };
  }

  const pausa = f.mode === 'pausa';
  if (f.phase === 'run' || f.phase === 'paused') {
    const left = focusLeft();
    const endAt = f.phase === 'run' ? hm(f.end) : '';
    const sub = f.phase === 'paused' ? 'Pausado' : f.native ? `O sino toca às ${endAt}, mesmo com a tela apagada` : `Termina às ${endAt}`;
    const center = `<p class="ftime" id="ftime">${fmtClock(left)}</p><p class="muted2" style="margin:0;font-size:14px">${f.phase === 'paused' ? 'pausado' : `de ${Math.round(f.total / 60000)} minutos`}</p>`;
    const mainBtn = f.phase === 'run'
      ? `<button class="fbtn main" onclick="A.focusPause()" aria-label="Pausar"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg></button>`
      : `<button class="fbtn main" onclick="A.focusResume()" aria-label="Continuar"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l12 7-12 7z"/></svg></button>`;
    return { raw: `<div class="focus">${head(pausa ? 'Pausa' : 'Bloco de foco', sub)}
      ${!pausa && f.label ? `<div class="fcard"><p class="eyebrow">Agora</p><p style="margin:4px 0 0;font-size:17px;font-weight:700">${h(f.label)}</p>${f.step ? `<p class="muted2" style="margin:2px 0 0;font-size:14px">${stepLabel(f)}: ${h(f.step)}</p>` : ''}${f.taskId && hasAI() && f.step ? `<button class="outline mini" style="margin-top:10px" onclick="A.taskStuck('${f.taskId}')" ${S.taskBusy ? 'disabled' : ''}>${S.taskBusy ? 'Quebrando…' : 'Travei neste passo'}</button>` : ''}</div>` : ''}
      ${pausa ? '<div class="fcard"><p class="eyebrow">Pausa</p><p style="margin:4px 0 0;font-size:15px">Levante, beba água, olhe longe. Sem tela nova.</p></div>' : ''}
      ${ring(f.total ? left / f.total : 0, center)}
      <div class="fctl"><button class="outline side" onclick="A.focusPlus(5)">+5 min</button>${mainBtn}<button class="outline side" onclick="A.focusStop()">Parar</button></div>
      ${pausa ? '' : prep(f.prep)}${pausa ? '' : park()}</div>` };
  }

  if (f.phase === 'breakdone') {
    return { raw: `<div class="focus">${head('Pausa acabou', '')}
      ${ring(1, `<p style="margin:0;font-size:20px;font-weight:800">Pausa feita</p>`)}
      <div style="margin-top:28px;display:flex;flex-direction:column;gap:10px"><button class="fbtn" style="height:54px;font-size:16px" onclick="A.focusAgain()">Outro bloco de ${S.focusMin || 25} min</button><button class="outline" style="height:48px" onclick="A.focusStop()">Encerrar</button></div></div>` };
  }

  // phase === 'done'
  const mins = Math.round(f.total / 60000);
  const asks = f.taskId && f.step ? f.step : f.label;
  const question = asks && !f.answered
    ? `<div class="fcard"><p class="eyebrow">${f.taskId && f.step ? `${stepLabel(f)} · terminou?` : 'Terminou?'}</p><p style="margin:4px 0 10px;font-size:16px;font-weight:700">${h(asks)}</p><div class="row"><button class="fbtn grow" onclick="A.focusDone(true)">Sim, feito</button><button class="outline grow" onclick="A.focusDone(false)">Ainda não</button></div></div>`
    : f.answered === 'sim' ? `<div class="fcard"><p style="margin:0;font-weight:700">${f.taskId ? (f.nextText ? `Anotado. Depois da pausa: ${h(f.nextText)}` : 'Tarefa concluída. Boa!') : 'Anotado em Feito hoje.'}</p></div>` : '';
  return { raw: `<div class="focus">${head('Bloco concluído', f.rang ? (f.native ? 'O sino tocou' : 'Tocou o sino') : '')}
    ${ring(1, `${svg('check', 34, 2.4)}<p style="margin:0;font-size:20px;font-weight:800">${mins} min feitos</p>`)}
    ${question}
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px"><button class="coral" style="height:54px;font-size:16px" onclick="A.focusBreak(5)">Começar pausa de 5 min</button>
    <div class="row" style="gap:10px"><button class="outline grow" style="height:48px" onclick="A.focusPlus(5)">+5 min de foco</button><button class="outline grow" style="height:48px" onclick="A.focusStop()">Encerrar</button></div></div></div>` };
}

// ---------------- Tela: Ajustes ----------------
const sw = (on, label, act) => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${h(label)}" onclick="${act}"></button>`;
function appearanceCard() {
  const cur = S.settings.theme || 'auto';
  const lines = (bg, bar, card) => `<span style="flex:1;background:${bg};padding:8px 6px;display:flex;flex-direction:column;gap:4px"><span style="height:7px;border-radius:3px;background:${bar}"></span><span style="height:13px;border-radius:4px;background:${card}"></span><span style="height:13px;border-radius:4px;background:${card}"></span></span>`;
  const opt = (k, l, pv) => `<button class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}" onclick="A.setTheme('${k}')"><span class="pv">${pv}</span>${l}</button>`;
  return `<div class="card"><h2>Aparência</h2><div class="themes">${opt('auto', 'Automático', '<span style="flex:1;background:#f4f3ef"></span><span style="flex:1;background:#0f1716"></span>')}${opt('claro', 'Claro', lines('#f4f3ef', '#1f5f5b', '#fdfcf9'))}${opt('escuro', 'Escuro', lines('#0f1716', '#6fc2b8', '#182220'))}</div>
    <p class="hint mt" style="margin-bottom:0">Automático acompanha o modo escuro do celular. O bloco de foco é sempre escuro.</p></div>`;
}
function pinSettingsCard() {
  const s = S.settings;
  const on = s.pinOn !== false;
  return `<div class="card" style="padding-top:6px;padding-bottom:6px"><h2 style="margin-top:10px">Barra de notificações</h2>
    <div class="setrow"><div class="lb">Próximo fixo na barra<div class="small" style="font-weight:500">Fica lá até você concluir, sem som</div></div>${sw(on, 'Próximo fixo na barra', "A.setPinOpt('pinOn')")}</div>
    ${on ? `<div class="setrow"><div class="lb">Incluir as 3 do dia<div class="small" style="font-weight:500">Mostra o passo atual com o botão Feito</div></div>${sw(s.pinTasks !== false, 'Incluir as 3 do dia', "A.setPinOpt('pinTasks')")}</div>` : ''}</div>`;
}
function prioSettingsCard() {
  const s = S.settings;
  return `<div class="card" style="padding-top:6px;padding-bottom:6px"><h2 style="margin-top:10px">Prioridades</h2>
    <div class="setrow"><div class="lb">Prazo perto = urgente<div class="small" style="font-weight:500">Vence até amanhã, sobe sozinha</div></div>${sw(s.prioAuto !== false, 'Prazo perto vira urgente', "A.setPrioOpt('prioAuto')")}</div>
    <div class="setrow"><div class="lb">Sugerir as 3 do dia</div>${sw(s.prioSuggest !== false, 'Sugerir as 3 do dia', "A.setPrioOpt('prioSuggest')")}</div>
    <div class="setrow"><div class="lb">IA fatia ao adicionar<div class="small" style="font-weight:500">Precisa da chave de IA</div></div>${sw(s.autoSlice !== false, 'IA fatia ao adicionar', "A.setPrioOpt('autoSlice')")}</div></div>`;
}
function focusSettingsCard() {
  const s = S.settings;
  const soundOn = s.focusSound !== false;
  return `<div class="card" style="padding-top:6px;padding-bottom:6px"><h2 style="margin-top:10px">Bloco de foco</h2>
    <div class="setrow"><div class="lb">Som ao terminar</div>${sw(soundOn, 'Som ao terminar', "A.setFocusOpt('focusSound')")}</div>
    ${soundOn ? `<div class="setrow"><div class="lb">Tocar no silencioso<div class="small" style="font-weight:500">Usa o volume de alarme</div></div>${sw(!!s.focusSilent, 'Tocar no silencioso', "A.setFocusOpt('focusSilent')")}</div>` : ''}
    <div class="setrow"><div class="lb">Aviso 2 min antes do fim<div class="small" style="font-weight:500">Só vibra</div></div>${sw(!!s.focusWarn, 'Aviso 2 min antes do fim', "A.setFocusOpt('focusWarn')")}</div>
    <div class="setrow"><div class="lb">Som: sino</div><button class="ghost mini" onclick="A.testSound()">Testar</button></div></div>`;
}

function catsCard() {
  const list = cats().map((c, i) => `<div class="row" style="margin-bottom:8px"><button class="cswatch" style="background:${h(c.color)}" onclick="A.cycleCatColor(${i})" aria-label="Trocar a cor de ${h(c.name)}"></button><input class="grow" type="text" value="${h(c.name)}" oninput="A.renameCat(${i}, this.value)"><button class="icon" onclick="A.removeCat(${i})" aria-label="Tirar ${h(c.name)}">×</button></div>`).join('');
  return `<div class="card"><h2>Categorias</h2><p class="hint">Aparecem como filtro na matriz. Toque na bolinha para trocar a cor.</p>${list}
    <div class="row mt"><input class="grow" type="text" id="catInput" placeholder="Nova categoria" onkeydown="if(event.key==='Enter')A.addCat()"><button onclick="A.addCat()" aria-label="Adicionar categoria">+</button></div></div>`;
}
function moodSettingsCard() {
  const s = S.settings;
  return `<div class="card" style="padding-top:6px;padding-bottom:6px"><h2 style="margin-top:10px">Humor e semana</h2>
    <div class="setrow"><div class="lb">Check-in de humor<div class="small" style="font-weight:500">Na tela Hoje, com a frase do dia</div></div>${sw(s.moodOn !== false, 'Check-in de humor', "A.setPrioOpt('moodOn')")}</div>
    <div class="setrow"><div class="lb">Resumo da semana<div class="small" style="font-weight:500">Domingo às 19h, com aviso</div></div>${sw(s.weekSummary !== false, 'Resumo da semana', "A.setWeekOpt()")}</div></div>`;
}
const TONES = [['direto', 'Direto'], ['encorajador', 'Encorajador'], ['humor', 'Bem-humorado']];

const REPO_URL = 'https://github.com/cidedson/tdah-vida-real';
function aboutCard() {
  const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:700">${label} ↗</a>`;
  return `<div class="card"><h2>Sobre o app</h2>
    <p style="margin:0 0 8px"><b>TDAH na Vida Real</b> · versão ${h(S.appVersion || VERSION)}</p>
    <p class="hint">Guia, planner, rotinas e assistente para quem tem TDAH. Sem conta e sem servidor: tudo fica neste celular, e o backup vai para o seu Google Drive.</p>
    <p class="hint">O app ajuda a organizar a rotina, mas não substitui avaliação nem acompanhamento médico ou psicológico. Em crise, ligue 188 (CVV) ou 192 (SAMU).</p>
    <p class="small" style="margin:0 0 6px">Código, novidades e versões: ${ext(REPO_URL, 'GitHub')} · ${ext(REPO_URL + '/releases', 'baixar a última versão')}</p>
    <p class="small" style="margin:0">Feito com Capacitor. Fonte Plus Jakarta Sans (licença SIL OFL 1.1).</p></div>`;
}
function scrAjustes() {
  const s = S.settings;
  const body = s.bodyChecks.map((c, i) => `<div class="row" style="margin-bottom:6px"><input class="grow" type="text" value="${h(c)}" oninput="A.editBody(${i}, this.value)"><button class="icon" onclick="A.removeBody(${i})">×</button></div>`).join('');
  const calTxt = !N.isNative() ? 'Disponível no app Android.' : S.calPerm === 'granted' ? 'Conectada. O app lê todas as agendas sincronizadas no celular.' : 'Não conectada.';
  const last = s.lastBackup ? new Date(s.lastBackup).toLocaleDateString('pt-BR') : 'nunca';
  const out = `
  <button class="ghost" style="width:100%;margin-bottom:12px" onclick="A.startOnboarding()">Configuração guiada (refazer as perguntas)</button>
  ${appearanceCard()}
  ${focusSettingsCard()}
  ${pinSettingsCard()}
  ${prioSettingsCard()}
  ${moodSettingsCard()}
  ${catsCard()}
  <div class="card"><h2>Seu nome</h2>${input('settings', 'main', 'name', s.name, 'Como quer ser chamado')}</div>
  <div class="card"><h2>Sobre mim</h2><p class="hint">O assistente lê este texto para entender sua rotina. Só sai do celular quando você usa o assistente.</p>${area('settings', 'main', 'about', s.about || '', 'Trabalho, família, horários, o que mais te trava…', 6)}</div>
  <div class="card"><h2>Assistente de IA</h2>
    <div class="pills">${Object.entries(PROVIDERS).map(([k, v]) => `<button class="pill ${keyStore.provider() === k ? 'on' : ''}" onclick="A.setProvider('${k}')">${v.label}</button>`).join('')}</div>
    <p class="hint mt">${keyStore.get() ? 'Chave salva neste celular.' : 'Sem chave. Toque no microfone do meio para conectar.'} ${h(PROVIDERS[keyStore.provider()].billing)}</p>
    ${PROVIDERS[keyStore.provider()].warning ? `<div class="alert" style="margin-bottom:10px">${h(PROVIDERS[keyStore.provider()].warning)}</div>` : ''}
    <h3>Tom do assistente</h3><div class="pills">${TONES.map(([k, l]) => `<button class="pill ${(s.aiTone || 'direto') === k ? 'on' : ''}" onclick="A.setTone('${k}')">${l}</button>`).join('')}</div>
    <h3>Modelo</h3><select onchange="A.setModel(this.value)">${modelOptions().map(([v, l]) => `<option value="${h(v)}" ${keyStore.model() === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>
    ${keyStore.provider() === 'gemini' && keyStore.get() ? '<button class="ghost mini mt" onclick="A.loadModels()">Carregar modelos da minha conta</button>' : ''}
    ${toggle(!!s.shareBody, 'Enviar ao assistente os itens do "Corpo em dia" e os remédios', 'A.toggleShareBody()', 'Desligado: o assistente só vê quantos itens você marcou.')}
    ${keyStore.get() ? '<button class="ghost mt" style="width:100%" onclick="A.removeKey()">Remover chave</button>' : ''}</div>
  <div class="card"><h2>Corpo em dia</h2><p class="hint">Itens que aparecem todo dia na página de hoje.</p>${body}<button class="ghost mini" onclick="A.addBody()">+ item</button></div>
  <div class="card"><h2>Agenda do celular</h2><p class="hint">${calTxt}</p>${N.isNative() && S.calPerm !== 'granted' ? '<button onclick="A.connectCalendar()">Conectar agenda</button>' : ''}
    <p class="small">Para ver a agenda do trabalho, ative a sincronização de calendário no app do Outlook (Configurações › conta › Sincronizar calendários).</p></div>
  <div class="card"><h2>Agenda da casa</h2><p class="hint">Um calendário do Google compartilhado entre vocês (ex.: "Family"). O que um marca aparece no app do outro.</p>
    ${s.houseCalendarId ? `<p>Usando: <b>${h(s.houseCalendarTitle || '')}</b></p>` : ''}
    ${!N.isNative() ? '<p class="small">Disponível no app Android.</p>' : S.calendars ? (S.calendars.length ? S.calendars.map(c => `<div class="list-item"><div class="grow">${c.color ? `<span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${h(c.color)};margin-right:6px"></span>` : ''}${h(c.title)}<div class="small">${h(c.account)}</div></div><button class="mini ${s.houseCalendarId === c.id ? '' : 'ghost'}" onclick="A.setHouse('${h(c.id)}')">${s.houseCalendarId === c.id ? 'Em uso' : 'Usar'}</button></div>`).join('') : '<p class="small">Nenhum calendário com permissão de escrita.</p>')
      : '<button onclick="A.loadCalendars()">Escolher calendário</button>'}
    <p class="small mt">Não tem um calendário compartilhado? No Google Agenda pelo navegador, crie uma agenda "Casa" e compartilhe com a outra pessoa, com permissão para fazer alterações.</p></div>
  <div class="card"><h2>Lembretes do celular</h2><p class="hint">${!N.isNative() ? 'Disponível no app Android.' : S.notif ? 'Ativados.' : 'Desativados.'}</p>${N.isNative() && !S.notif ? '<button onclick="A.enableNotif()">Ativar lembretes</button>' : ''}</div>
  ${driveCard()}
  <div class="card"><h2>Seus dados</h2><p class="hint">Tudo fica só neste aparelho. Último backup: ${last}.</p>
    <button style="width:100%" onclick="A.exportData()">Exportar backup (JSON)</button>
    <h3>Importar</h3><div class="pills"><button class="pill ${S.importMode === 'merge' ? 'on' : ''}" onclick="A.setImportMode('merge')">Mesclar com o que tenho</button><button class="pill ${S.importMode === 'replace' ? 'on' : ''}" onclick="A.setImportMode('replace')">Substituir tudo</button></div>
    <button class="ghost mt" style="width:100%" onclick="A.pickImport()">Escolher arquivo para importar</button>
    <button class="danger mt" style="width:100%" onclick="A.wipe()">Apagar todos os dados</button></div>
  ${aboutCard()}`;
  return ['Ajustes', '', out, { back: 'A.back()' }];
}

// ---------------- Configuração guiada ----------------
const AREAS = [
  ['manha', 'Manhã e começar o dia', [1, 2]], ['comecar', 'Começar tarefas', [12, 13]], ['tempo', 'Tempo e prazos', [24, 25]],
  ['foco', 'Foco e distrações', [33, 35]], ['casa', 'Casa e objetos perdidos', [41, 44]], ['dinheiro', 'Dinheiro e contas', [51, 59]],
  ['trabalho', 'Trabalho e reuniões', [62, 64]], ['corpo', 'Sono, comida e corpo', [71, 75]], ['emocoes', 'Emoções e autoestima', [81, 82]],
  ['relacoes', 'Relações e conversas', [95, 96]],
];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']; // índice + 1 = dia no Android
const WORK = [['casa', 'Em casa'], ['presencial', 'Presencial'], ['hibrido', 'Híbrido'], ['nao', 'Não estou trabalhando']];
const ONB_STEPS = ['inicio', 'voce', 'travas', 'remedios', 'sobre', 'ia', 'permissoes'];

function keyLink(P) {
  return `<a href="${h(P.keyUrl)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;padding:10px 14px;border-radius:10px;border:1px solid var(--line);color:var(--accent)">${h(P.keyUrlLabel)} ↗</a>`;
}
function shiftTime(hhmm, min) {
  const [hr, mi] = hhmm.split(':').map(Number);
  const t = ((hr * 60 + mi + min) % 1440 + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
function newOnb(step = 'inicio') {
  return { step, d: { name: S.settings.name || '', wake: '07:00', sleep: '23:00', work: 'casa', wStart: '09:00', wEnd: '18:00', weekDay: 1, weekTime: '18:00', areas: [], meds: [], water: true, waterEvery: 2, about: S.settings.about || '' } };
}
function aboutDraft(d) {
  const w = { casa: 'Trabalha em casa', presencial: 'Trabalha presencialmente', hibrido: 'Trabalha em esquema híbrido', nao: 'No momento não está trabalhando' }[d.work];
  const parts = [];
  if (d.name) parts.push(`${d.name.trim()}.`);
  parts.push(d.work === 'nao' ? `${w}.` : `${w}, das ${d.wStart} às ${d.wEnd}.`);
  parts.push(`Costuma acordar por volta das ${d.wake} e dormir por volta das ${d.sleep}.`);
  if (d.areas.length) parts.push('O que mais trava: ' + d.areas.map(a => AREAS.find(x => x[0] === a)[1].toLowerCase()).join(', ') + '.');
  return parts.join(' ');
}
function waterTimes(d) {
  const out = [];
  const [wh, wm] = d.wake.split(':').map(Number), [sh, sm] = d.sleep.split(':').map(Number);
  let start = wh * 60 + wm + 60, end = sh * 60 + sm - 60;
  if (end <= start) end += 1440;
  for (let t = start; t <= end; t += d.waterEvery * 60) out.push(`${pad(Math.floor((t % 1440) / 60))}:${pad(t % 60)}`);
  return [...new Set(out)].sort();
}

async function applyOnb() {
  const d = S.onb.d;
  if (d.name.trim()) S.settings.name = d.name.trim();
  S.settings.about = d.about || aboutDraft(d);
  await db.put('settings', S.settings);
  const setR = async (id, t, wd = 0) => { const r = S.routines.find(x => x.id === id); if (r && t) { r.notifyTime = t; r.notifyWeekday = wd; await db.put('routines', r); } };
  await setR('manha', d.wake);
  if (d.work !== 'nao') { await setR('ignicao', d.wStart); await setR('fechamento', shiftTime(d.wEnd, -15)); }
  await setR('noite', shiftTime(d.sleep, -60));
  await setR('semanal', d.weekTime, Number(d.weekDay));
  for (const a of d.areas) for (const n of AREAS.find(x => x[0] === a)[2]) {
    const o = objFor('strategies', n); o.fav = true; if (!o.status) o.status = 'quero'; await db.put('strategies', o);
  }
  for (const m of d.meds) {
    const med = { id: uid(), name: m.name, kind: 'remedio', times: [...m.times].sort(), carry: true, order: S.meds.length };
    S.meds.push(med); await db.put('meds', med);
  }
  if (d.water && !S.meds.some(m => m.kind === 'agua')) {
    const med = { id: uid(), name: 'Água (1 copo)', kind: 'agua', times: waterTimes(d), carry: false, order: S.meds.length };
    S.meds.push(med); await db.put('meds', med);
  }
  d.meds = [];
}

function scrOnboarding() {
  const o = S.onb, d = o.d, i = ONB_STEPS.indexOf(o.step);
  const nav2 = (next = 'Próximo') => `<div class="row mt">${i > 1 ? '<button class="ghost" onclick="A.onbBack()">Voltar</button>' : ''}<div class="grow"></div><button onclick="A.onbNext()">${next}</button></div>`;
  const pill = (on, label, action) => `<button class="pill ${on ? 'on' : ''}" onclick="${action}">${label}</button>`;
  const set = k => `oninput="A.onbSet('${k}', this.value)"`;
  let title = '', body = '';
  switch (o.step) {
    case 'inicio':
      title = 'Vamos configurar';
      body = `<div class="card"><p>Uns 5 minutos de perguntas e o app fica com a sua cara: horários das rotinas, lembretes de remédio e água, estratégias para começar e o assistente de IA.</p><p class="hint">Dá para mudar tudo depois em Ajustes.</p>
        <button style="width:100%" onclick="A.onbNext()">Começar</button>
        ${N.isNative() ? '<button class="ghost mt" style="width:100%" onclick="A.restoreDrive()">Restaurar backup do Google Drive</button>' : ''}
        <button class="ghost mt" style="width:100%" onclick="A.pickImport('merge')">Já tenho um arquivo de perfil ou backup</button>
        <button class="ghost mt" style="width:100%" onclick="A.onbFinish()">Pular por agora</button></div>`;
      break;
    case 'voce':
      title = 'Sobre você';
      body = `<div class="card"><h3>Como quer ser chamado?</h3><input type="text" value="${h(d.name)}" placeholder="Seu nome" ${set('name')}>
        <div class="row mt"><div class="grow"><h3>Acordo por volta de</h3><input type="time" value="${h(d.wake)}" ${set('wake')}></div><div class="grow"><h3>Quero dormir às</h3><input type="time" value="${h(d.sleep)}" ${set('sleep')}></div></div>
        <h3>Trabalho</h3><div class="pills">${WORK.map(([k, l]) => pill(d.work === k, l, `A.onbSet('work','${k}',true)`)).join('')}</div>
        ${d.work !== 'nao' ? `<div class="row mt"><div class="grow"><h3>Começo às</h3><input type="time" value="${h(d.wStart)}" ${set('wStart')}></div><div class="grow"><h3>Termino às</h3><input type="time" value="${h(d.wEnd)}" ${set('wEnd')}></div></div>` : ''}
        <h3>Revisão da semana (15 min)</h3><div class="row"><select class="grow" onchange="A.onbSet('weekDay', this.value)">${WEEKDAYS.map((w, k) => `<option value="${k + 1}" ${Number(d.weekDay) === k + 1 ? 'selected' : ''}>${w}</option>`).join('')}</select><input type="time" style="width:130px" value="${h(d.weekTime)}" ${set('weekTime')}></div>
        <p class="small mt">Esses horários viram os lembretes das rotinas de manhã, trabalho, noite e revisão da semana.</p>${nav2()}</div>`;
      break;
    case 'travas':
      title = 'O que mais trava?';
      body = `<div class="card"><p class="hint">Escolha até 3. O app separa 2 estratégias de cada para o seu kit inicial.</p>
        <div class="pills">${AREAS.map(([k, l]) => pill(d.areas.includes(k), l, `A.onbArea('${k}')`)).join('')}</div>${nav2()}</div>`;
      break;
    case 'remedios':
      title = 'Remédios e água';
      body = `<div class="card"><p class="hint">Cada horário vira um aviso com o botão "Tomei". Se tiver compromisso na agenda no horário, o app avisa antes para você levar. Não usa remédio? Pode pular.</p>
        <h3>Remédio e horário</h3><input type="text" id="onbMedName" placeholder="Nome e dose, ex.: Remédio X 10 mg">
        <div class="row mt"><input type="time" id="onbMedTime" class="grow"><button onclick="A.onbAddMed()">+ Adicionar</button></div>
        <p class="small">Toma mais de uma vez por dia? Adicione o mesmo nome com outro horário.</p>
        ${d.meds.map((m, k) => `<div class="list-item"><div class="grow"><b>${h(m.name)}</b><div class="small">${m.times.join(', ')}</div></div><button class="icon" onclick="A.onbRemoveMed(${k})">×</button></div>`).join('')}
        <h3>Água</h3>${toggle(d.water, 'Quero lembrete para beber água', 'A.onbSet(\'water\', ' + !d.water + ', true)')}
        ${d.water ? `<select onchange="A.onbSet('waterEvery', Number(this.value), true)">${[1, 2, 3].map(n => `<option value="${n}" ${d.waterEvery === n ? 'selected' : ''}>A cada ${n} hora${n > 1 ? 's' : ''}, do acordar até 1h antes de dormir</option>`).join('')}</select><p class="small">${waterTimes(d).join(' · ')}</p>` : ''}
        ${nav2()}</div>`;
      break;
    case 'sobre':
      title = 'O que o assistente deve saber';
      if (!d.about) d.about = aboutDraft(d);
      body = `<div class="card"><p class="hint">Esse texto ajuda o assistente de IA a entender sua rotina. Acrescente o que quiser: com quem mora, objetivos, o que costuma dar errado.</p>
        <textarea rows="8" ${set('about')}>${h(d.about)}</textarea>${nav2('Salvar e continuar')}</div>`;
      break;
    case 'ia': {
      title = 'Assistente de IA';
      const prov = keyStore.provider(), P = PROVIDERS[prov];
      const has = keyStore.get();
      body = `<div class="card"><p class="hint">Opcional. O assistente planeja o dia, fatia tarefas e cria lembretes por você. Precisa de uma chave de API.</p>
        <div class="pills">${Object.entries(PROVIDERS).map(([k, v]) => pill(prov === k, v.label, `A.setProvider('${k}')`)).join('')}</div>
        <p class="small mt">${h(P.billing)}</p>${P.warning ? `<div class="alert" style="margin-bottom:10px">${h(P.warning)}</div>` : ''}
        ${has ? '<p><b>Chave salva neste celular.</b></p>' : `<ol class="small" style="padding-left:18px;margin:0 0 10px">${P.howTo.map(x => `<li>${h(x)}</li>`).join('')}</ol>${keyLink(P)}
        <input class="mt" type="text" id="apiKey" placeholder="${h(P.keyHint)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="mt" style="width:100%" onclick="A.saveKey()">Salvar chave</button>`}
        <div class="row mt">${i > 1 ? '<button class="ghost" onclick="A.onbBack()">Voltar</button>' : ''}<div class="grow"></div><button ${has ? '' : 'class="ghost"'} onclick="A.onbNext()">${has ? 'Próximo' : 'Pular por agora'}</button></div></div>`;
      break;
    }
    case 'permissoes': {
      title = 'Permissões';
      const st = (ok, txt) => `<span class="tag" style="${ok ? '' : 'background:var(--warn-soft);color:var(--warn)'}">${ok ? 'ok' : txt}</span>`;
      body = N.isNative() ? `<div class="card"><p class="hint">Para os lembretes funcionarem, o Android precisa de três permissões.</p>
        <div class="list-item"><div class="grow"><b>Notificações</b><div class="small">Avisos de rotinas, remédios e lembretes</div></div>${S.notif ? st(true) : '<button class="mini" onclick="A.enableNotif()">Permitir</button>'}</div>
        <div class="list-item"><div class="grow"><b>Alarmes na hora exata</b><div class="small">Remédio na hora certa, sem atraso</div></div>${S.exact === 'granted' ? st(true) : '<button class="mini" onclick="A.openExact()">Permitir</button>'}</div>
        <div class="list-item"><div class="grow"><b>Agenda</b><div class="small">Mostra os compromissos e avisa para levar o remédio</div></div>${S.calPerm === 'granted' ? st(true) : '<button class="mini" onclick="A.connectCalendar()">Conectar</button>'}</div>
        <button class="mt" style="width:100%" onclick="A.onbFinish()">Concluir</button></div>`
        : `<div class="card"><p>No navegador não há permissões para dar. No app Android, esta tela pede notificações, alarmes exatos e agenda.</p><button style="width:100%" onclick="A.onbFinish()">Concluir</button></div>`;
      break;
    }
  }
  const prog = i > 0 ? `Passo ${i} de ${ONB_STEPS.length - 1}` : 'TDAH na Vida Real';
  return `<header class="top"><h1>${title}</h1><div class="sub">${prog}</div></header><main>${body}</main>`;
}

// ---------------- Render ----------------
const SCREENS = {
  hoje: scrHoje, remedios: scrRemedios, rotinas: scrRotinas, assistente: scrAssistente, guia: scrGuia, ajustes: scrAjustes, foco: scrFoco,
  semana: scrSemana, tarefas: scrTarefas, ideias: scrIdeias, habitos: scrHabitos, lembretes: scrLembretes, agenda: scrAgenda,
};
let lastBars = null;
function applyTheme() {
  const t = (S.settings && S.settings.theme) || 'auto';
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  const sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const dark = S.tab === 'foco' || t === 'escuro' || (t === 'auto' && sysDark);
  if (dark !== lastBars) { lastBars = dark; N.setBars(dark); }
}
function render() {
  const app = document.getElementById('app');
  applyTheme();
  later('pin', updatePinned, 700);
  if (S.onb) { document.body.className = 'nonav'; app.innerHTML = scrOnboarding(); return; }
  const out = (SCREENS[S.tab] || scrHoje)();
  if (out.raw) {
    document.body.className = S.tab === 'foco' ? 'focus-bg' : 'nonav';
    app.innerHTML = out.raw + drawer() + incomingSheet();
    return;
  }
  const [title, sub, body, opt = {}] = out;
  const lead = opt.back
    ? `<button class="iconbtn" onclick="${opt.back}" aria-label="Voltar">${svg('back')}</button>`
    : `<button class="iconbtn" onclick="A.menu(true)" aria-label="Abrir menu">${svg('menu', 24)}</button>`;
  document.body.className = opt.noNav ? 'nonav' : '';
  app.innerHTML = `<header class="appbar">${lead}<div class="ttl"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${opt.right || ''}</header><main>${body}</main>${opt.noNav ? '' : nav()}${drawer()}${newTaskSheet()}${incomingSheet()}`;
}

// ---------------- Ações ----------------
const A = {
  tab(t) {
    if (t === 'kit') return A.openKit();
    const over = ['assistente', 'foco', 'ajustes'];
    if (over.includes(t) && !over.includes(S.tab)) S.prevTab = S.tab;
    S.tab = t; S.drawer = false;
    if (t !== 'rotinas') { S.openRoutine = null; S.editRoutine = false; }
    if (t !== 'tarefas') S.openProject = null;
    render(); window.scrollTo(0, 0);
  },
  back() { const t = S.prevTab && S.prevTab !== S.tab ? S.prevTab : 'hoje'; S.drawer = false; S.parkOpen = false; S.tab = t; render(); window.scrollTo(0, 0); },
  menu(open) { S.drawer = !!open; render(); },
  openAssistant() { A.tab('assistente'); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 0); },
  fab() { A.openAssistant(); if (keyStore.get() && N.isNative() && !S.sending) A.voiceSend(); },
  openKit() { S.guideFilter = 'kit'; S.guideQuery = ''; S.tab = 'guia'; S.drawer = false; render(); window.scrollTo(0, 0); },
  openGuide() { S.guideFilter = 'all'; A.tab('guia'); },
  quickDump() {
    const el = document.getElementById('dumpArea');
    if (!el) return A.openAssistant();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus();
  },
  toggleMedEdit() { S.medEdit = !S.medEdit; render(); },
  medAdd() { S.medEdit = true; if (S.tab !== 'remedios') S.tab = 'remedios'; render(); const el = document.getElementById('medInput'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } },
  async snoozeNow(key) {
    const d = dosesForDay().find(x => x.key === key); if (!d) return;
    if (!N.isNative()) return toast('O lembrete de novo funciona no app Android');
    const title = d.kind === 'agua' ? `Água: ${d.name}` : `Hora de: ${d.name}`;
    await N.snoozeDose({ kind: 'dose', key, title, body: 'Toque em Tomei quando tomar.' }, 15);
    toast('Aviso de novo em 15 min');
  },
  // Aparência e foco
  setTheme(k) { S.settings.theme = k; persist('settings', S.settings, true); render(); },
  setFocusOpt(k) {
    const s = S.settings;
    if (k === 'focusSound') s.focusSound = s.focusSound === false; else s[k] = !s[k];
    persist('settings', s, true); render();
    if (S.focus && S.focus.phase === 'run') scheduleFocusAlerts();
  },
  async testSound() {
    primeAudio();
    if (S.settings.focusSound === false) return toast('O som está desligado');
    if (N.isNative()) {
      const ok = await N.testFocusSound(focusSoundMode()).catch(() => false);
      S.notif = await N.notificationsAllowed(false);
      if (ok) return toast('O sino toca em 2 segundos');
    }
    chime();
  },
  focusMinSet(m) { S.focusMin = m; render(); },
  focusPickSet(i) { S.focusPick = S.focusPick === i ? null : i; render(); },
  focusDraftSet(v) { S.focusDraft = v; },
  focusPrep(i) {
    const f = S.focus;
    const arr = f ? (f.prep = f.prep || []) : (S.focusPrepDraft = S.focusPrepDraft || []);
    arr[i] = !arr[i]; if (f) saveFocus(); render();
  },
  focusGo() {
    const draft = (S.focusDraft || '').trim();
    const pick = S.focusPick;
    A.focusStart(S.focusMin || 25, draft ? null : (pick ?? null), draft);
  },
  async focusStart(min, topIdx = null, label = '', extra = {}) {
    primeAudio();
    const t = topIdx !== null && topIdx !== undefined && S.page.id === todayKey() ? S.page.top3[topIdx] : null;
    const task = S.projects.find(x => x.id === (extra.taskId || (t && t.task)) && !x.done) || null;
    const st = task ? nextStep(task) : null;
    S.focus = {
      mode: 'foco', phase: 'run', total: min * 60000, end: Date.now() + min * 60000,
      label: label || (task ? task.title : t ? t.t : ''), step: st ? st.t : (t ? t.s : ''), top: t ? topIdx : null,
      taskId: task ? task.id : null, stepIdx: st ? task.steps.indexOf(st) : null, prep: S.focusPrepDraft || [], native: false,
    };
    S.focusMin = min; S.focusDraft = ''; S.focusPick = null; S.focusPrepDraft = [];
    saveFocus();
    if (S.tab !== 'foco') { if (!['assistente', 'ajustes'].includes(S.tab)) S.prevTab = S.tab; S.tab = 'foco'; }
    S.drawer = false; render(); window.scrollTo(0, 0); focusTick();
    await scheduleFocusAlerts(); render();
  },
  async focusPause() { const f = S.focus; if (!f || f.phase !== 'run') return; f.left = focusLeft(); f.phase = 'paused'; clearInterval(A._fiv); saveFocus(); await N.cancelFocus(); render(); },
  async focusResume() { primeAudio(); const f = S.focus; if (!f || f.phase !== 'paused') return; f.end = Date.now() + f.left; f.phase = 'run'; saveFocus(); render(); focusTick(); await scheduleFocusAlerts(); render(); },
  async focusPlus(min = 5) {
    primeAudio(); const f = S.focus; if (!f) return;
    if (f.phase === 'run') { f.end += min * 60000; f.total += min * 60000; }
    else if (f.phase === 'paused') { f.left += min * 60000; f.total += min * 60000; }
    else { f.mode = 'foco'; f.phase = 'run'; f.total = min * 60000; f.end = Date.now() + min * 60000; f.answered = ''; }
    saveFocus(); render(); focusTick(); await scheduleFocusAlerts(); render();
  },
  async focusBreak(min = 5) { primeAudio(); S.focus = { ...(S.focus || {}), mode: 'pausa', phase: 'run', total: min * 60000, end: Date.now() + min * 60000 }; saveFocus(); render(); focusTick(); await scheduleFocusAlerts(); render(); },
  async focusAgain() { const f = S.focus || {}; await A.focusStart(S.focusMin || 25, f.top ?? null, f.top != null || f.taskId ? '' : (f.label || ''), { taskId: f.taskId }); },
  async focusStop() { clearInterval(A._fiv); S.focus = null; S.parkOpen = false; saveFocus(); await N.cancelFocus(); A.back(); },
  async focusDone(yes) {
    const f = S.focus; if (!f) return;
    f.answered = yes ? 'sim' : 'nao';
    if (yes) {
      if (S.page.id !== todayKey()) await loadPage(todayKey());
      const task = f.taskId ? S.projects.find(x => x.id === f.taskId) : null;
      if (task && f.stepIdx != null && task.steps[f.stepIdx]) {
        task.steps[f.stepIdx].d = true;
        const ns = nextStep(task);
        f.nextText = ns ? ns.t : '';
        if (!ns) await finishTask(task);
        else { await db.put('projects', task); await syncTopForTask(task); }
        (S.page.done = S.page.done || []).push(`${task.title}: ${f.step}`);
      } else if (f.top != null && S.page.top3[f.top]) S.page.top3[f.top].d = true;
      else if (f.label) (S.page.done = S.page.done || []).push(f.label);
      await savePage();
    }
    saveFocus(); render();
  },
  parkToggle() { S.parkOpen = !S.parkOpen; render(); const el = document.getElementById('parkInput'); if (el) el.focus(); },
  async parkSave() {
    const el = document.getElementById('parkInput'); const v = el ? el.value.trim() : '';
    if (!v) return;
    const i = { id: uid(), t: v, when: '', at: Date.now(), done: false };
    S.ideas.unshift(i); await db.put('ideas', i);
    S.parkOpen = false; render(); toast('Ideia estacionada. Volta pro foco.');
  },
  field(store, id, path, value) {
    const obj = objFor(store, id);
    if (!obj) return;
    if (path === 't_title') path = 'title';
    if (store === 'routines' && path.startsWith('steps.')) { const i = Number(path.split('.')[1]); obj.steps[i] = value; }
    else setPath(obj, path, value);
    persist(store, obj);
    if (store === 'meds') later('dosesync', syncDoses, 1500);
  },

  // Hoje
  saveName() { const v = document.getElementById('nameInput').value.trim(); if (!v) return; S.settings.name = v; persist('settings', S.settings, true); render(); },
  setBad(v) { S.page.bad = v; savePage(); render(); },
  setEnergy(e) { S.page.energy = S.page.energy === e ? null : e; savePage(); render(); },
  async setMood(k) {
    if (S.page.id !== todayKey()) await loadPage(todayKey());
    S.page.mood = k; S.page.moodAt = Date.now(); await savePage(); S.weekPages[S.page.id] = S.page;
    S.moodJust = true; render(); setTimeout(() => { S.moodJust = false; }, 1200);
  },
  async moodReset() { S.page.mood = null; await savePage(); render(); },
  async setTone(k) { S.settings.aiTone = k; await db.put('settings', S.settings); render(); toast(`Tom: ${TONES.find(x => x[0] === k)[1]}`); },
  async setWeekOpt() { S.settings.weekSummary = S.settings.weekSummary === false; await db.put('settings', S.settings); await scheduleWeekNotif(); render(); },
  async addCat() {
    const el = document.getElementById('catInput'); const name = (el && el.value || '').trim(); if (!name) return;
    if (catByName(name)) return toast('Já existe');
    const used = new Set(cats().map(c => c.color));
    S.settings.cats.push({ id: uid(), name, color: CAT_COLORS.find(c => !used.has(c)) || CAT_COLORS[cats().length % CAT_COLORS.length] });
    await db.put('settings', S.settings); render();
  },
  renameCat(i, v) { const c = cats()[i]; if (!c) return; c.name = v; persist('settings', S.settings); },
  async cycleCatColor(i) { const c = cats()[i]; if (!c) return; c.color = CAT_COLORS[(CAT_COLORS.indexOf(c.color) + 1) % CAT_COLORS.length]; await db.put('settings', S.settings); render(); },
  async removeCat(i) {
    const c = cats()[i]; if (!c) return;
    const n = S.projects.filter(t => t.cat === c.id).length;
    if (n && !confirm(`Tirar "${c.name}"? ${n} ${n === 1 ? 'tarefa fica' : 'tarefas ficam'} sem categoria.`)) return;
    S.settings.cats.splice(i, 1); await db.put('settings', S.settings);
    for (const t of S.projects.filter(t => t.cat === c.id)) { t.cat = null; await db.put('projects', t); }
    if (S.catFilter === c.id) S.catFilter = null; render();
  },
  async weekDismiss() { const d = new Date(); S.settings.weekSeen = d.getDay() === 1 ? todayKey(new Date(Date.now() - DAY)) : weekId(); await db.put('settings', S.settings); render(); },
  askWeek() { A.openAssistant(); setTimeout(() => A.send(QUICK[6]), 50); },
  toggleTop(i) { S.page.top3[i].d = !S.page.top3[i].d; savePage(); render(); },
  toggleBody(i) { const c = S.settings.bodyChecks[i]; S.page.body[c] = !S.page.body[c]; savePage(); render(); },
  toggleBadCheck(i) { S.page.badChecks[i] = !S.page.badChecks[i]; savePage(); render(); },
  addDone() { const el = document.getElementById('doneInput'); const v = el.value.trim(); if (!v) return; S.page.done.push(v); savePage(); render(); document.getElementById('doneInput')?.focus(); },
  removeDone(i) { S.page.done.splice(i, 1); savePage(); render(); },
  async loadPast() {
    const pages = await db.all('pages');
    S.pastList = pages.filter(p => p.dump || p.good || (p.done && p.done.length) || (p.top3 || []).some(t => t.t) || p.bad).map(p => p.id).sort().reverse().slice(0, 60);
    render();
  },
  async openPage(k) { await loadPage(k); S.pastList = null; render(); window.scrollTo(0, 0); },
  async connectCalendar() {
    S.calPerm = await N.calendarPermission(true);
    if (S.calPerm === 'granted') { await loadEvents(); await syncDoses(); toast('Agenda conectada'); }
    else toast('Sem permissão para ler a agenda');
    render();
  },
  async refreshEvents() { await loadEvents(); render(); toast('Agenda atualizada'); },

  // Rotinas
  openRoutine(id) { S.openRoutine = id; S.editRoutine = false; render(); window.scrollTo(0, 0); },
  closeRoutine() { S.openRoutine = null; S.editRoutine = false; render(); },
  _r() { return S.routines.find(r => r.id === S.openRoutine); },
  toggleStep(i) { const r = A._r(); const run = runOf(r); run.checks[i] = !run.checks[i]; persist('routines', r, true); render(); },
  setMinimal(v) { const r = A._r(); const run = runOf(r); run.minimal = v; run.checks = []; persist('routines', r, true); render(); },
  async finishRoutine() {
    const r = A._r(); const run = runOf(r);
    const log = { id: uid(), routineId: r.id, at: Date.now(), minimal: !!run.minimal };
    S.logs.push(log); await db.put('logs', log);
    r.run = { date: todayKey(), checks: [], minimal: false }; await db.put('routines', r);
    toast(run.minimal ? 'Versão mínima conta. Feito!' : 'Rotina concluída!');
    render();
  },
  editRoutine() { S.editRoutine = true; render(); },
  async doneEditing() { const r = A._r(); r.steps = r.steps.map(s => s.trim()).filter(Boolean); await db.put('routines', r); S.editRoutine = false; render(); },
  addStep() { const r = A._r(); r.steps.push(''); persist('routines', r, true); render(); },
  removeStep(i) { const r = A._r(); r.steps.splice(i, 1); persist('routines', r, true); render(); },
  async saveNotify() {
    const r = A._r(); const v = document.getElementById('notifyTime').value;
    if (!v) return;
    r.notifyTime = v; r.notifyWeekday = Number(document.getElementById('notifyDay').value) || 0; await db.put('routines', r);
    if (N.isNative()) {
      const ok = await N.notificationsAllowed(true); S.notif = ok;
      if (ok) { await N.syncRoutineReminders(S.routines); toast(r.notifyWeekday ? `Lembrete toda ${WEEKDAYS[r.notifyWeekday - 1].toLowerCase()} às ${v}` : `Lembrete diário às ${v}`); } else toast('Permita as notificações para receber o lembrete');
    } else toast('Salvo. O aviso funciona no app Android.');
    render();
  },
  async clearNotify() { const r = A._r(); r.notifyTime = null; await db.put('routines', r); await N.syncRoutineReminders(S.routines); render(); },
  startTimer(min) { return A.focusStart(min); },

  // Guia
  guideSearch(v) { S.guideQuery = v; later('gsearch', () => { document.getElementById('glist').innerHTML = guideList(); }, 200); },
  guideFilter(k) { S.guideFilter = k; render(); },
  toggleFav(n) { const o = objFor('strategies', n); o.fav = !o.fav; persist('strategies', o, true); render(); },
  setStatus(n, v) { const o = objFor('strategies', n); o.status = v; persist('strategies', o, true); },

  // Ferramentas
  goTool(k) { A.tab(k); },
  toggleWeekCheck(i) { S.week.checks[i] = !S.week.checks[i]; persist('misc', S.week, true); render(); },
  toggleWeekTop(i) { S.week.top3[i].d = !S.week.top3[i].d; persist('misc', S.week, true); render(); },
  async newWeek() {
    if (!confirm('Começar uma nova semana? As 3 da semana, as marcações e as anotações voltam a ficar em branco.')) return;
    await db.put('misc', { ...S.week, id: 'week-' + Date.now(), archivedAt: Date.now() });
    S.week = { id: 'week', checks: {}, top3: [{ t: '', s: '', d: false }, { t: '', s: '', d: false }, { t: '', s: '', d: false }], notes: '' };
    await db.put('misc', S.week); render();
  },
  // Prioridades e tarefas
  newTask(cat) { S.newTask = { title: '', busy: false, plan: null, error: '', cat: cat || (S.tab === 'tarefas' && !S.openProject ? S.catFilter : null) || null }; S.drawer = false; render(); const el = document.getElementById('ntTitle'); if (el) el.focus(); },
  ntSet(v) {
    const n = S.newTask; if (!n) return; n.title = v;
    const el = document.getElementById('ntPreview'); if (!el) return;
    const pre = v.trim() ? captureChips({ ...mergeCapture(parseCapture(v), null, null), cat: null }) : '';
    el.innerHTML = pre; el.style.display = pre ? '' : 'none';
    const cb = document.getElementById('ntCats'); if (cb && n.cat === null) cb.innerHTML = ntCatPills(n);
  },
  ntCat(c) {
    const n = S.newTask; if (!n) return; const el = document.getElementById('ntTitle'); if (el) n.title = el.value;
    n.cat = ntEffCat(n) === c ? 'none' : c;
    const cb = document.getElementById('ntCats'); if (cb) cb.innerHTML = ntCatPills(n);
  },
  ntClose() { if (S.newTask && S.newTask.busy) return; S.newTask = null; render(); },
  async ntVoice() {
    try { const text = await N.listenOnce(); if (!text) return toast('Não entendi. Tente de novo.'); S.newTask.title = text; render(); await A.ntSubmit(); }
    catch (e) { const m = String(e.message || e); toast(/cancel|no match|nomatch/i.test(m) ? 'Não entendi. Tente de novo.' : m); }
  },
  async _addTask(t, open) {
    S.projects.unshift(t); await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); S.newTask = null;
    if (open) { S.openProject = t.id; S.editWhat = null; S.tab = 'tarefas'; }
    render(); window.scrollTo(0, 0);
  },
  async ntSubmit() {
    const n = S.newTask; if (!n || n.busy) return;
    const el = document.getElementById('ntTitle'); if (el) n.title = el.value;
    const title = (n.title || '').trim(); if (!title) return toast('Escreva a tarefa');
    const local = parseCapture(title);
    if (!hasAI() || S.settings.autoSlice === false) {
      const c = mergeCapture(local, null, n.cat);
      const t = applyCapture(newTaskObj(c.title), c);
      return A._addTask(t, true).then(() => { if (c.date || c.time) toast(`Anotado: ${whenLabel(c.date, c.time)}`); });
    }
    n.busy = true; n.error = ''; render();
    try { n.plan = await A._plan(title, 'novo'); n.cap = mergeCapture(local, n.plan, n.cat); } catch (e) { n.error = 'A IA não respondeu: ' + (e.message || e); }
    n.busy = false; render();
  },
  async ntPlain() { const n = S.newTask; const title = ((n && n.title) || '').trim(); if (!title) return; const c = mergeCapture(parseCapture(title), null, n.cat); await A._addTask(applyCapture(newTaskObj(c.title), c), true); },
  async ntFiner() {
    const n = S.newTask; if (!n || !n.plan) return;
    n.busy = true; render();
    try { const prev = n.plan; const p2 = await A._plan(n.title.trim(), 'mais_fino', { pronto: prev.pronto_quando, passos: prev.passos }); n.plan = { ...prev, ...p2, grande: true }; }
    catch (e) { toast('Não deu para refatiar: ' + (e.message || e)); }
    n.busy = false; render();
  },
  async ntAccept(schedule) {
    const n = S.newTask; if (!n || !n.plan) return;
    const t = applyCapture(newTaskObj(n.title, n.plan), n.cap);
    t.ready = realSteps(t).length > 0 && !!(t.what || '').trim();
    const when = schedule && !t.time && n.plan.sugestao_quando ? new Date(n.plan.sugestao_quando) : null;
    let scheduled = false;
    if (when && !isNaN(when) && when > new Date()) {
      t.when = dueLabel(n.plan.sugestao_quando);
      const st = nextStep(t);
      const r = { id: uid(), title: `Passo 1: ${st ? st.t : t.title}`, at: n.plan.sugestao_quando, note: t.title, done: false };
      S.reminders.push(r); await db.put('reminders', r); await N.scheduleOnce(r.id, 'Lembrete', r.title, when); scheduled = true;
    }
    await A._addTask(t, false);
    toast(scheduled ? 'Tarefa na matriz e passo 1 agendado' : t.time ? `Tarefa na matriz, aviso ${dueLabel(localIso(taskAlarmAt(t) || new Date()))}` : t.rep ? `Tarefa na matriz, ${repLabel(t.rep)}` : 'Tarefa na matriz');
  },
  async ntEdit() { const n = S.newTask; if (!n || !n.plan) return; const t = applyCapture(newTaskObj(n.title, n.plan), n.cap); t.ready = false; await A._addTask(t, true); },
  async _plan(titulo, modo, extra = {}) { const c = buildContext(); return planTask({ provider: keyStore.provider(), apiKey: keyStore.get(), model: keyStore.model(), contextText: c.text, now: c.now, titulo, modo, cats: cats().map(x => x.name), ...extra }); },
  addProject() { A.newTask(); },
  openProject(id) { S.openProject = id; S.editWhat = null; S.newTask = null; if (S.tab !== 'tarefas') S.tab = 'tarefas'; S.drawer = false; render(); window.scrollTo(0, 0); },
  closeProject() { S.openProject = null; S.editWhat = null; render(); window.scrollTo(0, 0); },
  _p() { return S.projects.find(p => p.id === S.openProject); },
  addProjStep() { const p = A._p(); p.steps.push({ t: '', est: '', d: false }); persist('projects', p, true); render(); },
  async toggleProjStep(i) { const p = A._p(); p.steps[i].d = !p.steps[i].d; await db.put('projects', p); await syncTopForTask(p); render(); },
  removeProjStep(i) { const p = A._p(); p.steps.splice(i, 1); persist('projects', p, true); render(); },
  async deleteProject() { if (!confirm(A._p().rep ? 'Apagar esta tarefa? A repetição para aqui.' : 'Apagar esta tarefa e os passos dela?')) return; const p = A._p(); S.projects = S.projects.filter(x => x !== p); await db.del('projects', p.id); p.done = true; await syncTaskAlarm(p); S.openProject = null; render(); },
  async setQuad(id, q) {
    const t = objFor('projects', id); if (!t) return;
    t.imp = q === 'q1' || q === 'q2'; t.urg = (q === 'q1' || q === 'q3') ? true : null;
    await db.put('projects', t); await tidyTasks(); render();
    if (quadOf(t) !== q) toast('Prazo até amanhã: ela fica como urgente. Dá para mudar em Ajustes.');
  },
  async setDeadline(id, v) { const t = objFor('projects', id); t.deadline = v || ''; await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); S.whenOpen[id] = true; render(); },
  async setTaskTime(id, v) { const t = objFor('projects', id); t.time = v || ''; if (t.time && !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '')) { const c = finalizeCapture({ time: t.time, rep: t.rep, date: '' }); t.deadline = c.date; } await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); S.whenOpen[id] = true; render(); },
  async setTaskAlert(id, v) { const t = objFor('projects', id); t.alertMin = Number(v) || 0; await db.put('projects', t); await syncTaskAlarm(t); S.whenOpen[id] = true; render(); },
  setTaskPlace(id, v) { const t = objFor('projects', id); t.place = v; persist('projects', t); later('alarm:' + id, () => syncTaskAlarm(t), 800); },
  async setTaskCat(id, c) { const t = objFor('projects', id); t.cat = t.cat === c ? null : c; await db.put('projects', t); S.whenOpen[id] = true; render(); },
  async setRep(id, k) {
    const t = objFor('projects', id);
    const base = keyToDate(t.deadline) || new Date();
    t.rep = k === 'nao' ? null : k === 'dia' ? { kind: 'dia' } : k === 'semana' ? { kind: 'semana', days: [base.getDay()] } : { kind: 'mes', dom: base.getDate() };
    if (t.rep) { t.series = t.series || t.id; t.spawned = false; if (!/^\d{4}-\d{2}-\d{2}$/.test(t.deadline || '')) t.deadline = dateKey(nextOccurrence(t.rep, new Date(), true)); t.someday = false; t.soltaSince = null; }
    await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); S.whenOpen[id] = true; render();
  },
  async toggleRepDay(id, d) {
    const t = objFor('projects', id); if (!t.rep || t.rep.kind !== 'semana') return;
    const days = t.rep.days.includes(d) ? t.rep.days.filter(x => x !== d) : [...t.rep.days, d].sort();
    if (!days.length) return toast('Deixe pelo menos um dia');
    t.rep = { kind: 'semana', days };
    const dl = keyToDate(t.deadline); if (dl && !days.includes(dl.getDay())) { t.deadline = dateKey(nextOccurrence(t.rep, new Date(), true)); }
    await db.put('projects', t); await syncTaskAlarm(t); S.whenOpen[id] = true; render();
  },
  async setRepDom(id, v) {
    const t = objFor('projects', id); const n = Math.round(Number(v)); if (!(n >= 1 && n <= 31)) return toast('Dia de 1 a 31');
    t.rep = { kind: 'mes', dom: n }; t.deadline = dateKey(nextOccurrence(t.rep, new Date(), true));
    await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks(); S.whenOpen[id] = true; render();
  },
  whenToggle(id, open) { S.whenOpen[id] = open; },
  setCatFilter(c) { S.catFilter = c; render(); },
  async taskNext(id) {
    const t = objFor('projects', id);
    if (!(t.what || '').trim()) return toast('Escreva o "pronto quando" primeiro');
    if (!(t.steps || []).length) t.steps = [{ t: '', est: '', d: false }];
    t.whatDone = true; S.editWhat = null; await db.put('projects', t); render(); window.scrollTo(0, 0);
  },
  editWhat(id) { S.editWhat = id; render(); },
  async taskReady(id) {
    const t = objFor('projects', id);
    t.steps = (t.steps || []).filter(x => (x.t || '').trim());
    if (!t.steps.length) { t.steps = [{ t: '', est: '', d: false }]; return toast('Escreva pelo menos um passo'); }
    t.ready = true; await db.put('projects', t); await syncTopForTask(t); render(); window.scrollTo(0, 0);
  },
  async taskEdit(id) { const t = objFor('projects', id); t.ready = false; if (!(t.steps || []).length) t.steps = [{ t: '', est: '', d: false }]; await db.put('projects', t); render(); },
  async taskSlice(id) {
    const t = objFor('projects', id); if (!(t.title || '').trim()) return toast('Dê um nome à tarefa');
    S.taskBusy = id; render();
    try {
      const p = await A._plan(t.title, 'novo', { pronto: t.what || '' });
      applyPlan(t, { passos: p.passos, preciso_de: t.need ? '' : p.preciso_de, pronto_quando: t.what ? '' : p.pronto_quando }, false);
      if (t.imp !== true && t.imp !== false) { t.imp = !!p.importante; t.urg = p.urgente ? true : null; }
      await db.put('projects', t); await tidyTasks(); toast(`Fatiei em ${p.passos.length} passos. Revise.`);
    } catch (e) { toast('Não deu para fatiar: ' + (e.message || e)); }
    S.taskBusy = null; render();
  },
  async taskStuck(id) {
    const t = objFor('projects', id); const cur = t && nextStep(t); if (!cur) return;
    if (!hasAI()) { t.ready = false; await db.put('projects', t); S.openProject = id; S.tab = 'tarefas'; render(); return toast('Reescreva o passo em pedaços menores'); }
    S.taskBusy = id; render();
    try {
      const p = await A._plan(t.title, 'travei', { passo: cur.t, pronto: t.what || '' });
      t.steps.splice(t.steps.indexOf(cur), 1, ...p.passos.map(x => ({ t: x.texto, est: x.minutos, d: false })));
      await db.put('projects', t); await syncTopForTask(t);
      const f = S.focus;
      if (f && f.taskId === id) { const ns = nextStep(t); f.step = ns ? ns.t : ''; f.stepIdx = ns ? t.steps.indexOf(ns) : null; saveFocus(); }
      toast(`Quebrei em ${p.passos.length} pedaços menores`);
    } catch (e) { toast('Não deu: ' + (e.message || e)); }
    S.taskBusy = null; render();
  },
  taskFocus(id) { return A.focusStart(25, null, '', { taskId: id }); },
  async taskComplete(id) { const t = objFor('projects', id); const nx = await finishTask(t); render(); toast(nx ? `Tarefa concluída. ${nextLabel(nx)}` : 'Tarefa concluída'); },
  async taskSkip(id) { const t = objFor('projects', id); const nx = await finishTask(t, true); S.openProject = null; render(); toast(nx ? `Pulei esta. ${nextLabel(nx)}` : 'Pulei esta'); },
  async taskReopen(id) { const t = objFor('projects', id); t.done = false; t.doneAt = null; t.skipped = false; t.someday = false; if (!nextStep(t)) t.ready = false; await db.put('projects', t); await syncTaskAlarm(t); render(); },
  async taskSomeday(id) { const t = objFor('projects', id); t.someday = true; await db.put('projects', t); await syncTaskAlarm(t); S.openProject = null; render(); toast('Foi para Talvez um dia'); },
  async taskBack(id) { const t = objFor('projects', id); t.someday = false; t.soltaSince = null; if (quadOf(t) === 'q4') t.imp = null; await db.put('projects', t); render(); },
  async useThree() {
    const sug = suggestThree(); if (!sug.length) return;
    if (S.page.id !== todayKey()) await loadPage(todayKey());
    if (S.page.top3.some(x => (x.t || '').trim() && !x.d) && !confirm('Trocar as 3 do dia de hoje por estas?')) return;
    S.page.top3 = [0, 1, 2].map(i => { const t = sug[i]; if (!t) return { t: '', s: '', d: false }; const st = nextStep(t); return { t: t.title, s: st ? st.t : '', d: false, task: t.id }; });
    await savePage(); S.tab = 'hoje'; S.openProject = null; render(); window.scrollTo(0, 0); toast('As 3 do dia estão em Hoje');
  },
  async shareTask(id) {
    const t = objFor('projects', id); if (!t) return;
    try {
      const link = await shareLink(taskPayload(t));
      const text = taskShareText(t, link);
      const res = await N.shareText(text);
      if (res === 'copied') toast('Texto com o link copiado');
      else if (res === 'shown') prompt('Copie e mande:', text);
    } catch (e) { if (!/cancel|abort/i.test(String(e.message || e))) toast('Não deu para compartilhar: ' + (e.message || e)); }
  },
    incomingClose() { S.incoming = null; render(); },
  async incomingAccept() {
    const inc = S.incoming; if (!inc) return;
    const x = inc.task;
    const t = newTaskObj(String(x.title));
    t.what = String(x.what || ''); t.whatDone = !!t.what;
    t.imp = x.imp === true ? true : x.imp === false ? false : null; t.urg = x.urg === true ? true : null;
    t.deadline = /^\d{4}-\d{2}-\d{2}$/.test(x.deadline || '') ? x.deadline : '';
    t.need = String(x.need || ''); t.when = String(x.when || '');
    t.steps = (x.steps || []).filter(s => (s.t || '').trim()).map(s => ({ t: String(s.t), est: s.est || '', d: false }));
    t.ready = !!t.what && t.steps.length > 0;
    t.from = inc.de || '';
    if (/^\d{1,2}:\d{2}$/.test(x.time || '')) t.time = x.time;
    t.place = String(x.place || ''); t.alertMin = Number(x.alertMin) || 0;
    t.rep = validRep(x.rep); if (t.rep) t.series = t.id;
    const kc = x.cat ? catByName(x.cat) : null; if (kc) t.cat = kc.id;
    S.projects.unshift(t); await db.put('projects', t); await syncTaskAlarm(t); await tidyTasks();
    S.incoming = null; S.tab = 'tarefas'; S.openProject = t.id; S.editWhat = null; S.drawer = false;
    render(); window.scrollTo(0, 0); toast('Tarefa adicionada');
  },
    setPinOpt(k) { S.settings[k] = S.settings[k] === false; persist('settings', S.settings, true); render(); },
  setPrioOpt(k) { S.settings[k] = S.settings[k] === false; persist('settings', S.settings, true); tidyTasks().then(render); },
  async organizeDump() {
    const txt = (S.page.dump || '').trim();
    if (!txt) return toast('Descarregue algo primeiro');
    A.openAssistant();
    await A.send(`Organiza meu descarrego mental. Separe em tarefas (crie na matriz, já fatiadas se forem grandes), lembretes com data e ideias. Não mexa nas 3 do dia. Descarrego:\n${txt}`);
  },
  async addIdea() { const v = document.getElementById('ideaInput').value.trim(); if (!v) return; const i = { id: uid(), t: v, when: '', at: Date.now(), done: false }; S.ideas.unshift(i); await db.put('ideas', i); render(); document.getElementById('ideaInput')?.focus(); },
  toggleIdea(id) { const i = objFor('ideas', id); i.done = !i.done; persist('ideas', i, true); render(); },
  async removeIdea(id) { S.ideas = S.ideas.filter(i => i.id !== id); await db.del('ideas', id); render(); },
  async addHabit() { const v = document.getElementById('habitInput').value.trim(); if (!v) return; const hb = { id: uid(), t: v, marks: [false, false, false, false, false, false, false], order: S.habits.length }; S.habits.push(hb); await db.put('habits', hb); render(); },
  toggleHabit(id, i) { const hb = objFor('habits', id); hb.marks[i] = !hb.marks[i]; persist('habits', hb, true); render(); },
  resetHabit(id) { const hb = objFor('habits', id); hb.marks = [false, false, false, false, false, false, false]; persist('habits', hb, true); render(); },
  async removeHabit(id) { if (!confirm('Remover este hábito?')) return; S.habits = S.habits.filter(x => x.id !== id); await db.del('habits', id); render(); },
  async addReminder() {
    const title = document.getElementById('remTitle').value.trim(); if (!title) return;
    const at = document.getElementById('remAt').value; const note = document.getElementById('remNote').value.trim();
    const r = { id: uid(), title, at, note, done: false };
    S.reminders.push(r); await db.put('reminders', r);
    if (at && N.isNative()) { const ok = await N.notificationsAllowed(true); S.notif = ok; if (ok) await N.scheduleOnce(r.id, 'Lembrete', title, new Date(at)); }
    toast('Lembrete adicionado'); render();
  },
  async toggleReminder(id) { const r = objFor('reminders', id); r.done = !r.done; await db.put('reminders', r); if (r.done) await N.cancelOnce(id); render(); },
  async removeReminder(id) { S.reminders = S.reminders.filter(x => x.id !== id); await db.del('reminders', id); await N.cancelOnce(id); render(); },

  // Backup no Google Drive
  async connectDrive() {
    try {
      S.driveBusy = true; render();
      const res = await N.drive.create('TDAH-Vida-Real-backup.json', JSON.stringify(await backupPayload()));
      Object.assign(S.settings, { driveUri: res.uri, driveName: res.name, lastDriveBackup: Date.now(), lastBackup: Date.now(), driveError: null });
      await db.put('settings', S.settings);
      toast(`Drive conectado: ${res.name}`);
    } catch (e) { const m = String(e.message || e); if (!/cancel/i.test(m)) toast(m); }
    S.driveBusy = false; render();
  },
  async backupNow() { S.driveBusy = true; render(); S.driveBusy = false; await driveBackup(false); render(); },
  async disconnectDrive() {
    if (!confirm('Desconectar o arquivo do Google Drive? O backup que já está lá continua lá.')) return;
    DRIVE_KEYS.forEach(k => delete S.settings[k]); await db.put('settings', S.settings); render();
  },
  async restoreDrive() {
    try {
      const res = await N.drive.open();
      let data;
      try { data = JSON.parse(res.data); } catch (e) { throw new Error('Esse arquivo não é um backup do app.'); }
      if (!data || data.app !== 'tdah-vida-real') throw new Error('Esse arquivo não é um backup do app.');
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'data desconhecida';
      if (!confirm(`Restaurar o backup de ${when}? Os dados deste celular serão substituídos pelos do backup.`)) return;
      const n = await importAll(data, 'replace');
      await loadAll();
      if (res.writable) Object.assign(S.settings, { driveUri: res.uri, driveName: res.name, lastDriveBackup: Date.now(), lastBackup: Date.now(), driveError: null });
      S.settings.onboarded = true;
      await db.put('settings', S.settings);
      await syncNotifications();
      if (S.onb) S.onb = newOnb('ia');
      toast(`Backup restaurado: ${n} registros${res.writable ? '. Drive conectado.' : ''}`);
      render();
    } catch (e) { const m = String(e.message || e); if (!/cancel/i.test(m)) toast(m); }
  },

  // Voz
  async voiceSend() {
    try {
      const text = await N.listenOnce();
      if (!text) return toast('Não entendi. Tente de novo.');
      await A.send(text);
    } catch (e) { const m = String(e.message || e); toast(/cancel|no match|nomatch/i.test(m) ? 'Não entendi. Tente de novo.' : m); }
  },
  async voiceDump() {
    try {
      const text = await N.listenOnce(); if (!text) return toast('Não entendi. Tente de novo.');
      if (S.page.id !== todayKey() && !S.viewingPast) await loadPage(todayKey());
      S.page.dump = (S.page.dump ? S.page.dump.replace(/\s+$/, '') + '\n' : '') + text;
      await savePage(); render(); toast('Anotado no descarrego');
    } catch (e) { toast(e.message || String(e)); }
  },

  // Agenda da casa
  async loadCalendars() {
    const perm = await N.requestCalendarWrite();
    if (perm !== 'granted') return toast('Permita o acesso à agenda para escolher');
    S.calPerm = 'granted';
    try { S.calendars = await N.listWritableCalendars(); } catch (e) { toast('Erro: ' + (e.message || e)); S.calendars = []; }
    render();
  },
  async setHouse(id) {
    const c = (S.calendars || []).find(x => x.id === id); if (!c) return;
    S.settings.houseCalendarId = c.id; S.settings.houseCalendarTitle = c.title; await db.put('settings', S.settings);
    await loadEvents(); toast(`Agenda da casa: ${c.title}`); render();
  },
  openHouseForm() { S.houseForm = true; render(); const t = document.getElementById('hTitle'); if (t) t.focus(); },
  closeHouseForm() { S.houseForm = false; render(); },
  async saveHouseEvent() {
    const title = document.getElementById('hTitle').value.trim(); if (!title) return toast('Escreva o compromisso');
    const start = new Date(document.getElementById('hStart').value);
    const durMin = Number(document.getElementById('hDur').value), location = document.getElementById('hLoc').value.trim();
    try {
      if ((await N.requestCalendarWrite()) !== 'granted') return toast('Permita editar a agenda');
      const msg = await createHouseEvent({ title, start, durMin, location });
      S.houseForm = false; toast(msg.replace('Compromisso criado na agenda da casa: ', 'Salvo: ')); render();
    } catch (e) { toast('Não deu para salvar: ' + (e.message || e)); }
  },

  // Configuração guiada
  startOnboarding() { S.onb = newOnb('voce'); render(); window.scrollTo(0, 0); },
  onbSet(k, v, rerender) { S.onb.d[k] = v; if (rerender) render(); },
  onbArea(k) { const a = S.onb.d.areas; const i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else if (a.length < 3) a.push(k); else toast('Escolha no máximo 3'); render(); },
  onbAddMed() {
    const name = document.getElementById('onbMedName').value.trim(), t = document.getElementById('onbMedTime').value;
    if (!name || !t) return toast('Preencha o nome e o horário');
    const ex = S.onb.d.meds.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (ex) { if (!ex.times.includes(t)) ex.times.push(t); ex.times.sort(); } else S.onb.d.meds.push({ name, times: [t] });
    render(); const el = document.getElementById('onbMedName'); if (el) el.value = name;
  },
  onbRemoveMed(k) { S.onb.d.meds.splice(k, 1); render(); },
  async onbNext() {
    const o = S.onb; const i = ONB_STEPS.indexOf(o.step);
    if (o.step === 'voce' && !o.d.name.trim()) return toast('Escreva como quer ser chamado');
    if (o.step === 'sobre') { await applyOnb(); toast('Salvo'); }
    o.step = ONB_STEPS[Math.min(i + 1, ONB_STEPS.length - 1)];
    if (o.step === 'permissoes' && N.isNative()) { S.notif = await N.notificationsAllowed(false); S.exact = await N.exactAlarmStatus(); }
    render(); window.scrollTo(0, 0);
  },
  onbBack() { const o = S.onb; const i = ONB_STEPS.indexOf(o.step); o.step = ONB_STEPS[Math.max(1, i - 1)]; render(); window.scrollTo(0, 0); },
  async onbFinish() {
    S.settings.onboarded = true; await db.put('settings', S.settings);
    S.onb = null; S.tab = 'hoje';
    await syncNotifications(); render(); window.scrollTo(0, 0);
  },

  // Remédios e água
  async toggleDose(key) { const has = !!(S.page.doses && S.page.doses[key]); await markDose(key, S.page.id, !has); render(); },
  async addMed() {
    const v = document.getElementById('medInput').value.trim(); if (!v) return;
    const m = { id: uid(), name: v, kind: /^\s*[áa]gua/i.test(v) ? 'agua' : 'remedio', times: [], carry: true, order: S.meds.length };
    S.meds.push(m); S.medEdit = true; await db.put('meds', m); render();
    const t = document.getElementById('t-' + m.id); if (t) t.focus();
  },
  async removeMed(id) { if (!confirm('Remover este item e os avisos dele?')) return; S.meds = S.meds.filter(m => m.id !== id); await db.del('meds', id); await syncDoses(); render(); },
  async setMedKind(id, k) { const m = objFor('meds', id); m.kind = k; await db.put('meds', m); await syncDoses(); render(); },
  async toggleCarry(id) { const m = objFor('meds', id); m.carry = m.carry === false; await db.put('meds', m); await syncDoses(); render(); },
  async addTime(id) {
    const el = document.getElementById('t-' + id); const v = el && el.value;
    if (!v || !/^\d{2}:\d{2}$/.test(v)) return toast('Escolha um horário');
    const m = objFor('meds', id); m.times = [...new Set([...(m.times || []), v])].sort();
    await db.put('meds', m);
    if (N.isNative() && !S.notif) { S.notif = await N.notificationsAllowed(true); }
    await syncDoses(); toast(`Aviso diário às ${v}`); render();
  },
  async removeTime(id, i) { const m = objFor('meds', id); m.times.splice(i, 1); await db.put('meds', m); await syncDoses(); render(); },
  async bodyToMed(i) {
    const name = S.settings.bodyChecks[i]; if (!name) return;
    const m = { id: uid(), name, kind: /^\s*[áa]gua/i.test(name) ? 'agua' : 'remedio', times: [], carry: true, order: S.meds.length };
    S.meds.push(m); await db.put('meds', m);
    S.settings.bodyChecks.splice(i, 1); await db.put('settings', S.settings);
    toast('Agora adicione os horários'); render();
  },
  async setDoseSetting(k, v) { S.settings[k] = Number(v); await db.put('settings', S.settings); await syncDoses(); toast('Salvo'); },
  async openExact() { S.exact = await N.openExactAlarmSettings(); setTimeout(async () => { S.exact = await N.exactAlarmStatus(); await syncDoses(); render(); }, 1500); },

  // Assistente
  saveKey() {
    const v = document.getElementById('apiKey').value.trim();
    const P = PROVIDERS[keyStore.provider()];
    if (v.length < 20 || (P.keyPrefix && !v.startsWith(P.keyPrefix))) return toast('Essa chave não parece válida. Confira e cole de novo.');
    keyStore.set(v); toast('Chave salva'); render();
  },
  removeKey() { if (!confirm('Remover a chave da API deste celular?')) return; keyStore.set(''); render(); },
  setProvider(p) { keyStore.setProvider(p); render(); },
  setModel(v) { keyStore.setModel(v); toast('Modelo alterado'); },
  async loadModels() {
    try { const list = await listGeminiModels(keyStore.get()); keyStore.setExtraModels(list); toast(`${list.length} modelos disponíveis`); render(); }
    catch (e) { toast('Não consegui listar: ' + (e.message || e)); }
  },
  toggleShareBody() { S.settings.shareBody = !S.settings.shareBody; persist('settings', S.settings, true); render(); },
  async newChat() { S.chat = { id: 'chat', display: [] }; await db.put('misc', S.chat); render(); },
  async send(preset) {
    if (S.sending) return;
    const el = document.getElementById('chatInput');
    const text = (preset || (el && el.value) || '').trim();
    if (!text) return;
    S.chat.display.push({ role: 'user', text });
    S.sending = true; render(); window.scrollTo(0, document.body.scrollHeight);
    try {
      let hist = S.chat.display.slice(-20).map(m => ({ role: m.role, content: m.text || '…' }));
      while (hist.length && hist[0].role !== 'user') hist.shift();
      const { text: reply, actions } = await runAgent({ provider: keyStore.provider(), apiKey: keyStore.get(), model: keyStore.model(), system: buildSystem(buildContext()), history: hist, execTool });
      S.chat.display.push({ role: 'assistant', text: reply || (actions.length ? 'Feito.' : '…'), actions });
    } catch (e) {
      S.chat.display.push({ role: 'assistant', text: 'Não consegui responder agora: ' + (e.message || e) });
    }
    S.chat.display = S.chat.display.slice(-60);
    await db.put('misc', S.chat);
    S.sending = false; render(); window.scrollTo(0, document.body.scrollHeight);
  },

  // Ajustes
  editBody(i, v) {
    const old = S.settings.bodyChecks[i]; S.settings.bodyChecks[i] = v;
    if (S.page.body[old] !== undefined) { S.page.body[v] = S.page.body[old]; delete S.page.body[old]; savePage(); }
    persist('settings', S.settings);
  },
  addBody() { S.settings.bodyChecks.push('Novo item'); persist('settings', S.settings, true); render(); },
  removeBody(i) { S.settings.bodyChecks.splice(i, 1); persist('settings', S.settings, true); render(); },
  async enableNotif() { const ok = await N.notificationsAllowed(true); S.notif = ok; if (ok) { await syncNotifications(); toast('Lembretes ativados'); } else toast('Permissão negada. Ative nas configurações do Android.'); render(); },
  async exportData() {
    try {
      const data = await backupPayload();
      const res = await N.saveAndShareJson(`tdah-backup-${todayKey()}.json`, data);
      S.settings.lastBackup = Date.now(); await db.put('settings', S.settings);
      toast(res === 'shared' ? 'Escolha onde salvar o backup' : 'Backup baixado');
      render();
    } catch (e) { if (!/cancel/i.test(String(e.message || e))) toast('Erro ao exportar: ' + (e.message || e)); }
  },
  setImportMode(m) { S.importMode = m; render(); },
  pickImport(mode) { if (mode) S.importMode = mode; const fi = document.getElementById('fileInput'); fi.value = ''; fi.click(); },
  async doImport(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (S.importMode === 'replace' && !confirm('Substituir tudo? Os dados atuais das coleções do arquivo serão apagados.')) return;
      const keep = Object.fromEntries(DRIVE_KEYS.map(k => [k, S.settings[k]]));
      const n = await importAll(data, S.importMode);
      await loadAll();
      Object.assign(S.settings, keep); await db.put('settings', S.settings);
      await syncNotifications();
      if (S.onb) S.onb = newOnb('ia');
      toast(`Importado: ${n} registros`); render();
    } catch (e) { toast('Não deu para importar: ' + (e.message || e)); }
  },
  async wipe() {
    if (!confirm('Apagar TODOS os dados deste app? Faça um backup antes.')) return;
    if (!confirm('Tem certeza? Isso não pode ser desfeito.')) return;
    await wipeAll(); await loadAll(); await syncNotifications(); toast('Dados apagados'); S.tab = 'hoje'; render();
  },
};
window.A = A;
window.__tdah = { S, carryPlan, dosesForDay, pinnedPlan, handleIncomingData, handleIncomingUri, taskPayload, taskShareText, shareLink }; // para testes

// ---------------- Início ----------------
async function start() {
  document.getElementById('fileInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) A.doImport(f); });
  await loadAll();
  loadFocus();
  if (!S.settings.onboarded && !S.settings.name) S.onb = newOnb();
  if (S.focus && !S.onb) S.tab = 'foco';
  render();
  focusTick();
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const onChange = () => { if ((S.settings.theme || 'auto') === 'auto') applyTheme(); }; if (mq.addEventListener) mq.addEventListener('change', onChange); }
  if (N.isNative()) {
    N.onOpenUrl(handleIncomingUri);
    N.launchUrl().then(handleIncomingUri);
    N.initFocusChannels();
    const info = await N.appInfo();
    if (info) S.appVersion = `${info.version} (build ${info.build})`;
    maybeAutoBackup(24 * 3600000);
    await N.initDoseNotifications(onDoseAction);
    S.exact = await N.exactAlarmStatus();
    S.calPerm = await N.calendarPermission(false);
    if (S.calPerm === 'granted') await loadEvents();
    await syncNotifications();
    render();
  }
  // Botão voltar: fecha telas internas antes de sair
  N.onBackButton(() => {
    if (S.onb) { if (ONB_STEPS.indexOf(S.onb.step) > 1) A.onbBack(); else N.minimizeApp(); }
    else if (S.drawer) A.menu(false);
    else if (S.parkOpen) { S.parkOpen = false; render(); }
    else if (['assistente', 'foco', 'ajustes'].includes(S.tab)) A.back();
    else if (S.editRoutine) { S.editRoutine = false; render(); }
    else if (S.openRoutine) A.closeRoutine();
    else if (S.openProject) A.closeProject();
    else if (S.viewingPast) A.openPage(todayKey());
    else if (S.tab !== 'hoje') A.tab('hoje');
    else N.minimizeApp();
  });
  // Ao voltar para o app: troca de dia e agenda atualizada
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') { maybeAutoBackup(); updatePinned(true); return; }
    N.pinnedVisible().then(v => { if (!v) updatePinned(true); });
    if (!S.viewingPast && S.page.id !== todayKey()) await loadPage(todayKey());
    if (S.calPerm === 'granted') await loadEvents();
    if (N.isNative()) { S.exact = await N.exactAlarmStatus(); later('dosesync', syncDoses, 500); }
    if (S.focus && S.focus.phase === 'run') focusTick();
    const active = document.activeElement;
    if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) render();
  });
}

start().catch(e => {
  document.getElementById('app').innerHTML = `<main><div class="card"><h2>Algo deu errado ao abrir</h2><p>${h(e.message || e)}</p></div></main>`;
});
