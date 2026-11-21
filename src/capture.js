// Captura mágica: lê data, hora, local e repetição de um texto livre em português.
// Funciona sem IA. Ex.: "dentista sexta 15h no centro" → título "Dentista", sexta 15:00, local "centro".

const DAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAYS_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NOT_PLACES = /^(whats ?app|zap|teams|zoom|meet|google|app|aplicativo|e-?mail|instagram|insta|telefone|celular|site|sistema|sap|excel|power ?bi|linkedin|slack|outlook|drive|youtube|netflix|spotify|gmail)$/;
const CONNECT = /^(de|da|do|e|pra|para|com|as|a|o|ate|que|amanha|hoje|depois|dia|semana|mes|todo|toda|todos|todas|proxima|proximo|cedo|manha|tarde|noite|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d+h?)$/;
const DAY_RE = '(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?';
const MONTH_RE = `(${MONTHS.join('|')})`;
const PLACES = ['centro', 'farmacia', 'mercado', 'supermercado', 'banco', 'escola', 'creche', 'hospital', 'clinica', 'consultorio', 'shopping', 'padaria', 'posto', 'academia', 'trabalho', 'escritorio', 'correio', 'correios', 'cartorio', 'dentista', 'laboratorio', 'igreja', 'feira', 'praia', 'aeroporto', 'rodoviaria', 'oficina', 'petshop', 'veterinario', 'faculdade', 'prefeitura', 'condominio', 'portaria', 'loja', 'restaurante'];

const pad = n => String(n).padStart(2, '0');
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function keyToDate(k) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Minúsculas e sem acento, com o mesmo tamanho do texto original (para recortar pelos índices).
const fold = s => s.split('').map(c => c.normalize('NFD')[0].toLowerCase()).join('');

function nextWeekday(now, wd, allowToday = false) {
  const base = startOfDay(now);
  let diff = (wd - base.getDay() + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(base, diff);
}
function dayOfMonth(now, dd, mm = null, yy = null) {
  const base = startOfDay(now);
  if (mm !== null) {
    let y = yy !== null ? yy : base.getFullYear();
    let d = new Date(y, mm, dd);
    if (yy === null && d < base) d = new Date(y + 1, mm, dd);
    return d.getMonth() === mm ? d : null;
  }
  let d = new Date(base.getFullYear(), base.getMonth(), dd);
  if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, dd);
  return d.getDate() === dd ? d : null;
}

// Repetição: { kind: 'dia' } | { kind: 'semana', days: [0..6] } | { kind: 'mes', dom: 1..31 }
export function lastDom(y, m) { return new Date(y, m + 1, 0).getDate(); }
// Primeira data da repetição a partir de `from` (inclusive) ou depois dele.
export function nextOccurrence(rep, from, inclusive = true) {
  if (!rep || !rep.kind) return null;
  let d = startOfDay(from);
  if (!inclusive) d = addDays(d, 1);
  for (let i = 0; i < 400; i++) {
    if (rep.kind === 'dia') return d;
    if (rep.kind === 'semana' && (rep.days || []).includes(d.getDay())) return d;
    if (rep.kind === 'mes') { const dom = Math.min(Number(rep.dom) || 1, lastDom(d.getFullYear(), d.getMonth())); if (d.getDate() === dom) return d; }
    d = addDays(d, 1);
  }
  return null;
}
export function repLabel(rep) {
  if (!rep || !rep.kind) return '';
  if (rep.kind === 'dia') return 'todo dia';
  if (rep.kind === 'mes') return `todo dia ${rep.dom} do mês`;
  const ds = [...new Set(rep.days || [])].sort();
  if (ds.join() === '1,2,3,4,5') return 'dias úteis';
  if (ds.length === 7) return 'todo dia';
  if (ds.length === 1) return `${ds[0] === 0 || ds[0] === 6 ? 'todo' : 'toda'} ${DAYS_PT[ds[0]]}`;
  return 'toda ' + ds.map(x => DAYS_SHORT[x]).join(', ');
}
export function validRep(rep) {
  if (!rep || !['dia', 'semana', 'mes'].includes(rep.kind)) return null;
  if (rep.kind === 'semana') { const days = [...new Set((rep.days || []).map(Number).filter(x => x >= 0 && x <= 6))].sort(); return days.length ? { kind: 'semana', days } : null; }
  if (rep.kind === 'mes') { const dom = Math.round(Number(rep.dom)); return dom >= 1 && dom <= 31 ? { kind: 'mes', dom } : null; }
  return { kind: 'dia' };
}

export function parseCapture(text, now = new Date()) {
  const orig = String(text || '');
  const f = fold(orig);
  const cut = []; // trechos [ini, fim) que saem do título
  const take = m => { cut.push([m.index, m.index + m[0].length]); };
  const free = m => !cut.some(([a, b]) => m.index < b && m.index + m[0].length > a);
  const first = re => { re.lastIndex = 0; let m; while ((m = re.exec(f))) { if (free(m)) return m; if (!re.global) break; } return null; };
  let date = null, time = '', rep = null, place = '', partOfDay = '';

  // ---- Repetição ----
  let m;
  if ((m = first(/\btodo(?:s os)? dias? (\d{1,2})(?: de cada mes| do mes)?\b/g)) && +m[1] >= 1 && +m[1] <= 31) { rep = { kind: 'mes', dom: +m[1] }; take(m); }
  else if ((m = first(/\b(?:(?:todo )?dias? uteis|de segunda a sexta(?:-feira)?)\b/g))) { rep = { kind: 'semana', days: [1, 2, 3, 4, 5] }; take(m); }
  else if ((m = first(/\b(?:todo dia|todos os dias|diariamente)\b/g))) { rep = { kind: 'dia' }; take(m); }
  else if ((m = first(new RegExp(`\\btod[oa]s? (?:as |os )?${DAY_RE}(?:(?:, ?| e )(?:a |o |as |os )?${DAY_RE})*`, 'g')))) {
    const days = [...m[0].matchAll(new RegExp(DAY_RE, 'g'))].map(x => DAYS.indexOf(x[1]));
    rep = { kind: 'semana', days: [...new Set(days)].sort() }; take(m);
  } else if ((m = first(/\b(?:toda semana|todas as semanas|semanalmente)\b/g))) { rep = { kind: 'semana', days: [] }; take(m); }
  else if ((m = first(/\b(?:todo mes|todos os meses|mensalmente)\b/g))) { rep = { kind: 'mes', dom: 0 }; take(m); }

  // ---- Data ----
  if ((m = first(/\bdepois de amanha\b/g))) { date = addDays(startOfDay(now), 2); take(m); }
  else if ((m = first(/\bamanha\b/g))) { date = addDays(startOfDay(now), 1); take(m); }
  else if ((m = first(/\bhoje\b/g))) { date = startOfDay(now); take(m); }
  if (!date && (m = first(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g))) {
    const yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    const d = dayOfMonth(now, +m[1], +m[2] - 1, yy); if (d) { date = d; take(m); }
  }
  if (!date && (m = first(new RegExp(`\\b(?:(?:no )?dia )?(\\d{1,2}) de ${MONTH_RE}\\b`, 'g')))) {
    const d = dayOfMonth(now, +m[1], MONTHS.indexOf(m[2])); if (d) { date = d; take(m); }
  }
  if (!date && !rep && (m = first(/\b(?:no |ate o |ate )?dia (\d{1,2})\b(?! ?(?:de cada|do mes))/g))) {
    const d = dayOfMonth(now, +m[1]); if (d) { date = d; take(m); }
  }
  if (!date && (m = first(/\b(?:em|daqui a|daqui) (\d{1,2}) dias?\b/g))) { date = addDays(startOfDay(now), +m[1]); take(m); }
  if (!date && (m = first(/\b(?:semana que vem|proxima semana)\b/g))) { date = nextWeekday(now, 1); take(m); }
  if (!date && (m = first(/\b(?:no |neste |nesse |este |esse )?fim de semana\b/g))) { date = nextWeekday(now, 6, true); take(m); }
  if (!date && !(rep && rep.kind === 'semana' && rep.days.length) && (m = first(new RegExp(`\\b(?:(?:n?[ao]s? )?(?:proxim[ao] |nest[ae] |ness[ae] |est[ae] |ess[ae] )?)${DAY_RE}(?: que vem)?\\b`, 'g')))) {
    date = nextWeekday(now, DAYS.indexOf(m[1])); take(m);
  }

  // ---- Hora ----
  if ((m = first(/\b(?:(?:as|a|ao|ate as|por volta das) )?meio-? ?dia(?: e meia)?\b/g))) { time = /meia$/.test(m[0]) ? '12:30' : '12:00'; take(m); }
  else if ((m = first(/\b(?:(?:as|a) )?meia-? ?noite\b/g))) { time = '00:00'; take(m); }
  else if ((m = first(/\b(?:(?:as|a|ate as|por volta das|lá pelas|la pelas) )?(\d{1,2})(?::(\d{2})|h(\d{2})?(?:min)?)(?: ?(?:da|de) (manha|tarde|noite))?(?![\d/])/g))) {
    let hh = +m[1]; const mm = +(m[2] || m[3] || 0);
    if (m[4] && (m[4] === 'tarde' || m[4] === 'noite') && hh < 12) hh += 12;
    if (hh < 24 && mm < 60) { time = `${pad(hh)}:${pad(mm)}`; take(m); }
  } else if ((m = first(/\b(?:as|a|ate as|por volta das) (\d{1,2})(?: e (meia|\d{1,2}))?(?: ?(?:da|de) (manha|tarde|noite))?\b(?! ?(?:dias?|horas?|semanas?|de [a-z]))/g))) {
    let hh = +m[1]; const mm = m[2] === 'meia' ? 30 : +(m[2] || 0);
    if (m[3] && (m[3] === 'tarde' || m[3] === 'noite') && hh < 12) hh += 12;
    else if (!m[3] && hh >= 1 && hh <= 6) hh += 12; // "às 3" quase sempre é 15h
    if (hh < 24 && mm < 60) { time = `${pad(hh)}:${pad(mm)}`; take(m); }
  } else if ((m = first(/\b(\d{1,2}) (?:da|de) (manha|tarde|noite)\b/g))) {
    let hh = +m[1]; if ((m[2] === 'tarde' || m[2] === 'noite') && hh < 12) hh += 12;
    if (hh < 24) { time = `${pad(hh)}:00`; take(m); }
  }
  if (!time && (m = first(/\b(?:de|pela|a|à|na) (manha|tarde|noite)\b|\bcedo\b/g))) { partOfDay = m[1] || 'manha'; take(m); }

  // ---- Local ----
  // 1) Nome próprio depois de no/na/em ("na Movida", "no Hospital Vera Cruz"); 2) lugar comum ("no centro", "na farmácia").
  const cap = /\b(?:no|na|nos|nas|em) ((?:[A-ZÀ-Ú][\wÀ-ú'’.-]*)(?: (?:[A-ZÀ-Ú\d][\wÀ-ú'’.-]*|de|da|do|dos|das))*)/g;
  let c; while ((c = cap.exec(orig))) {
    const name = c[1].replace(/( (de|da|do|dos|das))+$/, '');
    const span = { index: c.index, 0: c[0].slice(0, c[0].length - (c[1].length - name.length)) };
    if (free(span) && name.length >= 3 && !NOT_PLACES.test(fold(name))) { place = name; cut.push([c.index, c.index + span[0].length]); break; }
  }
  if (!place) {
    const placeRe = new RegExp(`\\b(?:no|na|nos|nas|em) (?:(${PLACES.join('|')})|(casa d[aoe]s? [a-z]+))\\b`, 'g');
    if ((m = first(placeRe))) {
      let endI = m.index + m[0].length;
      const ext = /^ (?:(d[aoe]s?) )?([a-z0-9]+)\b/.exec(f.slice(endI));
      if (ext && !CONNECT.test(ext[2]) && free({ index: endI, 0: ext[0] })) endI += ext[0].length;
      place = orig.slice(m.index, endI).replace(/^\S+\s+/, '');
      cut.push([m.index, endI]);
    }
  }

  // Repetição sem dia: usa a data dita ou hoje
  if (rep && rep.kind === 'semana' && !rep.days.length) rep.days = [(date || startOfDay(now)).getDay()];
  if (rep && rep.kind === 'mes' && !rep.dom) rep.dom = (date || startOfDay(now)).getDate();
  // Repetição define a primeira data
  if (rep && !date) {
    let d = nextOccurrence(rep, now, true);
    if (d && time && dateKey(d) === dateKey(now)) { const [hh, mi] = time.split(':').map(Number); const at = new Date(now); at.setHours(hh, mi, 0, 0); if (at <= now) d = nextOccurrence(rep, now, false); }
    date = d;
  }
  // Hora sem data: hoje, ou amanhã se já passou
  if (time && !date) {
    const [hh, mi] = time.split(':').map(Number); const at = new Date(now); at.setHours(hh, mi, 0, 0);
    date = at > now ? startOfDay(now) : addDays(startOfDay(now), 1);
  }
  if (!time && partOfDay && date) time = { manha: '09:00', tarde: '14:00', noite: '19:00' }[partOfDay];

  // ---- Título ----
  let title = '';
  let last = 0;
  for (const [a, b] of cut.sort((x, y) => x[0] - y[0])) { if (a >= last) { title += orig.slice(last, a) + ' '; last = b; } else last = Math.max(last, b); }
  title += orig.slice(last);
  title = title.replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();
  const edge = /^(?:e|de|da|do|em|no|na|as|às|a|à|para|pra|ate|até|que|,|-|–)\s+|\s+(?:e|de|da|do|em|no|na|as|às|a|à|para|pra|ate|até|que|,|-|–)$|^[,.;:–-]+\s*|\s*[,.;:–-]+$/i;
  for (let i = 0; i < 6; i++) { const t2 = title.replace(edge, '').trim(); if (t2 === title) break; title = t2; }
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title: title || orig.trim(), date: date ? dateKey(date) : '', time, place, rep: validRep(rep), found: !!(date || time || place || rep) };
}

export function whenLabel(dateK, time, now = new Date()) {
  const d = keyToDate(dateK); if (!d) return time || '';
  const diff = Math.round((d - startOfDay(now)) / 86400000);
  const dm = `${d.getDate()}/${d.getMonth() + 1}${d.getFullYear() !== now.getFullYear() ? '/' + d.getFullYear() : ''}`;
  const day = diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff > 1 && diff < 7 ? `${DAYS_PT[d.getDay()]}, ${dm}` : `${DAYS_SHORT[d.getDay()]}, ${dm}`;
  return day + (time ? ` · ${time}` : '');
}

// Categoria pelo jeito do texto, quando a pessoa tem uma categoria com esse nome.
const CAT_WORDS = {
  saude: /dentist|medic|consulta|exame|remedio|farmacia|academia|treino|terapia|psic|vacina|laborat|fisio|nutri/,
  trabalho: /reuniao|relatorio|cliente|e-?mail|planilha|apresenta|projeto|chefe|gestor|entrega|call|trabalho|escritorio|contrato/,
  casa: /mercado|limpar|lavar|aluguel|conta de|luz|faxina|compras|cozinhar|condominio|consert|roupa|lixo|casa/,
  familia: /escola|creche|filh|esposa|marido|mae|pai|aniversario|familia|avo|sobrinh|irma/,
  financas: /pagar|boleto|banco|fatura|imposto|ir |investi|cartao|pix|transfer/,
  pessoal: /ler|livro|curso|estudar|ingles|hobby|violao|corrida|caminhada/,
};
export function guessCat(text, cats) {
  const f = fold(String(text || ''));
  for (const c of cats || []) { const re = CAT_WORDS[fold(c.name).replace(/\s+/g, '')]; if (re && re.test(f)) return c.id; }
  return null;
}
