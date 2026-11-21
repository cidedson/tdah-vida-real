// Conteúdo do guia "TDAH na Vida Real — 100 Estratégias" e das 7 rotinas do "Rotina Sem Drama".
// Cada estratégia: [número, título, texto]

export const PRINCIPLES = [
  ['Tornar o tempo visível', 'Relógio, timer, alarme com nome de ação.'],
  ['Tirar a memória da cabeça', 'Listas, lembretes, lugares fixos.'],
  ['Reduzir atrito', 'Deixar o certo fácil e o errado trabalhoso.'],
  ['Criar urgência artificial', 'Prazos curtos, plateia, companhia.'],
  ['Cuidar da energia', 'Sono, comida, movimento e emoções.'],
];

export const RULES = [
  'Três, não trinta. Começar com muitas é a forma mais rápida de não manter nenhuma.',
  'Sete dias de teste. Antes disso, você está avaliando a novidade, não a estratégia.',
  'Falhou? Ajuste a estratégia, não sua autoestima. Troque o horário, o lugar ou o tamanho.',
  'Estratégia boa é a que funciona em dia ruim. Se só dá certo em dia inspirado, ela é grande demais.',
];

export const CHAPTERS = [
  {
    id: 'manha', title: 'Manhã e arranque do dia',
    intro: 'A manhã se ganha na noite anterior: quanto menos decisões ao acordar, menos chance de travar.',
    items: [
      [1, 'Prepare a manhã na véspera', 'Roupa separada, bolsa pronta, marmita na geladeira. Experimente: 5 minutos antes de dormir, todo dia.'],
      [2, 'Monte uma estação de saída', 'Um lugar fixo perto da porta para chave, carteira, crachá e fone. Tudo que sai com você mora ali.'],
      [3, 'Alarme do outro lado do quarto', 'Para desligar, você precisa levantar. O soneca perde a graça quando exige caminhada.'],
      [4, 'Rotina escrita no espelho', 'Cinco passos num papel colado no banheiro. Cérebro sonolento não lembra; ele lê.'],
      [5, 'Primeiro ato sem decisão', 'Sempre o mesmo: copo d\'água e janela aberta. Começar no automático puxa o resto.'],
      [6, 'Celular longe até o café', 'Abrir o feed na cama é entrar numa ladeira de 40 minutos. Carregue o aparelho fora do quarto.'],
      [7, 'Calcule de trás pra frente', 'Horário de chegada, menos trajeto, menos cada etapa, menos 15 minutos de margem. Anote o horário de saída, não o de chegada.'],
      [8, 'Playlist-relógio', 'Uma playlist com a duração exata da rotina. Quando tocar a música 5, você já deveria estar calçado.'],
      [9, 'Café da manhã repetido', 'O mesmo cardápio de 2 minutos, de preferência com proteína. Variedade fica para o fim de semana.'],
      [10, 'Uma prioridade antes do e-mail', 'Num post-it: "Se eu fizer só uma coisa hoje, é ___". Caixa de entrada depois.'],
    ],
  },
  {
    id: 'comecar', title: 'Começar tarefas e driblar a procrastinação',
    intro: 'O problema quase nunca é a tarefa inteira: é o primeiro passo. Deixe esse passo pequeno, concreto e com companhia.',
    items: [
      [11, 'Regra dos 2 minutos', 'Se leva menos de 2 minutos, faça agora. Anotar demora mais que resolver.'],
      [12, 'Fatie até ficar ridículo', '"Fazer o imposto de renda" vira "abrir o programa". O primeiro passo precisa ser físico e visível.'],
      [13, 'Só 5 minutos', 'Combine consigo: 5 minutos e pode parar. Na maioria das vezes, você continua.'],
      [14, 'Body doubling', 'Faça a tarefa com alguém por perto, mesmo que a pessoa não ajude. Vale chamada de vídeo muda com um amigo.'],
      [15, 'Prazo com plateia', 'Avise alguém: "Te mando até as 16h". Prazo que só você conhece não assusta ninguém.'],
      [16, 'Recompensa casada', 'Seu podcast favorito só toca enquanto você lava a louça. A tarefa chata vira o ingresso.'],
      [17, 'Pare no meio', 'Termine a sessão no meio de uma frase ou de um passo. Retomar fica muito mais fácil.'],
      [18, 'Mude o cenário', 'Tarefa encalhada rende em lugar novo: varanda, café, outra mesa. Novidade é combustível.'],
      [19, 'Lista do feito', 'Anote o que você já fez, não só o que falta. Ver progresso dá gás para continuar.'],
      [20, 'Versão feia primeiro', 'Chame o arquivo de "rascunho_feio". Perfeccionismo trava; rascunho ruim destrava.'],
    ],
  },
  {
    id: 'tempo', title: 'Tempo, prazos e cegueira temporal',
    intro: 'Para quem tem TDAH, o tempo costuma ter só dois estados: "agora" e "não agora". O trabalho aqui é deixar o tempo visível.',
    items: [
      [21, 'Relógio que se vê', 'Relógio analógico ou timer visual na mesa. Ver o tempo passar funciona melhor que saber as horas.'],
      [22, 'Timer em tudo', 'Antes de começar, estime. Ao terminar, compare com o real. Em duas semanas, você conhece seu fator de erro.'],
      [23, 'Multiplique por 1,5', 'Sua estimativa é otimista por padrão. Planeje com 1,5 vez o tempo, ou 2 vezes para tarefas novas.'],
      [24, 'Tarefa sem horário não existe', 'Coloque as importantes na agenda, em blocos, não só numa lista.'],
      [25, 'Alarme com verbo', 'Em vez de "Dentista", escreva "Sair para o dentista AGORA". O alarme diz o que fazer, não só o que existe.'],
      [26, 'Lembrete duplo', 'Um na véspera para se preparar e outro 1 hora antes para agir.'],
      [27, 'Margem de transição', 'Deixe 10 a 15 minutos entre compromissos. Reuniões de 25 ou 50 minutos, não 30 ou 60.'],
      [28, 'Prazo longo com marcos', 'Da data de entrega para trás, defina uma entrega parcial por semana. Prazo distante vira vários prazos próximos.'],
      [29, 'Contagem regressiva visível', 'Um widget no celular com "faltam 12 dias". Transforma o "não agora" em número.'],
      [30, 'Revisão semanal de 15 minutos', 'Mesmo dia e hora, toda semana: agenda, prazos e as 3 prioridades. É o hábito que segura todos os outros.'],
    ],
  },
  {
    id: 'foco', title: 'Foco e distrações',
    intro: 'Força de vontade perde para distância física. Mude o ambiente antes de tentar mudar a cabeça.',
    items: [
      [31, 'Pomodoro sob medida', 'O clássico é 25 de foco e 5 de pausa. Teste 15/5 ou 45/10 e fique com o que você aguenta.'],
      [32, 'Estacionamento de ideias', 'Um papel ao lado do teclado para a ideia que surge no meio do foco. Anotou, voltou.'],
      [33, 'Uma aba, uma tarefa', 'Feche o resto e use tela cheia. Cada aba aberta é um convite.'],
      [34, 'Notificações no mínimo', 'Desligue tudo que não é pessoa real. Use o modo foco do celular com horário fixo.'],
      [35, 'Celular em outro cômodo', 'Durante o bloco de foco, ele fica longe. Fora do alcance, fora da cabeça.'],
      [36, 'Som de fundo testado', 'Ruído marrom, lo-fi ou música sem letra. Teste cada um por um dia e compare.'],
      [37, 'Fone como placa de "ocupado"', 'Combine com quem divide o espaço: fone no ouvido significa "só se for urgente".'],
      [38, 'Bloqueador de sites', 'Apps que bloqueiam redes sociais em horários definidos. Você decide uma vez, e não a cada 5 minutos.'],
      [39, 'Movimento liberado', 'Fidget, bolinha na mão, andar durante ligações. Para muita gente, mexer o corpo segura a atenção.'],
      [40, 'Hiperfoco com alarme de saída', 'Aproveite quando ele vier, mas programe alarmes para comer, beber água e parar.'],
    ],
  },
  {
    id: 'casa', title: 'Casa, objetos e bagunça',
    intro: 'Para o cérebro com TDAH, o que não está à vista deixa de existir. Organize para ver, não para ficar bonito.',
    items: [
      [41, 'Endereço fixo para os fujões', 'Chave, óculos, carregador e carteira têm um lugar só. Sem exceção, nem "só hoje".'],
      [42, 'Rastreador na chave e na carteira', 'Uma etiqueta Bluetooth custa menos que 20 minutos de procura por semana.'],
      [43, 'Visível vence organizado', 'Caixas transparentes, prateleiras abertas, etiquetas grandes. Gaveta fechada é cemitério de objetos.'],
      [44, 'Cesto da bagunça', 'Um por cômodo. Tudo fora do lugar vai para lá, e você esvazia uma vez por semana.'],
      [45, 'Faxina relâmpago', 'Timer de 10 minutos e música animada. Quando acabar, parou. Pouco e sempre ganha de muito e nunca.'],
      [46, 'Saiu do cômodo, leve algo', 'Ao sair, leve um objeto que não pertence ali. A casa se arruma no caminho.'],
      [47, 'Duplicatas estratégicas', 'Carregador em cada cômodo, tesoura em cada gaveta. Sai mais barato que procurar.'],
      [48, 'Alarme para a máquina de lavar', 'Ligou a máquina, programou o alarme para tirar a roupa. Fim da roupa esquecida com cheiro de mofo.'],
      [49, 'Entra um, sai um', 'Para cada coisa nova, uma antiga vai embora. Menos coisas, menos manutenção.'],
      [50, 'Checklist de reset noturno', 'Cinco itens antes de dormir: pia, sala, porta trancada, estação de saída, celular carregando.'],
    ],
  },
  {
    id: 'dinheiro', title: 'Dinheiro, contas e burocracia',
    intro: 'A multa por atraso é o "imposto TDAH" mais comum. A saída é automatizar o que for fixo e agendar o resto.',
    items: [
      [51, 'Débito automático no que for fixo', 'Luz, água, internet, condomínio. O que paga sozinho não depende da sua memória.'],
      [52, 'Hora da burocracia', '30 minutos fixos por semana, por exemplo terça às 19h. Papéis, boletos e e-mails chatos esperam por esse horário.'],
      [53, 'Caixa de entrada de papéis', 'Uma bandeja única para todo papel que chega. Nada fica espalhado pela casa.'],
      [54, 'Fotografe e nomeie', 'Documento importante vira foto na nuvem com nome padrão: AAAA-MM-DD_assunto. Busca em segundos.'],
      [55, 'Regra das 48 horas', 'Compra por impulso espera 2 dias no carrinho. Tire o cartão salvo dos apps de compra.'],
      [56, 'Duas contas', 'Uma para contas fixas e outra para gastos livres. O saldo da segunda é o seu limite visível.'],
      [57, 'Alerta a cada compra', 'Ative a notificação do banco para todo gasto. Ver o dinheiro sair dói na hora certa.'],
      [58, 'Auditoria de assinaturas', 'A cada 3 meses, liste streaming, apps e clubes. Cancele o que você não usou no período.'],
      [59, 'Lembrete 3 dias antes do vencimento', 'Com o boleto ou a chave Pix já anexados ao lembrete. Zero procura na hora de pagar.'],
      [60, 'Pasta do imposto de renda o ano todo', 'Recibo médico, informe de rendimentos e notas vão direto para ela. Na época da declaração, é só abrir.'],
    ],
  },
  {
    id: 'trabalho', title: 'Trabalho, reuniões e estudos',
    intro: 'No trabalho, o que não está escrito se perde. Capture tudo num lugar só e proteja seus blocos de foco.',
    items: [
      [61, 'Um único lugar para tarefas', 'Um app ou um caderno, não cinco. Tarefa espalhada é tarefa esquecida.'],
      [62, 'Feche reuniões com próximos passos', 'Nos últimos 2 minutos, anote: quem faz o quê e até quando.'],
      [63, 'Confirme por escrito', 'Depois de uma conversa importante, mande 3 linhas resumindo o combinado. Vale para você e para o outro.'],
      [64, 'Reunião com você mesmo', 'Bloqueie 2 horas de foco na agenda e trate como compromisso com o chefe.'],
      [65, 'Agrupe tarefas parecidas', 'E-mails em 2 horários por dia, ligações em sequência. Cada troca de contexto custa caro.'],
      [66, 'Respeite seu pico de energia', 'Tarefa difícil no horário em que você rende mais. Travou? Comece por uma fácil só para dar partida.'],
      [67, 'Checklist para o que se repete', 'Relatório mensal, fechamento, viagem. Monte o roteiro uma vez e nunca mais reinvente.'],
      [68, 'Grave e transcreva', 'Com permissão, grave aulas e reuniões e use transcrição automática. Você relê o que perdeu.'],
      [69, 'Estudo ativo', 'Explique em voz alta, faça perguntas e use flashcards. Leitura passiva escorrega da cabeça.'],
      [70, 'Peça ajustes, se for seguro', 'Instruções por escrito, prazos intermediários, mesa mais silenciosa. Contar ou não sobre o TDAH é decisão sua.'],
    ],
  },
  {
    id: 'corpo', title: 'Corpo: sono, comida e movimento',
    intro: 'Sono ruim, fome e sedentarismo pioram desatenção e irritabilidade. Cuidar do corpo é a estratégia que turbina todas as outras.',
    items: [
      [71, 'Alarme para começar a desligar', 'Além do alarme de acordar, um de "hora de ir dormir" 1 hora antes. Sem ele, a noite estica sozinha.'],
      [72, 'Telas fora do quarto', 'O "só mais um episódio" é a vingança contra um dia sem tempo livre. Carregue o celular na sala.'],
      [73, 'Exercício como ferramenta de foco', 'Uma sessão de movimento aeróbico costuma melhorar atenção e humor nas horas seguintes. Se der, treine antes da tarefa difícil.'],
      [74, 'Treino com hora e companhia', 'Aula marcada, personal ou amigo. Compromisso externo vence a motivação do dia.'],
      [75, 'Refeições com alarme', 'Com hiperfoco ou medicação que tira o apetite, é fácil passar do horário. Alarme para almoço e lanche.'],
      [76, 'Lanche pronto e à vista', 'Iogurte, ovo cozido, castanhas, fruta lavada. Se dá trabalho, vira biscoito.'],
      [77, 'Garrafa de água com marcações', 'Linhas com horário na garrafa e ela sempre na mesa. Sede também se disfarça de cansaço.'],
      [78, 'Remédio com gatilho', 'Se você usa medicação prescrita, deixe o organizador semanal junto da escova de dentes, com alarme. A caixinha mostra se já tomou.'],
      [79, 'Cafeína com hora de corte', 'Se o sono anda ruim, teste um limite, como nada depois das 14h. Avalie por uma semana.'],
      [80, 'Checagem FRSC antes de explodir', 'Estou com Fome, Raiva, Solidão ou Cansaço? Muitas vezes o problema não é a tarefa, é o tanque vazio.'],
    ],
  },
  {
    id: 'emocoes', title: 'Emoções, energia e autoestima',
    intro: 'Emoções intensas e autocrítica pesada são parte frequente da vida com TDAH. O objetivo é ganhar alguns segundos entre sentir e reagir.',
    items: [
      [81, 'Dê nome à emoção', '"Estou frustrado" ou "estou ansioso". Nomear o que sente costuma baixar o volume.'],
      [82, 'Pausa de 90 segundos', 'Antes de responder no calor do momento, saia, beba água e respire devagar. A mensagem pode esperar.'],
      [83, 'Fato ou suposição?', 'Sentiu rejeição? Separe o que você sabe do que está imaginando. "Ele não respondeu" não é "ele está com raiva de mim".'],
      [84, 'Mapa de energia', 'Por uma semana, anote em que horários você rende e em quais desaba. Agende o difícil nos picos.'],
      [85, 'Plano B para dia ruim', 'Uma versão mínima da rotina: remédio se usar, comer, banho e uma tarefa. Dia ruim cumprido no mínimo ainda conta.'],
      [86, 'Troque "preguiçoso" por "travado"', 'Autocrítica não dá partida no motor. A pergunta útil é: "o que está me travando agora?"'],
      [87, 'Pasta de vitórias', 'Prints de elogios, entregas e conquistas num álbum só. Abra em dia de autoestima baixa.'],
      [88, 'Diga não mais vezes', 'Agenda lotada é receita de atraso. Frase coringa: "deixa eu ver minha agenda e te respondo".'],
      [89, 'Hobby que acabou não é fracasso', 'Interesse que vai e vem é comum. Só segure o gasto inicial: empreste ou alugue antes de comprar o kit completo.'],
      [90, 'Busque terapia especializada', 'A terapia cognitivo-comportamental para TDAH adulto ensina estas habilidades com acompanhamento. Grupos de apoio também ajudam.'],
    ],
  },
  {
    id: 'relacoes', title: 'Relações, família e comunicação',
    intro: 'Esquecimento e interrupção costumam ser lidos como descaso. Explicar como você funciona e combinar sistemas evita boa parte das brigas.',
    items: [
      [91, 'Explique em uma frase', '"Não é descaso, é como meu cérebro funciona. Me ajuda muito se você mandar por escrito."'],
      [92, 'Agenda compartilhada da casa', 'Compromissos da família numa agenda que todos veem. Combinado de boca não vale.'],
      [93, 'Divida tarefas por pontos fortes', 'Quem gosta de planilha cuida das contas; quem gosta de gente cuida dos convites. Justiça não é dividir tudo ao meio.'],
      [94, 'Datas importantes com antecedência', 'Aniversário entra na agenda com lembrete 1 semana antes. Dá tempo de comprar o presente.'],
      [95, 'Repita o que ouviu', '"Então você está dizendo que…". Prende sua atenção e mostra que você está presente.'],
      [96, 'Anote em vez de interromper', 'Teve uma ideia enquanto o outro fala? Anote no celular e espere sua vez.'],
      [97, 'Palavra-código combinada', 'Com quem você confia, um sinal para "você está monologando" ou "você se distraiu". Sem constrangimento.'],
      [98, 'Desculpa com ajuste, sem autoflagelo', '"Desculpa por esquecer. Coloquei um alarme para não repetir." Responsabilidade mais solução.'],
      [99, 'Mensagens em janelas', 'Responda em dois horários fixos por dia. Resposta curta vale, e "vi, te respondo à noite" também.'],
      [100, 'Encontre sua turma', 'Grupos e comunidades de adultos com TDAH. Ser entendido sem precisar explicar muda muita coisa.'],
    ],
  },
];

export const HELP = [
  ['Sem diagnóstico, com prejuízo frequente', 'No trabalho, nos estudos, no dinheiro ou nas relações: procure avaliação com psiquiatra ou neurologista.'],
  ['Com diagnóstico, mas as estratégias não bastam', 'Converse com seu médico sobre revisar o tratamento.'],
  ['Efeitos colaterais da medicação', 'Fale com quem prescreveu. Não ajuste nem suspenda por conta própria.'],
  ['Ansiedade, tristeza persistente ou sono ruim por semanas', 'O TDAH costuma vir acompanhado, e isso também merece avaliação.'],
  ['Crise ou pensamentos de se machucar', 'Ligue para o CVV no 188, gratuito e 24 horas, ou para o SAMU no 192 em emergência.'],
];

export const ROUTINES = [
  {
    id: 'manha', title: 'Lançamento da manhã', when: 'Ao acordar', duration: '20 min',
    trigger: 'O alarme do outro lado do quarto.',
    steps: ['Levantar para desligar o alarme', 'Copo d\'água e janela aberta', 'Banheiro, seguindo a lista colada no espelho', 'Vestir a roupa separada na véspera', 'Café da manhã repetido, de 2 minutos', 'Remédio, se você usa', 'Pegar tudo na estação de saída'],
    ifStuck: 'Coloque a playlist com a duração da rotina e siga a música, não o relógio.',
    minimal: 'Água, roupa e estação de saída.',
  },
  {
    id: 'ignicao', title: 'Ignição do trabalho', when: 'Ao sentar para trabalhar', duration: '10 min',
    trigger: 'Abrir o notebook.',
    steps: ['Celular no modo foco e longe da mão', 'Descarrego mental de 2 minutos no papel', 'Escolher as 3 do dia', 'Escrever o primeiro passo físico da prioridade 1', 'Timer de 5 minutos e começar', 'Só depois disso: e-mail e mensagens'],
    ifStuck: 'Comece pela tarefa mais fácil da lista, só para dar partida no motor.',
    minimal: 'Uma prioridade e 5 minutos de timer.',
  },
  {
    id: 'foco', title: 'Bloco de foco', when: 'Horário marcado na agenda', duration: '25 a 50 min',
    trigger: 'O lembrete do bloco.',
    steps: ['Banheiro antes e garrafa de água na mesa', 'Uma aba, uma tarefa, tela cheia', 'Fone e som de fundo escolhido', 'Papel de estacionamento de ideias ao lado', 'Timer ligado', 'No fim: pausa de 5 a 10 minutos em pé, longe da tela'],
    ifStuck: 'Reduza o bloco para 15 minutos. Termina o primeiro e decide se faz outro.',
    minimal: '15 minutos de timer em uma única tarefa.',
    timer: true,
  },
  {
    id: 'fechamento', title: 'Fechamento do expediente', when: '15 min antes de encerrar', duration: '10 min',
    trigger: 'Alarme "fechar o dia".',
    steps: ['Anotar o que foi feito hoje', 'Passar as pendências para a lista ou para amanhã', 'Escrever o primeiro passo de amanhã', 'Conferir a agenda de amanhã', 'Fechar abas e liberar a mesa'],
    ifStuck: 'Escreva só o primeiro passo de amanhã. É o presente mais útil que você pode deixar para si mesmo.',
    minimal: 'Primeiro passo de amanhã anotado.',
  },
  {
    id: 'noite', title: 'Reset noturno', when: '1 hora antes de dormir', duration: '15 min',
    trigger: 'Alarme "começar a desligar".',
    steps: ['Pia e cozinha com timer de 5 minutos', 'Esvaziar o cesto da bagunça da sala', 'Estação de saída completa: chave, carteira, crachá, fone', 'Roupa e bolsa de amanhã separadas', 'Porta trancada', 'Celular carregando fora do quarto'],
    ifStuck: 'Faça com música animada e pare quando o timer tocar, mesmo que não tenha terminado.',
    minimal: 'Estação de saída pronta e celular fora do quarto.',
  },
  {
    id: 'semanal', title: 'Revisão semanal', when: 'Mesmo dia e hora, toda semana', duration: '15 a 20 min',
    trigger: 'Lembrete recorrente na agenda.',
    steps: ['Olhar a agenda da semana inteira', 'Criar lembretes para prazos e contas que vencem', 'Esvaziar bolsos, mochila e caixa de entrada de papéis', 'Transferir pendências da semana anterior, sem culpa', 'Escolher as 3 prioridades da semana', 'Marcar na agenda os blocos de foco'],
    ifStuck: 'Faça junto com alguém, mesmo em chamada de vídeo, ou leve o planner para um café.',
    minimal: 'Olhar a agenda e escolher as 3 da semana.',
  },
  {
    id: 'sos', title: 'Modo SOS para dia ruim', when: 'Dia ruim', duration: 'O que der',
    trigger: 'Perceber que hoje não é dia de rotina completa.',
    steps: ['Comer alguma coisa', 'Beber água', 'Remédio, se você usa', 'Banho ou, no mínimo, escovar os dentes', 'Uma tarefa, de qualquer tamanho', 'Avisar quem precisa saber: adiar algo ou pedir ajuda', 'Dormir no horário'],
    ifStuck: 'Dia ruim cumprido no mínimo continua contando. Amanhã você volta para a rotina normal, sem compensar nada.',
    minimal: 'Comer, água e dormir no horário.',
    alert: 'Se os dias ruins viram semanas, ou aparecem pensamentos de se machucar, procure ajuda. O CVV atende no 188, gratuito e 24 horas.',
  },
];

export const BODY_CHECKS = ['Água ao longo do dia', 'Pelo menos uma refeição de verdade', 'Remédio, se você usa', '10 minutos de movimento', 'Telas longe na hora de dormir'];

export const BAD_DAY_CHECKS = ['Comi alguma coisa', 'Bebi água', 'Tomei o remédio, se uso', 'Tomei banho ou pelo menos escovei os dentes', 'Fiz uma tarefa, de qualquer tamanho'];

export const WEEK_CHECKS = ['Olhei a agenda da semana inteira', 'Anotei prazos e contas que vencem', 'Esvaziei bolsos, mochila e caixa de entrada de papéis', 'Transferi pendências da semana anterior, sem culpa', 'Escolhi as 3 prioridades da semana'];
