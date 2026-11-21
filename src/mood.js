// Humor em 1 toque: as opções, os rostinhos e a frase do dia (a "recompensa" do check-in).

export const MOODS = [
  ['animado', 'Animado', '#d99a16'],
  ['calmo', 'Calmo', '#2f8a76'],
  ['cansado', 'Cansado', '#7a8784'],
  ['ansioso', 'Ansioso', '#c0613f'],
  ['pra-baixo', 'Pra baixo', '#5b6fa8'],
];
export const moodOf = k => MOODS.find(m => m[0] === k) || null;

const MOUTH = {
  animado: '<path d="M7.5 13.5c1.2 2.4 3 3.5 4.5 3.5s3.3-1.1 4.5-3.5z" fill="currentColor" stroke="none"/>',
  calmo: '<path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/>',
  cansado: '<path d="M9 15.5h6"/>',
  ansioso: '<path d="M8 15.5c.7-.8 1.3-.8 2 0s1.3.8 2 0 1.3-.8 2 0 1.3.8 2 0"/>',
  'pra-baixo': '<path d="M8.5 16.5c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8"/>',
};
const EYES = {
  cansado: '<path d="M7.8 10.2h2.4M13.8 10.2h2.4"/>',
  animado: '<path d="M7.8 10.6c.4-.9 1.9-.9 2.4 0M13.8 10.6c.4-.9 1.9-.9 2.4 0"/>',
};
export function face(k, size = 34) {
  const m = moodOf(k); const color = m ? m[2] : 'var(--muted)';
  const eyes = EYES[k] || '<circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/>';
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:${color}"><circle cx="12" cy="12" r="10" fill="${color}" fill-opacity=".16"/>${eyes}${MOUTH[k] || ''}</svg>`;
}

// Frases curtas, uma por dia, escolhidas pelo humor marcado.
const PHRASES = {
  animado: [
    'Energia boa é ótima para começar o que você vem empurrando. Escolhe uma e vai.',
    'Antes de abrir dez frentes, termina uma. A animação dura mais quando vira resultado.',
    'Aproveita a onda para o passo chato da tarefa grande. Hoje ele pesa menos.',
    'Anota as ideias que surgirem no estacionamento. Elas esperam você terminar.',
    'Dia bom também cansa. Deixa um pouco de bateria para a noite.',
    'Usa o embalo para adiantar o amanhã: separa a roupa, a bolsa, a chave.',
    'Se der vontade de topar tudo, topa uma coisa só e diz "vejo depois" para o resto.',
    'Celebra o que fizer hoje. Seu cérebro aprende com o que dá certo.',
  ],
  calmo: [
    'Calma é o melhor momento para a tarefa que pede atenção. Bloco de 25 e pronto.',
    'Hoje dá para olhar a matriz com carinho e escolher sem pressa.',
    'Um passo pequeno agora vale mais que um plano perfeito depois.',
    'Bom dia para resolver aquela pendência de 5 minutos que vive voltando.',
    'Aproveita a paz para arrumar o ambiente da próxima tarefa.',
    'Constância não é intensidade. É voltar, de novo, sem drama.',
    'Se a cabeça está quieta, escuta o corpo: água, comida, movimento.',
    'Dia tranquilo também é produtivo. Descansar faz parte do plano.',
  ],
  cansado: [
    'Cansado conta. Hoje, o mínimo bem feito já é muito.',
    'Escolhe a tarefa mais leve e deixa a pesada para quando a bateria voltar.',
    'Água, algo para comer e 10 minutos longe da tela. Depois você decide o resto.',
    'Não é preguiça. Cérebro cansado pede menos decisões, não mais culpa.',
    'Um passo de 5 minutos ainda é avançar. Só ele, e depois vê.',
    'Se puder, troca uma tarefa por um descanso de verdade. É investimento.',
    'Hoje vale pedir ajuda ou adiar sem pedir desculpa demais.',
    'Dormir cedo hoje é a melhor tarefa para o amanhã.',
  ],
  ansioso: [
    'Respira em 4 tempos, segura 4, solta em 6. Repete três vezes antes de decidir algo.',
    'Ansiedade aumenta o tamanho das coisas. Escreve a tarefa e olha só o primeiro passo.',
    'Descarrega a cabeça no app. O que está escrito para de girar.',
    'Uma coisa por vez. O resto da lista não vai fugir nos próximos 25 minutos.',
    'Pergunta para você: o que está no meu controle agora? Começa por aí.',
    'Movimento ajuda: uma volta no quarteirão ou subir uma escada.',
    'Se a cabeça diz "tudo urgente", a matriz diz o contrário. Confia nela hoje.',
    'Você já atravessou dias assim antes. Este também passa.',
  ],
  'pra-baixo': [
    'Dia pesado. O objetivo hoje é só atravessar, e isso já é bastante.',
    'Faz uma coisa pequena por você: banho, sol na janela, uma música.',
    'Fala com alguém de confiança, nem que seja uma mensagem curta.',
    'Seja gentil com você como seria com um amigo no mesmo dia.',
    'A lista espera. Você vem primeiro hoje.',
    'Se puder, ativa o modo dia ruim e marca só o essencial.',
    'Sentimento não é sentença. Amanhã pode ser diferente.',
    'Se pesar demais, procura ajuda: CVV 188, de graça e a qualquer hora.',
  ],
};
export function phraseOfDay(mood, dayKey) {
  const list = PHRASES[mood] || PHRASES.calmo;
  let h = 0; for (const c of String(dayKey)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
