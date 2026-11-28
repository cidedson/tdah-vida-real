# Tarefa por link

Cria uma tarefa no app a partir do computador. O script transforma o JSON da tarefa num link `https://cidedson.github.io/t/#z…`. No celular com o app, um toque no link abre a tela "Tarefa recebida" com o título, o prazo, o horário e os passos, pronta para entrar na matriz.

É o mesmo link do botão **Compartilhar** da tarefa (`src/sharelink.js`). Nada passa por servidor: os dados vão dentro do próprio link.

## Com o Copilot

O arquivo `.github/copilot-instructions.md` ensina o formato ao Copilot. No VS Code, abra este repositório, use o Copilot no modo agente e peça, por exemplo:

> cria uma tarefa: entregar relatório SPA sexta 14h, com aviso 1 hora antes

Ele monta o JSON, roda o script e devolve o link. Mande o link para você mesmo no WhatsApp e toque nele no celular.

## À mão

```bash
node docs/tarefa-por-link/link-tarefa.mjs docs/tarefa-por-link/exemplo.json
python docs/tarefa-por-link/link_tarefa.py docs/tarefa-por-link/exemplo.json   # sem Node
```

- Aceita uma tarefa, uma lista de tarefas (um link para cada) ou o JSON pela entrada padrão.
- `--de "Nome"` muda quem aparece como remetente na tela "Tarefa recebida" (o padrão é "Copilot").
- O script confere os campos com as mesmas regras do app. Se algo estiver errado, ele diz o quê e não gera o link.
- Os campos estão na tabela de `.github/copilot-instructions.md`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `link-tarefa.mjs` | Gerador em Node 18 ou mais novo, sem dependências |
| `link_tarefa.py` | O mesmo gerador em Python 3.8 ou mais novo, só com a biblioteca padrão |
| `exemplo.json` | Uma tarefa de exemplo |

Ficam em `docs/` de propósito: mudança só nesta pasta não gera APK novo.
