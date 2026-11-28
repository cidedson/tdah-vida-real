#!/usr/bin/env node
// Gera o link de uma tarefa do app TDAH na Vida Real, no mesmo formato de src/sharelink.js:
// https://cidedson.github.io/t/#z<JSON da tarefa comprimido (deflate-raw) em base64url>
// Quem tem o app toca no link e a tarefa abre na tela "Tarefa recebida".
//
// Uso:
//   node docs/tarefa-por-link/link-tarefa.mjs tarefa.json
//   node docs/tarefa-por-link/link-tarefa.mjs tarefa.json --de "Copilot"
//   cat tarefa.json | node docs/tarefa-por-link/link-tarefa.mjs
//
// O JSON pode ser uma tarefa, uma lista de tarefas (um link para cada) ou o envelope completo
// { "app": "tdah-vida-real", "kind": "tarefa", "tarefa": { ... } }. Formato dos campos em
// .github/copilot-instructions.md. Sem dependências: só o Node 18 ou mais novo.
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const BASE = 'https://cidedson.github.io/t/';
const ALERTAS = [0, 15, 30, 60, 1440];
const CAMPOS = ['title', 'what', 'imp', 'urg', 'deadline', 'time', 'alertMin', 'place', 'cat', 'need', 'when', 'steps', 'rep'];
const LIMITE = 1800; // acima disso o WhatsApp pode recolher a mensagem em "Ler mais"

const texto = v => (v == null ? '' : String(v).trim());

function dataValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function checarRep(rep) {
  if (!rep || typeof rep !== 'object') return null;
  if (rep.kind === 'dia') return { kind: 'dia' };
  if (rep.kind === 'semana') {
    const days = [...new Set((rep.days || []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort();
    return days.length ? { kind: 'semana', days } : null;
  }
  if (rep.kind === 'mes') {
    const dom = Number(rep.dom);
    return Number.isInteger(dom) && dom >= 1 && dom <= 31 ? { kind: 'mes', dom } : null;
  }
  return null;
}

// Confere a tarefa com as mesmas regras que o app usa ao aceitar (incomingAccept em src/app.js).
function checarTarefa(x, onde) {
  const erros = [], avisos = [];
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { erros: [`${onde}esperava um objeto JSON.`], avisos };
  for (const k of Object.keys(x)) if (!CAMPOS.includes(k)) avisos.push(`${onde}o campo "${k}" não existe no app e foi ignorado.`);

  const t = { title: texto(x.title) };
  if (!t.title) erros.push(`${onde}"title" é obrigatório.`);
  t.what = texto(x.what);
  if (!t.what) avisos.push(`${onde}sem "what", a tarefa entra na fase "O quê" e você completa no celular.`);

  if (x.imp === true || x.imp === false) t.imp = x.imp;
  else if (x.imp != null) erros.push(`${onde}"imp" tem que ser true ou false.`);
  else avisos.push(`${onde}sem "imp", a tarefa cai em "Para classificar" na matriz.`);
  if (x.urg === true) t.urg = true;
  else if (x.urg != null && x.urg !== false) erros.push(`${onde}"urg" tem que ser true (ou ficar de fora).`);

  let erroData = false;
  if (texto(x.deadline)) {
    if (dataValida(x.deadline)) t.deadline = x.deadline;
    else { erroData = true; erros.push(`${onde}"deadline" tem que ser uma data real no formato AAAA-MM-DD.`); }
  }
  if (texto(x.time)) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(texto(x.time));
    if (!m || +m[1] > 23 || +m[2] > 59) erros.push(`${onde}"time" tem que ser HH:MM (00:00 a 23:59).`);
    else if (!t.deadline && !erroData) erros.push(`${onde}"time" precisa de "deadline" (a data desse horário).`);
    else t.time = `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  if (x.alertMin != null) {
    const a = Number(x.alertMin);
    if (!ALERTAS.includes(a)) erros.push(`${onde}"alertMin" tem que ser 0, 15, 30, 60 ou 1440.`);
    else if (!t.time) avisos.push(`${onde}"alertMin" sem "time" não tem efeito e foi ignorado.`);
    else if (a) t.alertMin = a;
  }

  for (const k of ['place', 'cat', 'need', 'when']) if (texto(x[k])) t[k] = texto(x[k]);

  if (x.steps != null) {
    if (!Array.isArray(x.steps)) erros.push(`${onde}"steps" tem que ser uma lista.`);
    else {
      t.steps = [];
      x.steps.forEach((s, i) => {
        const p = typeof s === 'string' ? { t: s } : s || {};
        const st = { t: texto(p.t) };
        if (!st.t) { erros.push(`${onde}o passo ${i + 1} está sem texto ("t").`); return; }
        if (p.est != null && p.est !== '') {
          const est = Number(p.est);
          if (!Number.isInteger(est) || est < 1 || est > 600) erros.push(`${onde}o passo ${i + 1} tem "est" inválido (minutos inteiros, de 1 a 600).`);
          else st.est = est;
        }
        t.steps.push(st);
      });
      if (!t.steps.length) delete t.steps;
    }
  }
  if (!t.steps) avisos.push(`${onde}sem passos, a tarefa entra na fase "Como" e você fatia no celular.`);

  if (x.rep != null) {
    const rep = checarRep(x.rep);
    if (!rep) erros.push(`${onde}"rep" inválido. Use {"kind":"dia"}, {"kind":"semana","days":[1,3]} (0 = domingo) ou {"kind":"mes","dom":10}.`);
    else {
      t.rep = rep;
      if (!t.deadline) avisos.push(`${onde}repetição sem "deadline": ponha em "deadline" a data da primeira vez.`);
    }
  }
  if (!t.what) delete t.what;
  return { t, erros, avisos };
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const gerarLink = envelope => BASE + '#z' + b64url(deflateRawSync(Buffer.from(JSON.stringify(envelope), 'utf8')));

function main() {
  const args = process.argv.slice(2);
  let de = 'Copilot', arquivo = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--de') de = texto(args[++i]);
    else if (args[i] === '-h' || args[i] === '--help') { console.log('Uso: node link-tarefa.mjs tarefa.json [--de "Nome"]   (ou mande o JSON pela entrada padrão)'); return 0; }
    else arquivo = args[i];
  }
  let bruto;
  try { bruto = readFileSync(arquivo ?? 0, 'utf8'); } catch (e) { console.error(`Não consegui ler ${arquivo ?? 'a entrada padrão'}: ${e.message}`); return 1; }
  let dados;
  try { dados = JSON.parse(bruto.replace(/^\uFEFF/, '')); } catch (e) { console.error(`JSON inválido: ${e.message}`); return 1; }

  if (dados && dados.app === 'tdah-vida-real' && dados.tarefa) { if (dados.de && !args.includes('--de')) de = texto(dados.de); dados = dados.tarefa; }
  const lista = Array.isArray(dados) ? dados : [dados];
  if (!lista.length) { console.error('A lista de tarefas está vazia.'); return 1; }

  const resultados = lista.map((x, i) => checarTarefa(x, lista.length > 1 ? `Tarefa ${i + 1}: ` : ''));
  const erros = resultados.flatMap(r => r.erros);
  resultados.flatMap(r => r.avisos).forEach(a => console.error('Aviso: ' + a));
  if (erros.length) { erros.forEach(e => console.error('Erro: ' + e)); console.error('Nenhum link gerado. Corrija e rode de novo.'); return 1; }

  resultados.forEach(({ t }, i) => {
    const envelope = { app: 'tdah-vida-real', kind: 'tarefa', v: 1, ...(de ? { de } : {}), tarefa: t };
    const link = gerarLink(envelope);
    if (link.length > LIMITE) console.error(`Aviso: o link de "${t.title}" tem ${link.length} caracteres. No WhatsApp, toque em "Ler mais" antes de tocar no link, ou encurte passos e textos.`);
    if (lista.length > 1) console.log(`${i ? '\n' : ''}${t.title}`);
    console.log(link);
  });
  return 0;
}

process.exitCode = main();
