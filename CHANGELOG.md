# Versões

Cada push na `main` gera um APK em [Releases](../../releases). O número final da versão é o número do build.

## 1.9 — 21 de novembro de 2026

- **Tela Hoje mais limpa:** de 4 rolagens para 1 e meia, sem perder nenhuma função.
- **Card "Agora" no topo:** o progresso do dia e uma coisa só para agora: o remédio da vez (**Tomei** e **Em 15 min**) ou a prioridade (**Focar 25 min** e **Feito**). O aviso de levar o remédio aparece ali.
- **"Meu dia" no lugar das 3 do dia e do "Meu dia em blocos":** uma lista por Manhã, Tarde e Noite com a agenda, as tarefas com horário, os lembretes e o que você adicionar. As 3 prioridades aparecem com ★ no período em que cabem. O período que já passou se fecha quando está tudo feito.
- **Adicionar ao dia:** o **+** abre uma folha com o que é, se é uma das 3 prioridades, quando no dia e sugestões da matriz. Tocar num item abre a mesma folha para editar ou tirar.
- **Humor numa linha:** as 5 carinhas; depois do toque, uma linha que abre a frase do dia, a energia e a semana.
- **Mais do dia:** Descarrego, Corpo em dia, Feito hoje, Uma coisa boa, Próximos lembretes e Páginas anteriores, cada um numa linha que abre quando você toca. **Descarregar** abre direto o descarrego.
- Remédios e agenda completos ficam a um toque, nos chips do "Meu dia". O que você já tinha escrito nos blocos aparece como anotação no período.
- O assistente agora coloca cada prioridade no período certo do dia.
- Correção: com o Gemini, o assistente respondia "cannot be empty" e não funcionava. Era uma opção vazia na lista de períodos, que o Gemini não aceita.

## 1.8 — 21 de novembro de 2026

- **Aviso de versão nova:** uma vez por dia, ao abrir o app, ele confere no GitHub se saiu versão nova. Se saiu, mostra um card na tela Hoje com as novidades e o botão **Baixar e instalar**, e manda uma notificação uma vez.
- **Depois** esconde o card por 3 dias.
- Em Ajustes › Sobre o app: **Procurar agora**, a data da última procura e a chave para ligar ou desligar o aviso.
- Só a consulta ao GitHub sai do celular. Nenhum dado seu vai junto.
- O código agora fica num repositório público, sem a chave de assinatura. As atualizações continuam instalando por cima.

## 1.7 — 21 de novembro de 2026

- **Captura mágica:** escreva ou fale do seu jeito, como "dentista sexta 15h no centro" ou "pagar a luz todo dia 10". O app separa data, hora, local, repetição e categoria, mostra antes de salvar e avisa no horário (com 30 min de antecedência quando tem local). Funciona sem IA; com IA, a leitura fica mais esperta e a tarefa ainda chega fatiada.
- **Anotar** na tela Hoje abre a captura de qualquer lugar.
- **Tarefas que se repetem:** todo dia, dias úteis, dias da semana ou todo mês. Ao concluir, a próxima volta sozinha para a matriz; **Pular esta vez** passa para a seguinte. Repetição com mais de 3 dias de folga fica em "Repetições agendadas".
- Card **Quando e onde** na tarefa: data, horário, aviso (na hora até 1 dia antes), local, repetição e categoria.
- **Categorias** com cor (Casa, Trabalho, Saúde, Família, Finanças e as suas), como filtro na matriz. Editáveis em Ajustes.
- **Humor em 1 toque** na tela Hoje, com a frase do dia de recompensa, a energia e o humor da semana.
- **Resumo da semana** no domingo às 19h (com aviso) e na tela Semana: tarefas concluídas, 3 do dia, remédios, humor e o dia que mais rendeu. Botão **Resumo com a IA**.
- **Tom do assistente** em Ajustes: direto, encorajador ou bem-humorado. O assistente também vê o humor e cria tarefas com horário, local e repetição.

## 1.6 — 19 de novembro de 2026

- **Compartilhar tarefa por link:** a tarefa agora vai como um link no WhatsApp. Quem tem o app toca no link e a tarefa abre direto nele, sem escolher app.
- Se o link abrir no navegador, a página mostra a tarefa com o botão **Abrir no app** e a opção de copiar como texto.
- O conteúdo da tarefa vai dentro do próprio link. O site só faz a ponte e não guarda nada.
- Correção: o link ia no fim da mensagem e, com a mensagem recolhida em "Ler mais", o WhatsApp abria só um pedaço dele ("link incompleto"). Agora o link vai no começo e ficou mais curto. Se ainda chegar cortado, o app explica o que fazer.

## 1.5 — 19 de novembro de 2026

- **Compartilhar tarefa:** na tela da tarefa, **Compartilhar tarefa** manda pelo WhatsApp (ou outro app) um resumo e um arquivo. Quem recebe toca no arquivo, escolhe **TDAH na Vida Real** e o app mostra a tarefa para adicionar, com prioridade, prazo e passos.
- A tarefa recebida mostra de quem veio.
- Arquivos de perfil ou backup recebidos também abrem direto no app, com a opção de mesclar.

## 1.4 — 19 de novembro de 2026

- **Próximo fixo na barra de notificações:** uma notificação sem som com o próximo remédio e o passo atual das 3 do dia, com os botões **Tomei** e **Passo feito**. Some quando não há nada pendente.
- Água atrasada mais de 1 hora sai da frente; remédio fica até ser marcado.
- A notificação fixa tem prioridade alta e é renovada ao sair do app, para ficar no topo da lista. Se for tirada da tela ou tocada, volta ao abrir o app.
- Ajustes › Barra de notificações para ligar, desligar e incluir ou não as 3 do dia.
- Correção: eventos de dia inteiro de amanhã (feriados, reservas) apareciam na agenda de hoje. Feriado repetido de duas agendas agora aparece uma vez só.
- Ajustes › **Sobre o app**, com a versão, o aviso de saúde e o link do código.
- O APK pode ser assinado com a chave guardada nos secrets do repositório.

## 1.3 — 19 de novembro de 2026

- **Prioridades:** matriz de Eisenhower (Faz hoje, Agenda, Rápido ou repassa, Solta). Prazo até amanhã sobe para urgente; o que fica 7 dias na Solta vai para "Talvez um dia".
- **Tarefa em 3 fases:** O quê (pronto quando), Como (passos) e Faz (passos travados, só executar).
- **Nova tarefa com IA:** diz se é grande, fatia em passos de minutos, sugere prioridade e horário para o passo 1. Botões **Fatiar mais fino** e **Travei neste passo**.
- O bloco de foco mostra o passo atual da tarefa e marca quando você termina.
- Sugestão das 3 do dia (uma do Faz hoje, uma da Agenda e uma rápida) e **Puxar da matriz** na tela Hoje.
- O assistente cria e muda tarefas, marca passos, organiza o descarrego e fecha o dia.

## 1.2 — 19 de novembro de 2026

- Interface nova: menu lateral, barra de baixo com o microfone do assistente no meio, cartões e fonte novos.
- Tela própria de Remédios e água, com o próximo horário em destaque.
- Assistente em tela cheia.
- Bloco de foco escuro com anel, pausa, +5 min, estacionar ideia e **sino no fim**, mesmo com a tela apagada; opção de tocar no silencioso e aviso 2 minutos antes.
- Tema claro, escuro ou automático.

## 1.1 — 19 de novembro de 2026

- Backup automático num arquivo do Google Drive e restauração ao reinstalar ou trocar de celular.
- Número de versão real no app.

## 1.0 — 19 de novembro de 2026

- Guia com 100 estratégias, planner sem data e 7 rotinas prontas.
- Remédios e água com horário, botão **Tomei**, novo aviso se não marcar e aviso para levar o remédio quando há compromisso.
- Configuração guiada na primeira abertura.
- Agenda da casa com um calendário do Google compartilhado.
- Assistente de IA com Gemini ou Claude, ditado por voz e nova tentativa quando o modelo está sobrecarregado.
- Exportar e importar backup em JSON.
