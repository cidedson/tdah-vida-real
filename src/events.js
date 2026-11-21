// Normaliza eventos da agenda do Android.
// Eventos de dia inteiro vêm com início e fim à meia-noite UTC; no Brasil (UTC-3) isso cai às 21h do dia anterior,
// e o evento de amanhã aparecia hoje. Aqui eles passam para a meia-noite local do mesmo dia do calendário.
const DAY = 86400000;
const utcDayToLocal = ms => { const d = new Date(ms); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(); };

export function normalizeEvents(list, from, to) {
  const f = from.getTime(), t = to.getTime();
  const seen = new Set();
  return (list || [])
    .filter(e => e && e.title)
    .map(e => {
      const allDay = !!e.isAllDay;
      let start = Number(e.startDate), end = Number(e.endDate) || start;
      if (allDay) {
        start = utcDayToLocal(start);
        end = utcDayToLocal(end);
        if (end <= start) end = start + DAY;
      }
      return { id: e.id, title: e.title, start, end, allDay, location: e.location || '', color: e.color || '', calendarId: e.calendarId || '' };
    })
    .filter(e => e.start < t && (e.end > f || (e.end === e.start && e.start >= f)))
    // O mesmo feriado costuma vir de duas agendas: mostra uma vez só.
    .filter(e => { if (!e.allDay) return true; const k = `${e.title}|${e.start}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
}
