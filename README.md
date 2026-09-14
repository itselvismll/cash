# Controle de Gastos — Elvis & Gabi

Controle de gastos compartilhado do casal: app web para lançar e acompanhar, bot do Telegram para lançar por mensagem, Supabase como banco único.

```
controle-gastos/
├── web/    Next.js (App Router) + Supabase  → deploy na Vercel
│   └── supabase/schema.sql   ← rode isto primeiro
└── bot/    Bot do Telegram (grammY, parser local) → deploy no Railway
```

## Ordem de setup

1. **Banco:** crie um projeto no Supabase e rode [`web/supabase/schema.sql`](web/supabase/schema.sql) no SQL Editor.
2. **App web:** siga [`web/README.md`](web/README.md) — `.env.local`, `npm run dev`, deploy na Vercel.
3. **Bot:** siga [`bot/README.md`](bot/README.md) — token do BotFather, IDs do Telegram, deploy no Railway.

## Como as peças conversam

```
   você no app web  ──┐
                      ├──►  Supabase (transacoes) ──► Realtime ──► /dashboard
   você no Telegram ──┘
        │
        └─► bot (grammY) ─► parser local (extrai valor/categoria) ─► insert
```

Lançamentos feitos pelo bot aparecem no dashboard **sem recarregar a página** — o `/dashboard` mantém uma subscription realtime nas tabelas `transacoes` e `renda`.

## Modelo de dados

| Tabela | Para que serve |
| --- | --- |
| `transacoes` | Todo gasto: valor, categoria, tag (elvis/gabi), descrição, origem (manual/telegram) |
| `renda` | Entradas de dinheiro. Gabi: 1 linha/mês (dia 20). Elvis: 2 linhas/mês (adiantamento ~dia 15 + restante no fim do mês) |
| `metas` | Meta de economia por mês (`mes_referencia` = dia 1º). Padrão: R$ 850 |

O dashboard só conta a renda com `data_recebimento <= hoje`, então o saldo mostra o que já entrou de fato — não a renda projetada do mês.

## Sem autenticação

Não há login: o acesso é pelo link privado da Vercel. Na prática, quem tiver a URL consegue lançar e ver tudo. As policies de RLS liberam a role `anon` justamente por isso. Se um dia quiser fechar, o caminho é Supabase Auth (magic link) + policies por `auth.uid()`.

Chaves: o app web usa a **anon key** (pública, vai para o browser); o bot usa a **service_role key** (secreta, só nas variáveis do Railway).
