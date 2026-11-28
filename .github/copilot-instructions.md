# Instruções para o Copilot

## O repositório

App Android "TDAH na Vida Real", feito com Capacitor. O código fica em `src/` (JavaScript puro, ES modules). O `www/app.js` é gerado por `npm run build` (esbuild): nunca edite esse arquivo à mão. Textos do app em português do Brasil, curtos e com verbo de ação. Sem servidor e sem conta: os dados ficam no celular.

## Criar uma tarefa no celular do Cid

O app abre links no formato `https://cidedson.github.io/t/#z<dados>`. Os dados são o JSON da tarefa comprimido. Quem toca no link vê a tela "Tarefa recebida" e adiciona a tarefa com um toque. Você não precisa de acesso ao celular: basta gerar o link.

Quando o Cid pedir para criar, anotar ou mandar uma tarefa para o app (por exemplo, "cria uma tarefa: entregar relatório SPA sexta 14h"):

1. Monte o JSON da tarefa no formato abaixo. Para datas relativas ("sexta", "amanhã"), confira a data de hoje no terminal (`date`, ou `Get-Date` no PowerShell).
2. Salve o JSON em `tarefa.tmp.json`, na raiz do repositório.
3. Rode `node docs/tarefa-por-link/link-tarefa.mjs tarefa.tmp.json`. Sem Node, use `python docs/tarefa-por-link/link_tarefa.py tarefa.tmp.json`.
4. Apague o `tarefa.tmp.json` e não faça commit de nada.
5. Responda com o link inteiro num bloco de código e, numa linha, a data e o horário que você usou.

Nunca monte o link à mão: a compressão só sai certa pelo script. Se não puder rodar comandos, entregue só o JSON e diga ao Cid para rodar o passo 3.

O Cid manda o link para si mesmo no WhatsApp e toca nele no celular.

### Campos

| Campo | Valor | Para que serve |
| --- | --- | --- |
| `title` | texto, obrigatório | Nome curto da tarefa, começando com verbo |
| `what` | texto | "Pronto quando": como saber que acabou |
| `imp` | `true` ou `false` | Importante? Junto com a urgência, define o lugar na matriz |
| `urg` | `true` | Urgente já. Prazo até amanhã fica urgente sozinho |
| `deadline` | `"AAAA-MM-DD"` | Data ou prazo |
| `time` | `"HH:MM"` | Horário; precisa de `deadline` |
| `alertMin` | `0`, `15`, `30`, `60` ou `1440` | Aviso antes do horário (`1440` = 1 dia antes); precisa de `time` |
| `place` | texto | Local |
| `cat` | texto | Categoria pelo nome. Trabalho é `"Trabalho"` |
| `need` | texto | "Preciso de": material, acesso, alguém |
| `when` | texto | Quando fazer, em texto livre ("amanhã cedo, 35 min") |
| `steps` | lista de `{"t": "texto", "est": minutos}` | Passos da tarefa |
| `rep` | objeto | Repetição: `{"kind":"dia"}`, `{"kind":"semana","days":[1,2,3,4,5]}` (0 = domingo) ou `{"kind":"mes","dom":10}` |

Na matriz: importante e urgente vai para "Faz hoje"; importante sem pressa, "Agenda"; urgente pouco importante, "Rápido ou repassa"; nem um nem outro, "Solta". Sem `imp`, a tarefa cai em "Para classificar".

### Regras

- Preencha sempre `title`, `what`, `imp` e pelo menos 1 passo. Assim a tarefa já chega pronta para fazer.
- Passos com verbo + objeto, de 5 a 25 minutos cada, no máximo 7.
- Tarefa de trabalho leva `"cat": "Trabalho"`.
- Na repetição, `deadline` é a data da primeira vez.
- Mais de uma tarefa: um array no JSON gera um link por tarefa.
- O texto da tarefa vai dentro do link. Não coloque senha nem informação confidencial da empresa.

### Exemplo

```json
{
  "title": "Entregar relatório SPA",
  "what": "PDF enviado ao gestor",
  "imp": true,
  "deadline": "2026-12-04",
  "time": "14:00",
  "alertMin": 60,
  "cat": "Trabalho",
  "steps": [
    { "t": "Atualizar os dados no Databricks", "est": 20 },
    { "t": "Revisar os gráficos do dashboard", "est": 15 },
    { "t": "Exportar o PDF e mandar pro gestor", "est": 10 }
  ]
}
```

Mais detalhes em `docs/tarefa-por-link/README.md`.
