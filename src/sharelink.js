// Link de compartilhamento: os dados da tarefa vão dentro do link, comprimidos.
// https://cidedson.github.io/t/#z<dados>  (o trecho depois do # não é enviado ao site)
export const SHARE_BASE = 'https://cidedson.github.io/t/';

const b64url = bytes => {
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = str => {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out;
};
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function encodeShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) { /* sem compressão */ }
  }
  return 'j' + b64url(raw);
}

export async function decodeShare(code) {
  const c = String(code || '').trim();
  const kind = c[0], body = c.slice(1);
  const bytes = unb64url(body);
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return new TextDecoder().decode(raw);
}

// Tira os dados de um link (# ou ?d=). Devolve null se não for um link de tarefa.
export function shareCodeFromUrl(url) {
  const u = String(url || '');
  if (!u.startsWith(SHARE_BASE) && !u.startsWith('https://cidedson.github.io/t?')) return null;
  const hash = u.indexOf('#');
  if (hash >= 0 && u.length > hash + 1) return decodeURIComponent(u.slice(hash + 1));
  const m = /[?&]d=([^&#]+)/.exec(u);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function shareLink(obj) { return SHARE_BASE + '#' + await encodeShare(obj); }
