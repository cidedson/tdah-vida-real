// Aviso de versão nova: pergunta ao GitHub qual é a última versão publicada (repositório público, sem chave).
// Só sai do celular esta consulta; nenhum dado da pessoa vai junto.
export const REPO = 'cidedson/tdah-vida-real';
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const KEY = 'update_info', TKEY = 'update_checked';
const EVERY = 20 * 3600000; // no máximo uma consulta por dia

export function parseVer(v) { const m = String(v || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/); return m ? [+m[1], +m[2], +(m[3] || 0)] : null; }
// true se a versão a for mais nova que b
export function isNewer(a, b) {
  const x = parseVer(a), y = parseVer(b); if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
// As primeiras novidades das notas da versão (itens "- " do CHANGELOG), sem markdown.
export function highlights(body, n = 3) {
  return String(body || '').split('\n').map(l => l.trim()).filter(l => /^[-*] /.test(l))
    .map(l => l.replace(/^[-*] /, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .map(l => (l.length > 120 ? l.slice(0, 117).replace(/\s+\S*$/, '') + '…' : l)).slice(0, n);
}
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } } };
export function cachedUpdate() { try { return JSON.parse(ls.get(KEY) || 'null'); } catch (e) { return null; } }
export function lastChecked() { return Number(ls.get(TKEY) || 0); }

export async function checkUpdate({ force = false } = {}) {
  if (!force && Date.now() - lastChecked() < EVERY) return cachedUpdate();
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'O GitHub pediu uma pausa. Tente mais tarde.' : `GitHub respondeu ${res.status}`);
  const r = await res.json();
  const apk = (r.assets || []).find(a => /\.apk$/i.test(a.name || ''));
  const info = { version: String(r.tag_name || '').replace(/^v/i, ''), url: apk ? apk.browser_download_url : (r.html_url || RELEASES_URL), page: r.html_url || RELEASES_URL, notes: highlights(r.body), at: r.published_at || '' };
  ls.set(KEY, JSON.stringify(info)); ls.set(TKEY, String(Date.now()));
  return info;
}
