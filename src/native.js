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
        extra: { kind: 'routine', routineId: r.id },
      };
    });
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return list.length;
}

// Lembrete pontual (data e hora). Retorna true se agendou.
export async function scheduleOnce(key, title, body, at) {
  if (!isNative()) return false;
  const ok = await notificationsAllowed(false);
  if (!ok || !(at instanceof Date) || isNaN(at) || at.getTime() <= Date.now()) return false;
  const id = hashId('once:' + key);
  await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
  await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true }, extra: { kind: 'once', key } }] });
  return true;
}

export async function cancelOnce(key) {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: hashId('once:' + key) }] }).catch(() => {});
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
}

export async function snoozeDose(extra, minutes = 15) {
  if (!isNative()) return;
  const at = new Date(Date.now() + minutes * 60000);
  await LocalNotifications.schedule({ notifications: [{
    id: hashId('snooze:' + extra.key + ':' + at.getTime()), title: extra.title || 'Lembrete', body: extra.body || 'Toque em Tomei quando tomar.',
    schedule: { at, allowWhileIdle: true }, channelId: CHANNEL, actionTypeId: 'DOSE', extra: { ...extra, kind: 'dose-snooze' },
  }] });
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
      channelId: CHANNEL, actionTypeId: 'DOSE', extra: d.extra });
  }
  for (const o of plan.once) {
    if (!(o.at instanceof Date) || o.at.getTime() <= Date.now()) continue;
    list.push({ id: o.id, title: o.title, body: o.body, schedule: { at: o.at, allowWhileIdle: true }, channelId: CHANNEL,
      ...(o.actions ? { actionTypeId: 'DOSE' } : {}), extra: o.extra });
  }
  for (let i = 0; i < list.length; i += 50) await LocalNotifications.schedule({ notifications: list.slice(i, i + 50) });
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
const focusChannel = mode => (mode === 'alarme' ? 'foco_alarme' : mode === 'mudo' ? 'foco_mudo' : 'foco');
export async function cancelFocus() { await cancelIds([hashId('foco:fim'), hashId('foco:aviso')]); }
// end/warnAt em ms. mode: 'som' | 'alarme' | 'mudo'. Retorna true se agendou no celular.
export async function scheduleFocus({ end, warnAt, title, body, mode }) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(false))) return false;
  await cancelFocus();
  const list = [];
  if (end > Date.now()) list.push({ id: hashId('foco:fim'), title, body, schedule: { at: new Date(end), allowWhileIdle: true }, channelId: focusChannel(mode), extra: { kind: 'focus' } });
  if (warnAt && warnAt > Date.now()) list.push({ id: hashId('foco:aviso'), title: 'Faltam 2 minutos', body: 'Hora de fechar o que está fazendo.', schedule: { at: new Date(warnAt), allowWhileIdle: true }, channelId: 'foco_mudo', extra: { kind: 'focus-warn' } });
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return true;
}
export async function testFocusSound(mode) {
  if (!isNative()) return false;
  if (!(await notificationsAllowed(true))) return false;
  await LocalNotifications.schedule({ notifications: [{ id: hashId('foco:teste'), title: 'Teste do som do foco', body: 'É assim que o fim do bloco vai tocar.', schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true }, channelId: focusChannel(mode), extra: { kind: 'focus-test' } }] });
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
export async function shareText(text) {
  if (isNative()) { await Share.share({ title: 'Tarefa do TDAH na Vida Real', text, dialogTitle: 'Mandar a tarefa para' }); return 'shared'; }
  if (navigator.share) { try { await navigator.share({ text }); return 'shared'; } catch (e) { if (/abort/i.test(String(e && e.name))) throw new Error('cancel'); } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'shown'; }
}
