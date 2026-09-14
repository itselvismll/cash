-- ============================================================
-- Controle de Gastos Compartilhado - schema Supabase
-- Rode no SQL Editor do Supabase (roda inteiro, é idempotente).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- transacoes
-- ------------------------------------------------------------
create table if not exists public.transacoes (
  id          uuid primary key default gen_random_uuid(),
  valor       numeric(12,2) not null check (valor > 0),
  categoria   text not null check (categoria in (
                'alimentacao','moradia','transporte','lazer','mercado','saude','outros')),
  tag         text not null check (tag in ('elvis','gabi')),
  descricao   text,
  origem      text not null default 'manual' check (origem in ('manual','telegram')),
  created_at  timestamptz not null default now()
);

create index if not exists transacoes_created_at_idx on public.transacoes (created_at desc);
create index if not exists transacoes_categoria_idx  on public.transacoes (categoria);

-- ------------------------------------------------------------
-- renda
-- Gabi: 1 linha por mes (dia 20, 100% do valor).
-- Elvis: 2 linhas por mes (adiantamento ~dia 15 + restante no fim do mes).
-- ------------------------------------------------------------
create table if not exists public.renda (
  id                uuid primary key default gen_random_uuid(),
  pessoa            text not null check (pessoa in ('elvis','gabi')),
  valor             numeric(12,2) not null check (valor > 0),
  data_recebimento  date not null,
  created_at        timestamptz not null default now()
);

create index if not exists renda_data_idx on public.renda (data_recebimento);

-- ------------------------------------------------------------
-- metas
-- ------------------------------------------------------------
create table if not exists public.metas (
  id              uuid primary key default gen_random_uuid(),
  mes_referencia  date not null unique,  -- sempre o primeiro dia do mes
  valor_meta      numeric(12,2) not null default 850,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- patrimonio + saldos_mensais (ver 002_patrimonio.sql)
-- ============================================================
-- ------------------------------------------------------------
-- patrimonio
-- Guarda o que já estava acumulado ANTES do app existir. O resto
-- do total é calculado a partir dos meses já fechados.
-- ------------------------------------------------------------
create table if not exists public.patrimonio (
  id             uuid primary key default gen_random_uuid(),
  valor_base     numeric(12,2) not null default 0,
  atualizado_em  timestamptz not null default now()
);

alter table public.patrimonio enable row level security;

drop policy if exists "acesso_publico_patrimonio" on public.patrimonio;
create policy "acesso_publico_patrimonio" on public.patrimonio
  for all to anon, authenticated using (true) with check (true);

-- Linha inicial (só na primeira execução).
insert into public.patrimonio (valor_base)
select 6470.74
where not exists (select 1 from public.patrimonio);

-- ------------------------------------------------------------
-- saldos_mensais
-- Um registro por mês com renda, gasto e saldo. A agregação fica
-- no Postgres para o app não precisar baixar o histórico inteiro
-- (o PostgREST devolve no máximo 1000 linhas por requisição).
--
-- O fuso é fixado em America/Sao_Paulo para o corte de mês bater
-- com o que o app calcula no browser — created_at é timestamptz e
-- o date_trunc usaria UTC por padrão, jogando gastos da noite do
-- dia 31 para o mês seguinte.
-- ------------------------------------------------------------
create or replace view public.saldos_mensais
with (security_invoker = true) as
with movimentos as (
  select
    date_trunc('month', data_recebimento)::date as mes,
    valor                                       as renda,
    0::numeric                                  as gasto
  from public.renda
  union all
  select
    date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date,
    0::numeric,
    valor
  from public.transacoes
)
select
  mes,
  sum(renda)              as renda,
  sum(gasto)              as gasto,
  sum(renda) - sum(gasto) as saldo
from movimentos
group by mes
order by mes;

grant select on public.saldos_mensais to anon, authenticated;

-- Realtime para o card reagir a mudanças no valor base.

-- ============================================================
-- investimentos + views de analise (ver 003_investimentos.sql)
-- ============================================================
-- ------------------------------------------------------------
-- investimentos
-- Terceiro tipo de lançamento, separado de gasto e renda.
-- É uma AÇÃO REAL de guardar dinheiro — diferente do saldo do
-- mês (renda - gasto), que é só um indicativo do que sobrou.
-- ------------------------------------------------------------
create table if not exists public.investimentos (
  id          uuid primary key default gen_random_uuid(),
  valor       numeric(12,2) not null check (valor > 0),
  tag         text not null check (tag in ('elvis','gabi')),
  created_at  timestamptz not null default now()
);

create index if not exists investimentos_created_at_idx
  on public.investimentos (created_at desc);

alter table public.investimentos enable row level security;

drop policy if exists "acesso_publico_investimentos" on public.investimentos;
create policy "acesso_publico_investimentos" on public.investimentos
  for all to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- investimentos_mensais
-- Um registro por mês. O "total guardado" soma TODOS os meses,
-- inclusive o corrente: investir é um ato concluído, não uma
-- estimativa que precisa esperar o mês fechar.
-- ------------------------------------------------------------
create or replace view public.investimentos_mensais
with (security_invoker = true) as
select
  date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
  sum(valor) as total
from public.investimentos
group by 1
order by 1;

grant select on public.investimentos_mensais to anon, authenticated;

-- ------------------------------------------------------------
-- gastos_por_dia
-- Base da comparação mês a mês. Ter o dia (e não só o mês)
-- permite comparar o mês corrente com os anteriores ATÉ O DIA
-- EQUIVALENTE — senão seria mês pela metade contra mês inteiro.
-- ------------------------------------------------------------
create or replace view public.gastos_por_dia
with (security_invoker = true) as
select
  (created_at at time zone 'America/Sao_Paulo')::date as dia,
  sum(valor) as total
from public.transacoes
group by 1
order by 1;

grant select on public.gastos_por_dia to anon, authenticated;

-- ------------------------------------------------------------
-- gastos_categoria_mensais
-- Média histórica por categoria, para o alerta de "ritmo acima
-- do normal". Poucas linhas (7 categorias x meses).
-- ------------------------------------------------------------
create or replace view public.gastos_categoria_mensais
with (security_invoker = true) as
select
  date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
  categoria,
  sum(valor) as total
from public.transacoes
group by 1, 2
order by 1, 2;

grant select on public.gastos_categoria_mensais to anon, authenticated;

-- ============================================================
-- RLS
-- O app nao tem login (link privado), entao a role `anon` precisa
-- de acesso total. Se um dia o link vazar, qualquer um com a anon
-- key consegue ler/escrever -- mantenha a URL privada.
-- ============================================================
alter table public.transacoes enable row level security;
alter table public.renda      enable row level security;
alter table public.metas      enable row level security;

drop policy if exists "acesso_publico_transacoes" on public.transacoes;
create policy "acesso_publico_transacoes" on public.transacoes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "acesso_publico_renda" on public.renda;
create policy "acesso_publico_renda" on public.renda
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "acesso_publico_metas" on public.metas;
create policy "acesso_publico_metas" on public.metas
  for all to anon, authenticated using (true) with check (true);

-- ============================================================
-- Realtime (dashboard atualiza sozinho quando o bot insere)
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['transacoes', 'renda', 'patrimonio', 'investimentos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Seed opcional: meta do mes atual
-- ============================================================
insert into public.metas (mes_referencia, valor_meta)
values (date_trunc('month', current_date)::date, 850)
on conflict (mes_referencia) do nothing;

-- Exemplo de cadastro de renda de um mes (ajuste os valores):
-- insert into public.renda (pessoa, valor, data_recebimento) values
--   ('gabi',  3000.00, date_trunc('month', current_date)::date + 19),  -- dia 20
--   ('elvis', 2000.00, date_trunc('month', current_date)::date + 14),  -- adiantamento dia 15
--   ('elvis', 2500.00, (date_trunc('month', current_date) + interval '1 month - 1 day')::date); -- fim do mes
