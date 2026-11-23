// Recursos nativos do Android, com alternativa para o navegador (testes no PC).
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import { App } from '@capacitor/app';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { normalizeEvents } from './events.js';

export const isNative = () => Capacitor.isNativePlatform();

// ---------- Exportar arquivo ----------
export async function saveAndShareJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  if (isNative()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: 'Backup — TDAH na Vida Real',
      text: 'Backup dos meus dados do app TDAH na Vida Real',
      url: res.uri,
      dialogTitle: 'Salvar ou enviar o backup',
    });
    return 'shared';
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}

// ---------- Agenda do celular ----------
// Lê os eventos de todas as agendas sincronizadas no aparelho (Google, Outlook/Exchange etc.).
export async function calendarPermission(ask = false) {
  if (!isNative()) return 'unavailable';
  try {
    if (ask) {
      const { result } = await CapacitorCalendar.requestReadOnlyCalendarAccess();
      return result;
    }
    const { result } = await CapacitorCalendar.checkPermission({ scope: 'readCalendar' });
    return result;
  } catch (e) {
    return 'error';
  }
}

export async function eventsBetween(from, to) {
  if (!isNative()) return null;
  // Busca com 1 dia de folga dos dois lados e recorta depois de acertar os eventos de dia inteiro.
  const pad = 86400000;
  const { result } = await CapacitorCalendar.listEventsInRange({ from: from.getTime() - pad, to: to.getTime() + pad });
  return normalizeEvents(result, from, to);
}

// ---------- Lembretes (notificações locais) ----------
export async function notificationsAllowed(ask = false) {
  if (!isNative()) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch (e) {
    return false;
  }
}

export function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h % 2000000000) + 1;
}

// Agenda um lembrete diário para cada rotina que tem horário definido.
export async function syncRoutineReminders(routines) {
  if (!isNative()) return 0;
  const ok = await notificationsAllowed(false);
  if (!ok) return 0;
  const pending = await LocalNotifications.getPending();
  const ours = (pending.notifications || []).filter(n => n.extra && n.extra.kind === 'routine');
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  const list = routines
    .filter(r => r.notifyTime && /^\d{2}:\d{2}$/.test(r.notifyTime))
    .map(r => {
      const [hour, minute] = r.notifyTime.split(':').map(Number);
      return {
        id: hashId('routine:' + r.id),
        title: r.title,
        body: r.trigger ? `Hora de começar. ${r.trigger}` : 'Hora de começar.',
        schedule: { on: r.notifyWeekday ? { weekday: r.notifyWeekday, hour, minute } : { hour, minute }, allowWhileIdle: true },
        channelId: remChannel(), extra: { kind: 'routine', routineId: r.id },
      };
    });
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  await toqueCancel(routines.map(r => hashId('routine:' + r.id)));
  if (LOUD.rem) {
    for (const n of list) {
      const on = n.schedule.on;
      await toque({ id: n.id, rep: on.weekday ? 'semana' : 'dia', dia: on.weekday || 0, hora: on.hour, minuto: on.minute });
    }
  }
  return list.length;
}

// Lembrete pontual (data e hora). Retorna true se agendou.
// loudable: lembretes, tarefas e rotinas podem tocar no silencioso; avisos do app (versão nova, resumo) não.
export async function scheduleOnce(key, title, body, at, loudable = true) {
  if (!isNative()) return false;
  const ok = await notificationsAllowed(false);
  if (!ok || !(at instanceof Date) || isNaN(at) || at.getTime() <= Date.now()) return false;
  const id = hashId('once:' + key);
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  await toqueCancel([id]);
  await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true }, channelId: remChannel(loudable), extra: { kind: 'once', key } }] });
  if (loudable && LOUD.rem) await toque({ id, rep: 'uma', at });
  return true;
}

export async function cancelOnce(key) {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: hashId('once:' + key) }] }).catch(() => {});
  await toqueCancel([hashId('once:' + key)]);
}

// ---------- Botão voltar do Android ----------
export function onBackButton(handler) {
  if (!isNative()) return;
  App.addListener('backButton', handler);
}
export function minimizeApp() {
  if (isNative()) App.minimizeApp().catch(() => {});
}

// ---------- Remédios e água ----------
const CHANNEL = 'remedios';

// ---------- Tocar no silencioso ----------
// Canais "_alarme" (AlertaPlugin) usam o volume de alarme: tocam com o celular no silencioso ou no vibrar.
let LOUD = { dose: false, rem: false };
export function setLoud(o) { LOUD = { ...LOUD, ...o }; }
// No silencioso, o som do canal fica mudo em vários celulares (Samsung). Então os canais "_toque"
// só vibram, e o próprio app toca o som pelo volume de alarme na mesma hora (AlertaPlugin.agendarToque).
const doseChannel = () => (LOUD.dose ? 'remedios_toque' : CHANNEL);
const remChannel = (loudable = true) => (loudable && LOUD.rem ? 'lembretes_toque' : 'lembretes');
// item: { id, rep: 'uma'|'dia'|'semana', at (ms), hora, minuto, dia (1 = domingo), som: 'alarme'|'sino' }
async function toque(item) {
  if (!isNative()) return;
  try { await Alerta.agendarToque({ som: 'alarme', ...item, at: item.at instanceof Date ? item.at.getTime() : item.at }); } catch (e) { /* segue só com a notificação */ }
}
async function toqueCancel(ids) {
  if (!isNative() || !ids || !ids.length) return;
  try { await Alerta.cancelarToques({ ids }); } catch (e) { /* nada para cancelar */ }
}
export async function alarmVolume() {
  if (!isNative()) return null;
  try { return await Alerta.volumeAlarme(); } catch (e) { return null; }
}
export async function raiseAlarmVolume(fracao = 0.7) {
  if (!isNative()) return null;
  try { return await Alerta.subirVolumeAlarme({ fracao }); } catch (e) { return null; }
}
// kind: 'dose' | 'rem'. Toca em 3 segundos pelo canal escolhido.
export async function testLoud(kind) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(true))) return false;
  const loud = kind === 'dose' ? LOUD.dose : LOUD.rem;
  const channelId = kind === 'dose' ? doseChannel() : remChannel();
  const id = hashId('teste:' + kind), at = new Date(Date.now() + 3000);
  await LocalNotifications.schedule({ notifications: [{ id, title: loud ? 'Teste: tocando no silencioso' : 'Teste do aviso', body: loud ? 'Este aviso toca pelo volume de alarme.' : 'Este aviso segue o modo do celular (silencioso não toca).', schedule: { at, allowWhileIdle: true }, channelId, extra: { kind: 'teste' } }] });
  if (loud) await toque({ id, rep: 'uma', at });
  return true;
}

// ---------- Não perturbe durante o foco ----------
export async function dndAccess() {
  if (!isNative()) return false;
  try { return !!(await Alerta.acessoNaoPerturbe()).ok; } catch (e) { return false; }
}
export async function dndAskAccess() { if (isNative()) { try { await Alerta.pedirAcessoNaoPerturbe(); } catch (e) { /* sem tela */ } } }
export async function dndOn(until) {
  if (!isNative()) return false;
  try { return !!(await Alerta.ligarNaoPerturbe({ ate: Math.round(until) })).ok; } catch (e) { return false; }
}
export async function dndOff() { if (isNative()) { try { await Alerta.desligarNaoPerturbe(); } catch (e) { /* nada a desfazer */ } } }
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// Canal de alta prioridade + botões "Tomei" e "Lembrar em 15 min". onAction(actionId, extra)
export async function initDoseNotifications(onAction) {
  if (!isNative()) return;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Remédios e água', description: 'Horários de remédios, água e lembretes de levar remédio', importance: 5, visibility: 1, vibration: true });
    await LocalNotifications.registerActionTypes({ types: [
      { id: 'DOSE', actions: [{ id: 'taken', title: 'Tomei' }, { id: 'snooze', title: 'Lembrar em 15 min' }] },
      { id: 'FIXO_D', actions: [{ id: 'fixo_tomei', title: 'Tomei' }] },
      { id: 'FIXO_P', actions: [{ id: 'fixo_feito', title: 'Feito' }] },
      { id: 'FIXO_DP', actions: [{ id: 'fixo_tomei', title: 'Tomei' }, { id: 'fixo_feito', title: 'Passo feito' }] },
    ] });
    await LocalNotifications.addListener('localNotificationActionPerformed', ev => {
      const extra = (ev.notification && ev.notification.extra) || {};
      onAction(ev.actionId, extra);
    });
  } catch (e) { /* segue sem botões */ }
}

export async function exactAlarmStatus() {
  if (!isNative()) return 'unavailable';
  try { const r = await LocalNotifications.checkExactNotificationSetting(); return r.exact_alarm; } catch (e) { return 'unknown'; }
}
export async function openExactAlarmSettings() {
  if (!isNative()) return 'unavailable';
  try { const r = await LocalNotifications.changeExactNotificationSetting(); return r.exact_alarm; } catch (e) { return 'unknown'; }
}

export async function cancelIds(ids) {
  if (!isNative() || !ids.length) return;
  await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }).catch(() => {});
  await toqueCancel(ids);
}

export async function snoozeDose(extra, minutes = 15) {
  if (!isNative()) return;
  const at = new Date(Date.now() + minutes * 60000);
  await LocalNotifications.schedule({ notifications: [{
    id: hashId('snooze:' + extra.key + ':' + at.getTime()), title: extra.title || 'Lembrete', body: extra.body || 'Toque em Tomei quando tomar.',
    schedule: { at, allowWhileIdle: true }, channelId: doseChannel(), actionTypeId: 'DOSE', extra: { ...extra, kind: 'dose-snooze' },
  }] });
  if (LOUD.dose) await toque({ id: hashId('snooze:' + extra.key + ':' + at.getTime()), rep: 'uma', at });
}

// plan: { daily: [{key,title,body,hour,minute,extra}], once: [{id,title,body,at,extra,actions}] }
export async function syncDoseNotifications(plan) {
  if (!isNative()) return 0;
  const ok = await notificationsAllowed(false);
  if (!ok) return 0;
  await cancelIds(lsGet('dose_notif_ids'));
  const list = [];
  for (const d of plan.daily) {
    list.push({ id: hashId('dose:' + d.key), title: d.title, body: d.body, schedule: { on: { hour: d.hour, minute: d.minute }, allowWhileIdle: true },
      channelId: doseChannel(), actionTypeId: 'DOSE', extra: d.extra });
  }
  for (const o of plan.once) {
    if (!(o.at instanceof Date) || o.at.getTime() <= Date.now()) continue;
    list.push({ id: o.id, title: o.title, body: o.body, schedule: { at: o.at, allowWhileIdle: true }, channelId: doseChannel(),
      ...(o.actions ? { actionTypeId: 'DOSE' } : {}), extra: o.extra });
  }
  for (let i = 0; i < list.length; i += 50) await LocalNotifications.schedule({ notifications: list.slice(i, i + 50) });
  if (LOUD.dose) {
    for (const d of plan.daily) await toque({ id: hashId('dose:' + d.key), rep: 'dia', hora: d.hour, minuto: d.minute });
    for (const n of list) if (n.schedule.at) await toque({ id: n.id, rep: 'uma', at: n.schedule.at });
  }
  lsSet('dose_notif_ids', list.map(n => n.id));
  return list.length;
}

// ---------- Agenda da casa (calendário compartilhado) ----------
export async function requestCalendarWrite() {
  if (!isNative()) return 'unavailable';
  try { const { result } = await CapacitorCalendar.requestFullCalendarAccess(); return result; } catch (e) { return 'error'; }
}
export async function listWritableCalendars() {
  if (!isNative()) return [];
  const { result } = await CapacitorCalendar.listCalendars();
  return (result || [])
    .filter(c => c && c.id && c.allowsContentModifications !== false)
    .map(c => ({ id: c.id, title: c.title || c.internalTitle || 'Sem nome', account: c.accountName || '', color: c.color || '' }));
}
export async function createCalendarEvent({ calendarId, title, start, end, location, description, alertMin = 30 }) {
  if (!isNative()) throw new Error('Disponível só no app Android.');
  const { id } = await CapacitorCalendar.createEvent({
    calendarId, title, startDate: start.getTime(), endDate: end.getTime(), isAllDay: false,
    location: location || undefined, description: description || undefined, alerts: alertMin ? [-alertMin] : undefined, commit: true,
  });
  return id;
}

// ---------- Ditado por voz ----------
// Abre o reconhecimento de voz do Google (pt-BR) e devolve o texto falado.
export async function listenOnce() {
  if (!isNative()) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('O ditado por voz funciona no app Android.');
    return new Promise((resolve, reject) => {
      const r = new SR(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = e => resolve(e.results[0][0].transcript); r.onerror = e => reject(new Error(e.error || 'erro')); r.start();
    });
  }
  const { available } = await SpeechRecognition.available();
  if (!available) throw new Error('Reconhecimento de voz indisponível. Instale ou atualize o app Google.');
  let p = await SpeechRecognition.checkPermissions();
  if (p.speechRecognition !== 'granted') p = await SpeechRecognition.requestPermissions();
  if (p.speechRecognition !== 'granted') throw new Error('Permita o microfone para ditar.');
  const r = await SpeechRecognition.start({ language: 'pt-BR', maxResults: 1, prompt: 'Pode falar', partialResults: false, popup: true });
  return ((r && r.matches && r.matches[0]) || '').trim();
}

// ---------- Versão do app ----------
export async function appInfo() {
  if (!isNative()) return null;
  try { return await App.getInfo(); } catch (e) { return null; }
}

// ---------- Backup em arquivo do Google Drive (seletor de documentos do Android) ----------
const DocBackup = registerPlugin('DocBackup');
const onlyApp = () => { if (!isNative()) throw new Error('O backup no Google Drive funciona no app Android.'); };
export const drive = {
  create: async (fileName, data) => { onlyApp(); return DocBackup.createDocument({ fileName, data }); },
  write: async (uri, data) => { onlyApp(); return DocBackup.writeDocument({ uri, data }); },
  read: async (uri) => { onlyApp(); return DocBackup.readDocument({ uri }); },
  open: async () => { onlyApp(); return DocBackup.openDocument(); },
};

// ---------- Barras do sistema (cor dos ícones conforme o tema) ----------
export async function setBars(dark) {
  if (!isNative()) return;
  try { await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }); } catch (e) { /* versão sem suporte */ }
}

// ---------- Bloco de foco: avisos com som ----------
// Canais criados no Android (AlertaPlugin): "foco" (som normal), "foco_alarme" (toca no silencioso), "foco_mudo" (só vibra).
const Alerta = registerPlugin('Alerta');
export async function initFocusChannels() {
  if (!isNative()) return;
  try { await Alerta.criarCanais(); } catch (e) { /* segue com o canal padrão */ }
}
const focusChannel = mode => (mode === 'alarme' ? 'foco_toque' : mode === 'mudo' ? 'foco_mudo' : 'foco');
export async function cancelFocus() { await cancelIds([hashId('foco:fim'), hashId('foco:aviso'), hashId('foco:metade')]); }
// end/warnAt/half em ms. mode: 'som' | 'alarme' | 'mudo'. Retorna true se agendou no celular.
export async function scheduleFocus({ end, warnAt, title, body, mode, half, halfText }) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(false))) return false;
  await cancelFocus();
  const list = [];
  if (end > Date.now()) list.push({ id: hashId('foco:fim'), title, body, schedule: { at: new Date(end), allowWhileIdle: true }, channelId: focusChannel(mode), extra: { kind: 'focus' } });
  if (warnAt && warnAt > Date.now()) list.push({ id: hashId('foco:aviso'), title: 'Faltam 2 minutos', body: 'Hora de fechar o que está fazendo.', schedule: { at: new Date(warnAt), allowWhileIdle: true }, channelId: 'foco_mudo', extra: { kind: 'focus-warn' } });
  if (half && half > Date.now()) list.push({ id: hashId('foco:metade'), title: 'Metade do bloco', body: halfText || 'Segue no mesmo. Se desviou, volta sem culpa.', schedule: { at: new Date(half), allowWhileIdle: true }, channelId: 'foco_mudo', extra: { kind: 'focus-half' } });
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  if (mode === 'alarme' && end > Date.now()) await toque({ id: hashId('foco:fim'), rep: 'uma', at: end, som: 'sino' });
  return true;
}
// Rotina guiada: aviso no fim do passo atual (ou de todos os passos, quando ela avança sozinha).
// steps: [{ at (ms), title, body }]
export async function cancelRoutineStep() { await cancelIds([hashId('rotina:passo'), ...lsGet('rotina_ids')]); lsSet('rotina_ids', []); }
export async function scheduleRoutineSteps(steps, mode) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(false))) return false;
  await cancelRoutineStep();
  const list = steps.filter(x => x.at > Date.now()).slice(0, 40).map((x, k) => ({ id: hashId('rotina:passo:' + k), title: x.title, body: x.body, schedule: { at: new Date(x.at), allowWhileIdle: true }, channelId: focusChannel(mode), extra: { kind: 'routine-step' } }));
  if (!list.length) return false;
  await LocalNotifications.schedule({ notifications: list });
  if (mode === 'alarme') for (const n of list) await toque({ id: n.id, rep: 'uma', at: n.schedule.at, som: 'sino' });
  lsSet('rotina_ids', list.map(n => n.id));
  return true;
}

// ---------- Voz, tela acesa e tempo na barra ----------
export async function speak(text) {
  if (!text) return;
  if (isNative()) { try { await Alerta.falar({ texto: text }); } catch (e) { /* sem voz */ } return; }
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) { /* navegador sem voz */ }
}
export async function stopSpeak() {
  if (isNative()) { try { await Alerta.pararFala(); } catch (e) { /* nada */ } return; }
  try { window.speechSynthesis.cancel(); } catch (e) { /* nada */ }
}
let wakeRef = null, awakeOn = false;
export async function keepAwake(on) {
  on = !!on; if (on === awakeOn) return; awakeOn = on;
  if (isNative()) { try { await Alerta.telaAcesa({ ligar: on }); } catch (e) { /* segue */ } return; }
  try {
    if (on && navigator.wakeLock) wakeRef = await navigator.wakeLock.request('screen');
    else if (!on && wakeRef) { await wakeRef.release(); wakeRef = null; }
  } catch (e) { /* navegador sem wake lock */ }
}
let lastCountdown = '';
// { title, text, end (ms), paused, hideAt (ms) }
export async function showCountdown(o) {
  if (!isNative()) return;
  const key = JSON.stringify(o); if (key === lastCountdown) return; lastCountdown = key;
  try { await Alerta.mostrarCronometro({ titulo: o.title, texto: o.text, fim: Math.round(o.end), pausado: !!o.paused, some: Math.round(o.hideAt || 0) }); } catch (e) { lastCountdown = ''; }
}
export async function hideCountdown() {
  if (!isNative() || lastCountdown === 'off') return; lastCountdown = 'off';
  try { await Alerta.esconderCronometro(); } catch (e) { /* nada */ }
}
export async function testFocusSound(mode) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(true))) return false;
  const at = new Date(Date.now() + 2000);
  await LocalNotifications.schedule({ notifications: [{ id: hashId('foco:teste'), title: 'Teste do som do foco', body: 'É assim que o fim do bloco vai tocar.', schedule: { at, allowWhileIdle: true }, channelId: focusChannel(mode), extra: { kind: 'focus-test' } }] });
  if (mode === 'alarme') await toque({ id: hashId('foco:teste'), rep: 'uma', at, som: 'sino' });
  return true;
}

// ---------- Próximo fixo na barra de notificações ----------
// Notificação que não se apaga sozinha (canal "fixo", sem som), atualizada a cada mudança no app.
const PIN_ID = hashId('fixo:proximo');
export async function showPinned({ title, body, big, actionType, extra }) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(false))) return false;
  await LocalNotifications.schedule({ notifications: [{
    // foreground: true = prioridade alta no Android, para ficar acima das notificações comuns
    id: PIN_ID, title, body, largeBody: big || undefined, channelId: 'fixo', ongoing: true, autoCancel: false, foreground: true,
    actionTypeId: actionType, extra: { ...(extra || {}), kind: 'fixo' },
  }] });
  return true;
}
export async function clearPinned() {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: PIN_ID }] }).catch(() => {});
}
export async function pinnedVisible() {
  if (!isNative()) return false;
  try { const r = await LocalNotifications.getDeliveredNotifications(); return (r.notifications || []).some(n => n.id === PIN_ID); } catch (e) { return true; }
}

// ---------- Compartilhar uma tarefa e receber arquivos ----------
// Manda um arquivo .json com a tarefa e um texto (vira a legenda no WhatsApp).
export async function shareTaskFile(fileName, obj, text) {
  const data = JSON.stringify(obj, null, 2);
  if (isNative()) {
    const res = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Tarefa do TDAH na Vida Real', text, files: [res.uri], dialogTitle: 'Mandar a tarefa para' });
    return 'shared';
  }
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  try { await navigator.clipboard.writeText(text); } catch (e) { /* sem área de transferência */ }
  return 'downloaded';
}
// Arquivo aberto com o app (Abrir com › TDAH na Vida Real).
export function onOpenUrl(handler) {
  if (!isNative()) return;
  App.addListener('appUrlOpen', e => { if (e && e.url) handler(e.url); });
}
export async function launchUrl() {
  if (!isNative()) return null;
  try { const r = await App.getLaunchUrl(); return (r && r.url) || null; } catch (e) { return null; }
}
export async function readSharedUri(uri) {
  if (!isNative()) throw new Error('Disponível no app Android.');
  const r = await DocBackup.readDocument({ uri });
  return r.data;
}
// Compartilha só texto (o link vai dentro do texto).
export async function shareText(text, opts = {}) {
  if (isNative()) { await Share.share({ title: opts.title || 'Tarefa do TDAH na Vida Real', text, dialogTitle: opts.dialogTitle || 'Mandar a tarefa para' }); return 'shared'; }
  if (navigator.share) { try { await navigator.share({ text }); return 'shared'; } catch (e) { if (/abort/i.test(String(e && e.name))) throw new Error('cancel'); } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'shown'; }
}
