# Como contribuir

Obrigado pelo interesse. O app é feito para quem tem TDAH, então cada mudança passa por uma pergunta: isso deixa o dia mais leve ou adiciona mais uma decisão?

## Antes de começar

- Para ideia ou erro, abra uma [issue](../../issues/new/choose) antes do código. Assim a gente combina o caminho.
- Textos do app em português do Brasil, curtos e com verbo de ação ("Tomei", "Adicionar", "Pular esta vez").
- Nada de coleta de dados, conta ou servidor. Os dados ficam no celular.

## Rodar no computador

```bash
npm install
npm run build
python3 -m http.server --directory www 8000
```

Abra `http://localhost:8000`. Agenda, notificações e backup no Drive só funcionam no Android; o resto funciona no navegador.

## Mandar a mudança

1. Faça um fork e crie uma branch.
2. Mude o código em `src/` (o `www/app.js` é gerado pelo build).
3. Descreva no pull request o que muda para quem usa, com um print se for algo visual.
4. Se a mudança for grande, adicione uma linha no `CHANGELOG.md`.
