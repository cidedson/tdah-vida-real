#!/usr/bin/env python3
"""Gera o link de uma tarefa do app TDAH na Vida Real (mesmo formato de src/sharelink.js).

Versão em Python do link-tarefa.mjs, para computador sem Node. Mesmas regras e mesma saída.

Uso:
    python docs/tarefa-por-link/link_tarefa.py tarefa.json
    python docs/tarefa-por-link/link_tarefa.py tarefa.json --de "Copilot"
    cat tarefa.json | python docs/tarefa-por-link/link_tarefa.py

O JSON pode ser uma tarefa, uma lista de tarefas (um link para cada) ou o envelope completo
{"app": "tdah-vida-real", "kind": "tarefa", "tarefa": {...}}. Formato dos campos em
.github/copilot-instructions.md. Só usa a biblioteca padrão (Python 3.8 ou mais novo).
"""
import base64
import datetime
import json
import re
import sys
import zlib

BASE = "https://cidedson.github.io/t/"
ALERTAS = (0, 15, 30, 60, 1440)
CAMPOS = ("title", "what", "imp", "urg", "deadline", "time", "alertMin", "place", "cat", "need", "when", "steps", "rep")
LIMITE = 1800  # acima disso o WhatsApp pode recolher a mensagem em "Ler mais"


def texto(v):
    return "" if v is None else str(v).strip()


def data_valida(s):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s or "")):
        return False
    try:
        datetime.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def inteiro(v):
    """Número inteiro (aceita "10" e 10.0); None se não for."""
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else None


def checar_rep(rep):
    if not isinstance(rep, dict):
        return None
    kind = rep.get("kind")
    if kind == "dia":
        return {"kind": "dia"}
    if kind == "semana":
        dias = sorted({d for d in (inteiro(x) for x in rep.get("days") or []) if d is not None and 0 <= d <= 6})
        return {"kind": "semana", "days": dias} if dias else None
    if kind == "mes":
        dom = inteiro(rep.get("dom"))
        return {"kind": "mes", "dom": dom} if dom is not None and 1 <= dom <= 31 else None
    return None


def checar_tarefa(x, onde):
    """Confere a tarefa com as mesmas regras que o app usa ao aceitar (incomingAccept em src/app.js)."""
    erros, avisos = [], []
    if not isinstance(x, dict):
        return None, [f"{onde}esperava um objeto JSON."], avisos
    for k in x:
        if k not in CAMPOS:
            avisos.append(f'{onde}o campo "{k}" não existe no app e foi ignorado.')

    t = {"title": texto(x.get("title"))}
    if not t["title"]:
        erros.append(f'{onde}"title" é obrigatório.')
    t["what"] = texto(x.get("what"))
    if not t["what"]:
        avisos.append(f'{onde}sem "what", a tarefa entra na fase "O quê" e você completa no celular.')

    imp = x.get("imp")
    if isinstance(imp, bool):
        t["imp"] = imp
    elif imp is not None:
        erros.append(f'{onde}"imp" tem que ser true ou false.')
    else:
        avisos.append(f'{onde}sem "imp", a tarefa cai em "Para classificar" na matriz.')
    urg = x.get("urg")
    if urg is True:
        t["urg"] = True
    elif urg not in (None, False):
        erros.append(f'{onde}"urg" tem que ser true (ou ficar de fora).')

    erro_data = False
    if texto(x.get("deadline")):
        if data_valida(x["deadline"]):
            t["deadline"] = x["deadline"]
        else:
            erro_data = True
            erros.append(f'{onde}"deadline" tem que ser uma data real no formato AAAA-MM-DD.')
    if texto(x.get("time")):
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", texto(x["time"]))
        if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
            erros.append(f'{onde}"time" tem que ser HH:MM (00:00 a 23:59).')
        elif "deadline" not in t and not erro_data:
            erros.append(f'{onde}"time" precisa de "deadline" (a data desse horário).')
        else:
            t["time"] = f"{int(m.group(1)):02d}:{m.group(2)}"
    if x.get("alertMin") is not None:
        a = inteiro(x["alertMin"])
        if a not in ALERTAS:
            erros.append(f'{onde}"alertMin" tem que ser 0, 15, 30, 60 ou 1440.')
        elif "time" not in t:
            avisos.append(f'{onde}"alertMin" sem "time" não tem efeito e foi ignorado.')
        elif a:
            t["alertMin"] = a

    for k in ("place", "cat", "need", "when"):
        if texto(x.get(k)):
            t[k] = texto(x[k])

    steps = x.get("steps")
    if steps is not None:
        if not isinstance(steps, list):
            erros.append(f'{onde}"steps" tem que ser uma lista.')
        else:
            passos = []
            for i, s in enumerate(steps, 1):
                p = {"t": s} if isinstance(s, str) else (s if isinstance(s, dict) else {})
                st = {"t": texto(p.get("t"))}
                if not st["t"]:
                    erros.append(f'{onde}o passo {i} está sem texto ("t").')
                    continue
                if p.get("est") not in (None, ""):
                    est = inteiro(p["est"])
                    if est is None or not 1 <= est <= 600:
                        erros.append(f'{onde}o passo {i} tem "est" inválido (minutos inteiros, de 1 a 600).')
                    else:
                        st["est"] = est
                passos.append(st)
            if passos:
                t["steps"] = passos
    if "steps" not in t:
        avisos.append(f'{onde}sem passos, a tarefa entra na fase "Como" e você fatia no celular.')

    if x.get("rep") is not None:
        rep = checar_rep(x["rep"])
        if not rep:
            erros.append(f'{onde}"rep" inválido. Use {{"kind":"dia"}}, {{"kind":"semana","days":[1,3]}} (0 = domingo) ou {{"kind":"mes","dom":10}}.')
        else:
            t["rep"] = rep
            if "deadline" not in t:
                avisos.append(f'{onde}repetição sem "deadline": ponha em "deadline" a data da primeira vez.')

    if not t["what"]:
        del t["what"]
    return t, erros, avisos


def gerar_link(envelope):
    bruto = json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)  # deflate-raw, igual ao CompressionStream do app
    dados = comp.compress(bruto) + comp.flush()
    return BASE + "#z" + base64.urlsafe_b64encode(dados).decode("ascii").rstrip("=")


def main():
    args = sys.argv[1:]
    de, arquivo, de_na_linha = "Copilot", None, False
    i = 0
    while i < len(args):
        if args[i] == "--de":
            i += 1
            de, de_na_linha = texto(args[i] if i < len(args) else ""), True
        elif args[i] in ("-h", "--help"):
            print('Uso: python link_tarefa.py tarefa.json [--de "Nome"]   (ou mande o JSON pela entrada padrão)')
            return 0
        else:
            arquivo = args[i]
        i += 1

    try:
        bruto = open(arquivo, encoding="utf-8-sig").read() if arquivo else sys.stdin.read().lstrip("\ufeff")
    except OSError as e:
        print(f"Não consegui ler {arquivo}: {e}", file=sys.stderr)
        return 1
    try:
        dados = json.loads(bruto)
    except json.JSONDecodeError as e:
        print(f"JSON inválido: {e}", file=sys.stderr)
        return 1

    if isinstance(dados, dict) and dados.get("app") == "tdah-vida-real" and dados.get("tarefa"):
        if dados.get("de") and not de_na_linha:
            de = texto(dados["de"])
        dados = dados["tarefa"]
    lista = dados if isinstance(dados, list) else [dados]
    if not lista:
        print("A lista de tarefas está vazia.", file=sys.stderr)
        return 1

    resultados = [checar_tarefa(x, f"Tarefa {n}: " if len(lista) > 1 else "") for n, x in enumerate(lista, 1)]
    erros = [e for _, es, _ in resultados for e in es]
    for _, _, avs in resultados:
        for a in avs:
            print("Aviso: " + a, file=sys.stderr)
    if erros:
        for e in erros:
            print("Erro: " + e, file=sys.stderr)
        print("Nenhum link gerado. Corrija e rode de novo.", file=sys.stderr)
        return 1

    for n, (t, _, _) in enumerate(resultados):
        envelope = {"app": "tdah-vida-real", "kind": "tarefa", "v": 1}
        if de:
            envelope["de"] = de
        envelope["tarefa"] = t
        link = gerar_link(envelope)
        if len(link) > LIMITE:
            print(f'Aviso: o link de "{t["title"]}" tem {len(link)} caracteres. No WhatsApp, toque em "Ler mais" '
                  "antes de tocar no link, ou encurte passos e textos.", file=sys.stderr)
        if len(lista) > 1:
            print(("\n" if n else "") + t["title"])
        print(link)
    return 0


if __name__ == "__main__":
    sys.exit(main())
