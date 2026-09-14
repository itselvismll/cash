# Controle de Gastos — Bot do Telegram

Bot Node.js que recebe mensagens em linguagem livre e grava no Supabase: gastos ("gastei 30 no mcdonalds") vão para `transacoes` com `origem = 'telegram'`, e recebimentos ("recebi 2000") vão para `renda`. A extração é feita por um parser local — sem IA, sem custo. O dashboard do app web atualiza sozinho via Realtime.

Stack: [grammY](https://grammy.dev) + `@supabase/supabase-js`, em long polling (roda em serviço always-on, tipo Railway).

## 1. Criar o bot no BotFather

1. No Telegram, abra [@BotFather](https://t.me/BotFather).
2. Mande `/newbot`.
3. Escolha um nome (ex: `Gastos Elvis & Gabi`) e um username terminado em `bot` (ex: `gastos_elvis_gabi_bot`).
4. O BotFather devolve o token — é o `TELEGRAM_BOT_TOKEN`.

Opcional, para o menu de comandos: mande `/setcommands` ao BotFather, escolha o bot e cole:

```
start - Como usar o bot
meuid - Mostra seu ID do Telegram
```

## 2. Descobrir os IDs do Telegram

Rode o bot (passo 4) e mande `/meuid` para ele — a resposta traz o ID numérico. Faça isso com as duas contas e preencha `TELEGRAM_ID_ELVIS` e `TELEGRAM_ID_GABI`.

Quem não estiver nessas variáveis não consegue lançar nada: o bot responde com o ID e ignora a mensagem.

## 3. Variáveis de ambiente

```bash
cp .env.example .env
```

| Variável | Onde achar |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather (passo 1) |
| `TELEGRAM_ID_ELVIS` | `/meuid` na conta do Elvis |
| `TELEGRAM_ID_GABI` | `/meuid` na conta da Gabi |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` |

> A `service_role` key ignora RLS e **nunca** pode ir para o app web ou para o repositório — ela só vive nas variáveis do serviço onde o bot roda.

O schema do banco está em [`../web/supabase/schema.sql`](../web/supabase/schema.sql); rode-o antes de subir o bot.

## 4. Rodar local

```bash
npm install
npm run dev
```

Mande uma mensagem para o bot no Telegram e confira a linha nova na tabela `transacoes`.

## 5. Deploy no Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** (aponte para a pasta `bot/` se o repositório for um monorepo: **Settings → Root Directory** = `bot`).
2. **Variables:** cadastre as seis variáveis da tabela acima.
3. **Settings → Deploy:**
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. O bot usa long polling, então não precisa de domínio público nem webhook. Só não suba duas instâncias ao mesmo tempo — o Telegram recusa polling duplicado (erro 409).

Mesma receita funciona em Render, Fly.io ou qualquer VPS com `pm2`.

## Gasto ou renda?

A primeira palavra decide. Se a mensagem **começa** com um verbo de recebimento, vira uma linha em `renda`; caso contrário segue o fluxo de gasto.

Aberturas que marcam renda: `recebi`, `recebemos`, `recebeu`, `caiu`, `cairam`, `entrou`, `entraram`, `pagamento`.

Só o começo conta, de propósito: *"gastei 50 no bar que recebi de presente"* continua sendo gasto.

Na renda, o valor usa o mesmo parser dos gastos, a **pessoa** vem do `TELEGRAM_ID` de quem mandou e a **data_recebimento** é a data da mensagem — não precisa informar nada disso.

| Mensagem | Vai para |
| --- | --- |
| `recebi 2000` | renda · R$ 2.000,00 · hoje |
| `caiu o adiantamento 1000` | renda · R$ 1.000,00 · hoje |
| `entrou 3500 do salario` | renda · R$ 3.500,00 · hoje |
| `recebi 2k` | renda · R$ 2.000,00 · hoje |
| `recebi o presente` | nada — pede para reformular com um valor |
| `gastei 30 no mcdonalds` | transacoes · alimentacao |

Resposta de renda: `💰 Renda registrada: R$ 2.000,00 - Elvis (14/09/2026)`

## Como funciona a extração

Parser local em [`src/extract.ts`](src/extract.ts) — sem chamada de API, sem custo, resposta instantânea.

**Valor:** o primeiro número da mensagem. Aceita `30`, `30,50`, `30.50`, `1k` (= 1000) e `2 mil`. Ponto seguido de exatamente 3 dígitos é separador de milhar (`1.500` = 1500); caso contrário é decimal. Sem número na mensagem, o bot pede para reformular e não grava nada.

**Categoria:** palavras-chave buscadas na mensagem em minúsculas e sem acento, respeitando limites de palavra (`gas` não casa com `gasolina`). A busca ignora o trecho do valor, então `gastei 99 de comida` vai para alimentacao e não para transporte (app 99). Vence a palavra-chave mais longa; no empate, a primeira na ordem declarada — é o caso de `bar`, que está em alimentacao e lazer e fica em alimentacao. Nenhuma palavra batendo, a categoria é `outros` e a resposta avisa.

**Descrição:** o trecho após o valor, sem conectores (`gastei 30 no mcdonalds` → `mcdonalds`). Se o valor está no fim, usa a mensagem sem o número (`uber 22,50` → `uber`).

Para ensinar novos estabelecimentos ou gírias, basta acrescentar a palavra na lista `PALAVRAS_CHAVE` do mesmo arquivo.

### Exemplos

| Mensagem | Resultado |
| --- | --- |
| `gastei 30 no mcdonalds` | R$ 30,00 · alimentacao · mcdonalds |
| `uber 22,50` | R$ 22,50 · transporte · uber |
| `1k de aluguel` | R$ 1000,00 · moradia · aluguel |
| `gastei 99 de comida` | R$ 99,00 · alimentacao · comida |
| `gastei 60 numa parada ai` | R$ 60,00 · outros · (categoria não identificada) |
| `bom dia amor` | pede para reformular |

## Comandos

| Comando | Efeito |
| --- | --- |
| `/start` | Mensagem de boas-vindas com exemplos |
| `/meuid` | Mostra seu ID numérico do Telegram |
| qualquer texto | Vira um gasto — ou uma renda, se começar com verbo de recebimento |

## Estrutura

```
src/
  index.ts     handlers do Telegram (grammY)
  extract.ts   parser local: tipo (gasto/renda), valor, categoria, descrição
  db.ts        cliente Supabase + inserts em transacoes e renda
  pessoas.ts   mapa Telegram ID -> elvis/gabi
  env.ts       validação das variáveis de ambiente
  types.ts     categorias, tags e formatação BRL
```
