# Controle de Gastos — App Web (Next.js + Supabase)

App de controle de gastos compartilhado do casal. **Sem login** — o acesso é pelo link privado da Vercel.

## Telas

| Rota | O que faz |
| --- | --- |
| `/` | Lançamento rápido: valor, categoria, toggle Elvis/Gabi, descrição opcional |
| `/dashboard` | Renda recebida, gasto, saldo, barra da meta (R$ 850), gastos por categoria e últimos lançamentos — atualiza sozinho via Supabase Realtime |

## 1. Criar o banco no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) inteiro.

Isso cria `transacoes`, `renda` e `metas`, libera as policies de RLS para a role `anon` (necessário porque não há login) e adiciona as tabelas à publicação `supabase_realtime`.

> **Segurança:** como não há autenticação, qualquer pessoa com a URL do app + a anon key consegue ler e gravar. Mantenha o link privado.

## 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha com os valores de **Project Settings → API** no Supabase:

| Variável | Onde achar |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` |

## 3. Rodar local

```bash
npm install
npm run dev
```

Abre em http://localhost:3000.

## 4. Deploy na Vercel

```bash
npm i -g vercel
vercel
```

Ou conecte o repositório em [vercel.com/new](https://vercel.com/new). Em **Settings → Environment Variables**, cadastre as duas variáveis acima (para Production, Preview e Development) e faça o redeploy.

> O build falha de propósito se as variáveis não estiverem definidas (`Faltam NEXT_PUBLIC_SUPABASE_URL / ...`) — é melhor quebrar no deploy do que subir um app que não conecta em nada.

## Cadastrando a renda

A renda não tem tela — cadastre pelo **Table Editor** do Supabase (ou pelo SQL Editor), uma vez por mês:

- **Gabi:** 1 linha, `data_recebimento` = dia 20, com 100% do valor.
- **Elvis:** 2 linhas — adiantamento (~dia 15) e o restante no último dia do mês.

```sql
insert into renda (pessoa, valor, data_recebimento) values
  ('gabi',  3000.00, '2026-09-20'),
  ('elvis', 2000.00, '2026-09-15'),
  ('elvis', 2500.00, '2026-09-30');
```

O dashboard só soma as linhas com `data_recebimento <= hoje`, então o saldo reflete o dinheiro que já entrou de fato.

## Ajustando a meta

A meta padrão é R$ 850. Para mudar em um mês específico, edite a tabela `metas` (`mes_referencia` é sempre o dia 1º do mês):

```sql
insert into metas (mes_referencia, valor_meta) values ('2026-10-01', 1000)
on conflict (mes_referencia) do update set valor_meta = excluded.valor_meta;
```

Se não houver linha para o mês, o app usa R$ 850.

## Estrutura

```
src/
  app/
    layout.tsx           navegação inferior + estilos globais
    page.tsx             / — lançamento rápido
    dashboard/page.tsx   /dashboard
  components/
    LancamentoForm.tsx   formulário (client)
    DashboardClient.tsx  dashboard + subscription realtime
  lib/
    supabase.ts          cliente Supabase (browser, anon key)
    types.ts             categorias, tags e tipos das tabelas
    format.ts            moeda BRL, datas e limites do mês
supabase/schema.sql      DDL + RLS + realtime
```
