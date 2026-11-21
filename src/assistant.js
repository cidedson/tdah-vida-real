// Assistente de IA dentro do app: Claude (Anthropic) ou Gemini (Google), com contexto do app e ações.
import { CHAPTERS } from './content.js';

export const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)',
    keyHint: 'sk-ant-...',
    keyPrefix: 'sk-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'Abrir o console da Anthropic',
    howTo: ['Toque no botão abaixo e entre (ou crie uma conta) na Anthropic.', 'Em API Keys, toque em "Create Key" e copie a chave.', 'Volte aqui e cole a chave.'],
    billing: 'Cobrança por uso na conta da Anthropic, separada do plano do Claude.',
    models: [
      ['claude-sonnet-5-5', 'Sonnet 5.5 (equilibrado)'],
      ['claude-haiku-5-5', 'Haiku 5.5 (mais rápido e barato)'],
      ['claude-opus-5-5', 'Opus 5.5 (mais capaz, mais caro)'],
    ],
  },
  gemini: {
    label: 'Gemini (Google)',
    keyHint: 'AIza...',
    keyPrefix: '',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyUrlLabel: 'Abrir o Google AI Studio',
    howTo: ['Toque no botão abaixo e entre com a sua conta Google.', 'Toque em "Create API key" e copie a chave (começa com AIza).', 'Volte aqui e cole a chave.'],
    billing: 'A assinatura Google AI Pro não cobre a API. A chave começa no plano gratuito, com limites; só cobra se você ativar o faturamento no AI Studio.',
    warning: 'No plano gratuito, o Google pode usar o que você envia para melhorar os produtos, inclusive com leitura por revisores humanos. Evite dados sensíveis ou ative o faturamento.',
    models: [
      ['gemini-flash-latest', 'Gemini Flash (mais recente)'],
      ['gemini-flash-lite-latest', 'Gemini Flash-Lite (mais leve)'],
      ['gemini-pro-latest', 'Gemini Pro (pode não estar no gratuito)'],
    ],
  },
};

// Chaves ficam fora do banco de dados, para não irem junto nos backups.
const ls = {
  get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} },
};
export const keyStore = {
  provider: () => ls.get('ai_provider') || 'anthropic',
  setProvider: p => ls.set('ai_provider', p),
  get: (p = keyStore.provider()) => ls.get(`ai_key_${p}`),
  set: (v, p = keyStore.provider()) => ls.set(`ai_key_${p}`, v),
  model: (p = keyStore.provider()) => ls.get(`ai_model_${p}`) || PROVIDERS[p].models[0][0],
  setModel: (v, p = keyStore.provider()) => ls.set(`ai_model_${p}`, v),
  extraModels: (p = keyStore.provider()) => { try { return JSON.parse(ls.get(`ai_models_${p}`) || '[]'); } catch (e) { return []; } },
  setExtraModels: (list, p = keyStore.provider()) => ls.set(`ai_models_${p}`, JSON.stringify(list)),
};

export function modelOptions(p = keyStore.provider()) {
  const base = PROVIDERS[p].models;
  const extra = keyStore.extraModels(p).filter(([id]) => !base.some(([b]) => b === id));
  return [...base, ...extra];
}

const GUIDE_TEXT = CHAPTERS.map(ch => `## ${ch.title}\n` + ch.items.map(([n, t, x]) => `${n}. ${t} — ${x}`).join('\n')).join('\n\n');

export const TOOLS = [
  {
    name: 'definir_tres_do_dia',
    description: 'Preenche as 3 prioridades do dia na página de hoje. Use só quando a pessoa pedir ou concordar.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array', maxItems: 3, description: 'Até 3 prioridades, na ordem.',
          items: { type: 'object', properties: { prioridade: { type: 'string' }, primeiro_passo: { type: 'string', description: 'Primeiro passo físico e concreto, com verbo.' } }, required: ['prioridade', 'primeiro_passo'] },
        },
      },
      required: ['itens'],
    },
  },
  {
    name: 'adicionar_lembrete',
    description: 'Cria um lembrete no app, com notificação no celular se tiver data e hora. Título sempre com verbo de ação.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        quando: { type: 'string', description: 'Data e hora locais no formato AAAA-MM-DDTHH:MM, ou vazio se não houver.' },
        detalhe: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'criar_tarefa_grande',
    description: 'Cria uma tarefa na matriz de prioridades, já com "pronto quando", prioridade e passos pequenos (5 a 25 min cada, o primeiro bem fácil). Use sempre que a pessoa citar algo grande ou vago para fazer.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        pronto_quando: { type: 'string', description: 'Uma frase curta e verificável de quando a tarefa está pronta.' },
        importante: { type: 'boolean', description: 'Ajuda objetivos de longo prazo: saúde, família, trabalho que importa, dinheiro.' },
        urgente: { type: 'boolean', description: 'Tem prazo até amanhã ou consequência imediata.' },
        prazo: { type: 'string', description: 'AAAA-MM-DD: data do compromisso ou prazo. Vazio se não houver.' },
        passos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, minutos: { type: 'number' } }, required: ['texto'] } },
        preciso_de: { type: 'string', description: 'Material ou acesso necessário. Vazio se nada.' },
        hora: { type: 'string', description: 'HH:MM se tiver horário (compromisso, ligação). O app avisa no celular.' },
        local: { type: 'string', description: 'Lugar, se houver. Vazio se não.' },
        avisar_antes_min: { type: 'integer', description: 'Minutos de antecedência do aviso: 0, 15, 30, 60 ou 1440. Compromisso fora de casa: 30 ou 60.' },
        repete: { type: 'string', enum: ['nao', 'diaria', 'dias_uteis', 'semanal', 'mensal'], description: 'Se a tarefa se repete. Ao concluir, a próxima volta sozinha para a matriz.' },
        dias_semana: { type: 'array', items: { type: 'integer' }, description: 'Para semanal: dias da semana, 0 = domingo, 1 = segunda ... 6 = sábado.' },
        dia_mes: { type: 'integer', description: 'Para mensal: dia do mês (1 a 31).' },
        categoria: { type: 'string', description: 'Uma das categorias de tarefa do contexto, se alguma servir.' },
      },
      required: ['titulo', 'passos'],
    },
  },
  {
    name: 'atualizar_tarefa',
    description: 'Muda uma tarefa que já existe na matriz: título, pronto quando, prioridade, prazo, passos (substitui todos), horário, local, repetição, categoria, concluir ou mandar para "Talvez um dia".',
    input_schema: {
      type: 'object',
      properties: {
        tarefa: { type: 'string', description: 'Título da tarefa como aparece no contexto (ou parte dele).' },
        novo_titulo: { type: 'string' },
        pronto_quando: { type: 'string' },
        importante: { type: 'boolean' },
        urgente: { type: 'boolean' },
        prazo: { type: 'string', description: 'AAAA-MM-DD, ou vazio para tirar.' },
        passos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, minutos: { type: 'number' } }, required: ['texto'] } },
        concluir: { type: 'boolean' },
        talvez_um_dia: { type: 'boolean' },
        hora: { type: 'string', description: 'HH:MM se tiver horário (compromisso, ligação). O app avisa no celular.' },
        local: { type: 'string', description: 'Lugar, se houver. Vazio se não.' },
        avisar_antes_min: { type: 'integer', description: 'Minutos de antecedência do aviso: 0, 15, 30, 60 ou 1440. Compromisso fora de casa: 30 ou 60.' },
        repete: { type: 'string', enum: ['nao', 'diaria', 'dias_uteis', 'semanal', 'mensal'], description: 'Repetição; "nao" tira a repetição.' },
        dias_semana: { type: 'array', items: { type: 'integer' }, description: 'Para semanal: dias da semana, 0 = domingo, 1 = segunda ... 6 = sábado.' },
        dia_mes: { type: 'integer', description: 'Para mensal: dia do mês (1 a 31).' },
        categoria: { type: 'string', description: 'Uma das categorias de tarefa do contexto, se alguma servir.' },

      },
      required: ['tarefa'],
    },
  },
  {
    name: 'marcar_passo',
    description: 'Marca (ou desmarca) um passo de uma tarefa como feito. Se todos os passos ficarem feitos, a tarefa é concluída.',
    input_schema: {
      type: 'object',
      properties: { tarefa: { type: 'string' }, passo: { type: 'integer', description: 'Número do passo, começando em 1.' }, feito: { type: 'boolean' } },
      required: ['tarefa', 'passo'],
    },
  },
  {
    name: 'guardar_ideia',
    description: 'Guarda uma ideia no Estacionamento de ideias para ver depois.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, quando_rever: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'registrar_feito',
    description: 'Adiciona um item à lista "Feito hoje".',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  },
  {
    name: 'definir_horarios',
    description: 'Cria ou atualiza um item de "Remédios e água" com horários DIÁRIOS (o celular avisa todo dia com o botão Tomei). Use para água, remédios e hábitos com horário fixo. Não use adicionar_lembrete para isso.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do item. Se já existir um item com esse nome (ex.: "Água ao longo do dia"), ele é atualizado.' },
        tipo: { type: 'string', enum: ['remedio', 'agua', 'outro'] },
        horarios: { type: 'array', items: { type: 'string', description: 'Horário HH:MM' } },
        modo: { type: 'string', enum: ['substituir', 'adicionar'], description: 'substituir (padrão) troca todos os horários; adicionar soma aos existentes.' },
      },
      required: ['nome', 'horarios'],
    },
  },
  {
    name: 'criar_compromisso_casa',
    description: 'Cria um compromisso na Agenda da casa (calendário compartilhado da família, aparece no celular de todos). Use só quando a pessoa pedir para marcar algo na agenda da casa ou da família.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        inicio: { type: 'string', description: 'Data e hora locais no formato AAAA-MM-DDTHH:MM.' },
        duracao_min: { type: 'integer', description: 'Duração em minutos. Padrão 60.' },
        local: { type: 'string' },
      },
      required: ['titulo', 'inicio'],
    },
  },
  {
    name: 'adicionar_ao_kit',
    description: 'Marca uma estratégia do guia (número de 1 a 100) no "Meu kit" com status "quero testar".',
    input_schema: { type: 'object', properties: { numero: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['numero'] },
  },
];

const TONE = {
  direto: 'Tom: direto e caloroso, sem floreios.',
  encorajador: 'Tom: encorajador. Reconheça o esforço em uma frase curta e celebre pequenos avanços, sem exagero e sem frases feitas. Continue objetivo.',
  humor: 'Tom: bem-humorado. Uma pitada de humor leve e esperto por resposta, nunca às custas da pessoa nem em assunto de saúde ou crise. Continue objetivo.',
};
export function buildSystem(ctx) {
  const instructions = `Você é o assistente pessoal dentro do app "TDAH na Vida Real", falando com ${ctx.name || 'a pessoa'}.
Responda em português do Brasil. ${TONE[ctx.tone] || TONE.direto} Formato para quem tem TDAH: comece pela próxima ação, use passos numerados curtos (no máximo 5), termine com UMA ação de menos de 2 minutos. Sem introdução, sem recapitulação.
Use o contexto abaixo (agenda, página de hoje, rotinas, kit, lembretes, sobre a pessoa) para personalizar. Cite estratégias do guia pelo número quando ajudar.
Você é o facilitador do app inteiro. Pode criar lembretes, definir as 3 do dia, criar e mudar tarefas, marcar passos, guardar ideias, registrar o que foi feito, adicionar estratégias ao kit e marcar compromissos na Agenda da casa (se estiver configurada).
Tarefas ficam numa matriz de prioridades: Faz hoje (importante e urgente), Agenda (importante, sem pressa), Rápido ou repassa (urgente, pouco importante) e Solta (nem um nem outro). Cada tarefa tem 3 fases: O quê (pronto quando), Como (passos) e Faz (só executar, sem decidir no meio). Quando a pessoa citar algo grande ou vago, crie com criar_tarefa_grande já fatiada, com pronto_quando e prioridade. Tarefas podem ter horário (o app avisa), local, categoria e repetição (todo dia, dias úteis, toda segunda, todo dia 10): quando a pessoa disser isso, preencha esses campos em vez de criar um lembrete separado. O humor do dia e da semana está no contexto: considere ao sugerir o tamanho do dia. No resumo da semana: comece pelo que deu certo, com números do contexto; depois o que travou, sem julgamento; termine com UM ajuste pequeno para a próxima semana. Para mexer em tarefas existentes use atualizar_tarefa e marcar_passo. Para descarregar a cabeça, separe o que é tarefa, lembrete com data e ideia. Para fechar o dia: o que ficou pra trás continua na matriz, sem culpa; sugira as 3 de amanhã (1 do Faz hoje, 1 da Agenda, 1 rápida) sem alterar as de hoje. Para horários diários de água, remédios e hábitos use definir_horarios; adicionar_lembrete é só para coisas pontuais, com data. Antes de alterar as 3 do dia, confirme com a pessoa, a menos que ela tenha pedido isso diretamente. Depois de usar uma ferramenta, diga em uma linha o que fez.
Você não é médico nem psicólogo: não sugira mudar dose, horário ou suspender medicação; nesses casos, oriente a falar com quem prescreveu. Se houver sinal de crise ou pensamento de se machucar, oriente com calma a ligar para o CVV (188) ou SAMU (192).
Agora: ${ctx.now}.`;
  return [
    { type: 'text', text: instructions },
    { type: 'text', text: `# Guia: 100 estratégias\n${GUIDE_TEXT}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `# Contexto atual do app\n${ctx.text}` },
  ];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpError(res, data, provider) {
  const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
  let err;
  if (res.status === 401 || res.status === 403 || /API key not valid/i.test(msg)) err = new Error('Chave da API inválida. Confira em Ajustes.');
  else if (res.status === 429) err = new Error(provider === 'gemini' ? 'Limite do plano gratuito atingido. Tente de novo em alguns minutos ou troque para o Flash-Lite.' : 'Limite de uso atingido. Tente de novo em alguns minutos.');
  else if (res.status === 503 || res.status === 529 || res.status === 500 || /high demand|overloaded|unavailable/i.test(msg)) {
    err = new Error('O modelo está sobrecarregado agora. Tente de novo em 1 minuto ou troque o modelo em Ajustes.');
    err.busy = true;
  } else err = new Error(msg);
  return err;
}

// Tenta de novo quando o servidor está sobrecarregado (espera 1,5 s e depois 6 s).
async function withRetry(fn, tries = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!e.busy || i >= tries - 1) throw e;
      await sleep(1500 * (i + 1) * (i + 1));
    }
  }
}

// ---------- Claude ----------
async function callClaude({ apiKey, model, system, messages, tools = TOOLS, extra = {}, maxTokens = 1500 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, tools, messages, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res, data, 'anthropic');
  return data;
}

async function runClaude({ apiKey, model, system, history, execTool, maxTurns }) {
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  const actions = [];
  let last = null;
  for (let i = 0; i < maxTurns; i++) {
    const data = await withRetry(() => callClaude({ apiKey, model, system, messages }));
    last = data;
    messages.push({ role: 'assistant', content: data.content });
    const uses = (data.content || []).filter(b => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !uses.length) break;
    const results = [];
    for (const u of uses) {
      let out;
      try { out = await execTool(u.name, u.input || {}); actions.push(out); } catch (e) { out = 'Erro: ' + (e.message || e); }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: String(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  const text = (last && last.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { text, actions };
}

// ---------- Gemini ----------
const GTYPE = { object: 'OBJECT', string: 'STRING', array: 'ARRAY', integer: 'INTEGER', number: 'NUMBER', boolean: 'BOOLEAN' };
function toGeminiSchema(s) {
  const out = { type: GTYPE[s.type] || 'STRING' };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  if (s.required) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
}
const GEMINI_TOOLS = [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) })) }];

async function callGemini({ apiKey, model, systemText, contents, tools = GEMINI_TOOLS, extra = {} }) {
  const id = model.replace(/^models\//, '');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemText }] }, contents, tools, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res, data, 'gemini');
  return data;
}

async function runGemini({ apiKey, model, system, history, execTool, maxTurns }) {
  const systemText = system.map(b => b.text).join('\n\n');
  const contents = history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const actions = [];
  let lastParts = [];
  let active = model;
  const fallback = /lite/i.test(model) ? 'gemini-flash-latest' : 'gemini-flash-lite-latest';
  const call = async () => {
    try { return await withRetry(() => callGemini({ apiKey, model: active, systemText, contents })); }
    catch (e) {
      if (!e.busy || active === fallback) throw e;
      active = fallback; // modelo principal sobrecarregado: usa o alternativo
      actions.push(`Usei o modelo alternativo (${fallback}) porque o principal estava sobrecarregado.`);
      return await withRetry(() => callGemini({ apiKey, model: active, systemText, contents }), 2);
    }
  };
  for (let i = 0; i < maxTurns; i++) {
    const data = await call();
    const cand = data.candidates && data.candidates[0];
    if (!cand) {
      const why = data.promptFeedback && data.promptFeedback.blockReason;
      throw new Error(why ? `O Gemini bloqueou a mensagem (${why}).` : 'O Gemini não respondeu.');
    }
    const content = cand.content || { role: 'model', parts: [] };
    if (!content.role) content.role = 'model';
    contents.push(content); // devolve as partes como vieram (preserva assinaturas de raciocínio)
    lastParts = content.parts || [];
    const calls = lastParts.filter(p => p.functionCall);
    if (!calls.length) break;
    const responses = [];
    for (const c of calls) {
      let out;
      try { out = await execTool(c.functionCall.name, c.functionCall.args || {}); actions.push(out); } catch (e) { out = 'Erro: ' + (e.message || e); }
      responses.push({ functionResponse: { name: c.functionCall.name, response: { result: String(out) } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  const text = lastParts.filter(p => p.text && !p.thought).map(p => p.text).join('\n').trim();
  return { text, actions };
}

export async function listGeminiModels(apiKey) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res, data, 'gemini');
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/(tts|image|audio|live|embedding|robotics)/i.test(m.name))
    .map(m => [m.name.replace(/^models\//, ''), m.displayName || m.name.replace(/^models\//, '')]);
}

// Executa o ciclo do agente no provedor escolhido. history: [{role:'user'|'assistant', content:string}]
export async function runAgent({ provider, apiKey, model, system, history, execTool, maxTurns = 5 }) {
  const fn = provider === 'gemini' ? runGemini : runClaude;
  return fn({ apiKey, model, system, history, execTool, maxTurns });
}

export const QUICK = [
  'Planeja meu dia com base na agenda de hoje',
  'Estou travado. Me ajuda a começar a próxima coisa',
  'Fatia uma tarefa grande pra mim',
  'Dia ruim. Qual o mínimo de hoje?',
  'Qual estratégia do guia eu deveria testar agora?',
  'Fecha meu dia: o que ficou pra trás volta pra matriz e me sugere as 3 de amanhã',
  'Faz o resumo da minha semana: o que deu certo, o que travou e um ajuste pra próxima',
];

// ---------- Fatiador: plano de uma tarefa numa chamada só ----------
const PLAN_TOOL = {
  name: 'plano_da_tarefa',
  description: 'Devolve o plano da tarefa: se é grande, quando está pronta, prioridade e passos pequenos.',
  input_schema: {
    type: 'object',
    properties: {
      grande: { type: 'boolean', description: 'true se leva mais de 25 minutos ou tem mais de uma etapa.' },
      pronto_quando: { type: 'string', description: 'Uma frase curta e verificável de quando a tarefa está pronta.' },
      importante: { type: 'boolean', description: 'Ajuda objetivos de longo prazo: saúde, família, trabalho que importa, dinheiro.' },
      urgente: { type: 'boolean', description: 'Tem prazo até amanhã ou consequência imediata se não fizer.' },
      prazo: { type: 'string', description: 'AAAA-MM-DD se a pessoa citou ou é óbvio; senão vazio.' },
      passos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string', description: 'Verbo + objeto, físico e concreto.' }, minutos: { type: 'integer' } }, required: ['texto', 'minutos'] } },
      preciso_de: { type: 'string', description: 'Material ou acesso necessário, curto. Vazio se nada.' },
      sugestao_quando: { type: 'string', description: 'Quando fazer o passo 1, AAAA-MM-DDTHH:MM, numa brecha da agenda e no futuro. Vazio se não souber.' },
      titulo: { type: 'string', description: 'Título limpo, com verbo quando couber, SEM a data, a hora, o local e a repetição.' },
      data: { type: 'string', description: 'AAAA-MM-DD se o texto disser um dia (amanhã, sexta, dia 10). Vazio se não.' },
      hora: { type: 'string', description: 'HH:MM se o texto disser um horário. Vazio se não.' },
      local: { type: 'string', description: 'Lugar citado no texto. Vazio se não.' },
      avisar_antes_min: { type: 'integer', description: 'Minutos de antecedência do aviso (0, 15, 30, 60 ou 1440). Compromisso fora de casa: 30 ou 60. Ligação ou algo em casa: 0.' },
      repete: { type: 'string', enum: ['nao', 'diaria', 'dias_uteis', 'semanal', 'mensal'] },
      dias_semana: { type: 'array', items: { type: 'integer' }, description: 'Para semanal: 0 = domingo ... 6 = sábado.' },
      dia_mes: { type: 'integer', description: 'Para mensal: dia do mês.' },
      categoria: { type: 'string', description: 'Uma das categorias da pessoa, se alguma servir. Vazio se nenhuma.' },
    },
    required: ['grande', 'pronto_quando', 'importante', 'urgente', 'passos'],
  },
};

function planPrompt({ titulo, modo, pronto, passos, passo }) {
  if (modo === 'travei') return `A pessoa travou neste passo da tarefa "${titulo}": "${passo}". Quebre SÓ esse passo em 2 a 4 pedaços menores, de 2 a 10 minutos, o primeiro ridiculamente fácil. Em "passos" devolva só esses pedaços. Mantenha os outros campos coerentes com a tarefa.`;
  const base = `Tarefa: "${titulo}".${pronto ? ` Pronto quando: ${pronto}.` : ''}`;
  if (modo === 'mais_fino') return `${base} O plano anterior tinha estes passos: ${(passos || []).map((p, i) => `${i + 1}. ${p.texto || p.t} (${p.minutos || p.est || '?'} min)`).join('; ')}. A pessoa achou grosso demais: refaça com passos MENORES (no máximo 15 minutos cada, de 5 a 10 passos).`;
  return `${base} Monte o plano. Se for rápida (até 25 min, uma etapa), grande=false e um único passo. Compromisso ou recado (dentista, ligar para alguém, buscar algo) é rápido: grande=false. O texto foi escrito do jeito da pessoa e pode ter data, hora, local e repetição: separe em titulo, data, hora, local, repete e categoria.`;
}

// Retorna o objeto do plano (campos de PLAN_TOOL).
export async function planTask({ provider, apiKey, model, contextText, now, titulo, modo = 'novo', pronto = '', passos = [], passo = '', cats = [] }) {
  const sys = `Você fatia tarefas para uma pessoa com TDAH, dentro do app "TDAH na Vida Real". Responda SÓ chamando a ferramenta plano_da_tarefa, em português do Brasil.
Regras: passos de 5 a 25 minutos (o primeiro bobo de tão fácil, até 10 min), de 3 a 8 passos, cada um com verbo e objeto físico ("abrir a planilha", não "pensar no relatório"). "pronto_quando" é verificável. Importante = leva a pessoa pra frente no longo prazo; urgente = prazo até amanhã ou consequência imediata. Use a agenda do contexto para sugerir quando fazer o passo 1, numa brecha futura.
Agora: ${now}.${cats.length ? `\nCategorias da pessoa: ${cats.join(', ')}.` : ''}

# Contexto do app
${contextText}`;
  const prompt = planPrompt({ titulo, modo, pronto, passos, passo });
  let input;
  if (provider === 'gemini') {
    const decl = [{ functionDeclarations: [{ name: PLAN_TOOL.name, description: PLAN_TOOL.description, parameters: toGeminiSchema(PLAN_TOOL.input_schema) }] }];
    const extra = { toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [PLAN_TOOL.name] } } };
    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const fallback = /lite/i.test(model) ? 'gemini-flash-latest' : 'gemini-flash-lite-latest';
    let data;
    try { data = await withRetry(() => callGemini({ apiKey, model, systemText: sys, contents, tools: decl, extra })); }
    catch (e) { if (!e.busy) throw e; data = await withRetry(() => callGemini({ apiKey, model: fallback, systemText: sys, contents, tools: decl, extra }), 2); }
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const call = parts.find(x => x.functionCall);
    input = call && call.functionCall.args;
  } else {
    const data = await withRetry(() => callClaude({ apiKey, model, system: sys, messages: [{ role: 'user', content: prompt }], tools: [PLAN_TOOL], extra: { tool_choice: { type: 'tool', name: PLAN_TOOL.name } }, maxTokens: 1200 }));
    const use = (data.content || []).find(b => b.type === 'tool_use');
    input = use && use.input;
  }
  if (!input || !Array.isArray(input.passos) || !input.passos.length) throw new Error('A IA não devolveu um plano. Tente de novo.');
  input.passos = input.passos.filter(x => x && String(x.texto || '').trim()).map(x => ({ texto: String(x.texto).trim(), minutos: Math.max(1, Math.round(Number(x.minutos) || 10)) }));
  return input;
}
