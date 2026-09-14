-- ============================================================
-- Migration 004 — forma de pagamento, parcelamento e 3 categorias
-- Rode no SQL Editor do Supabase, DEPOIS da 003. É idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- transacoes: colunas novas
--
-- data_competencia é a mudança conceitual desta migration:
-- created_at é QUANDO foi lançado, data_competencia é EM QUE MÊS
-- o valor pesa no orçamento. Numa compra parcelada os dois
-- divergem — as 5 parcelas nascem hoje, mas pesam em 5 meses
-- diferentes. Todo cálculo de "gasto no mês" passa a usar
-- data_competencia; created_at sobra para ordenar por recência.
-- ------------------------------------------------------------
alter table public.transacoes
  add column if not exists forma_pagamento  text,
  add column if not exists data_competencia date,
  add column if not exists compra_grupo_id  uuid,
  add column if not exists parcela_atual    integer,
  add column if not exists parcela_total    integer;

-- ------------------------------------------------------------
-- Migration de dados: registros antigos não têm nem forma de
-- pagamento nem competência. Pix é o default combinado, e a
-- competência de um gasto à vista é o próprio dia do lançamento.
--
-- O fuso é fixado em America/Sao_Paulo, e não um created_at::date
-- cru: created_at é timestamptz, então o cast direto usaria UTC e
-- jogaria um gasto da noite do dia 31 para o mês seguinte — o
-- mesmo cuidado que as views já tomam.
-- ------------------------------------------------------------
update public.transacoes
   set forma_pagamento = 'pix'
 where forma_pagamento is null;

update public.transacoes
   set data_competencia = (created_at at time zone 'America/Sao_Paulo')::date
 where data_competencia is null;

-- Só depois do backfill as colunas viram obrigatórias.
alter table public.transacoes
  alter column forma_pagamento  set default 'pix',
  alter column forma_pagamento  set not null,
  alter column data_competencia set default (now() at time zone 'America/Sao_Paulo')::date,
  alter column data_competencia set not null;

-- ------------------------------------------------------------
-- Constraints
-- ------------------------------------------------------------
alter table public.transacoes
  drop constraint if exists transacoes_forma_pagamento_check;
alter table public.transacoes
  add  constraint transacoes_forma_pagamento_check
  check (forma_pagamento in ('debito','credito','pix'));

-- Parcela só existe em par (atual E total), dentro do intervalo,
-- e sempre com o grupo que liga as parcelas da mesma compra.
alter table public.transacoes
  drop constraint if exists transacoes_parcela_check;
alter table public.transacoes
  add  constraint transacoes_parcela_check
  check (
    (parcela_atual is null and parcela_total is null)
    or (
      parcela_atual is not null and parcela_total is not null
      and parcela_total  >= 1
      and parcela_atual  >= 1
      and parcela_atual  <= parcela_total
      and compra_grupo_id is not null
    )
  );

-- ------------------------------------------------------------
-- 3 categorias novas: educacao, compras, contas.
-- O check inline da 001 é o que rejeitaria os valores novos, e
-- ele precisa ser substituído — não dá para "adicionar" a um
-- check existente.
-- ------------------------------------------------------------
alter table public.transacoes
  drop constraint if exists transacoes_categoria_check;
alter table public.transacoes
  add  constraint transacoes_categoria_check
  check (categoria in (
    'alimentacao','moradia','transporte','lazer','mercado','saude',
    'educacao','compras','contas','outros'));

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index if not exists transacoes_competencia_idx
  on public.transacoes (data_competencia);

create index if not exists transacoes_compra_grupo_idx
  on public.transacoes (compra_grupo_id)
  where compra_grupo_id is not null;

-- ============================================================
-- Views: passam de created_at para data_competencia
--
-- É o que faz uma parcela futura só aparecer no mês em que ela
-- realmente pesa. As colunas de saída não mudam, então o
-- create or replace basta.
-- ============================================================

-- Renda continua por data_recebimento; o gasto passa a competência.
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
    date_trunc('month', data_competencia)::date,
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

-- data_competencia já é `date` no fuso certo: não precisa de
-- conversão de timezone como precisava com created_at.
create or replace view public.gastos_por_dia
with (security_invoker = true) as
select
  data_competencia as dia,
  sum(valor)       as total
from public.transacoes
group by 1
order by 1;

grant select on public.gastos_por_dia to anon, authenticated;

create or replace view public.gastos_categoria_mensais
with (security_invoker = true) as
select
  date_trunc('month', data_competencia)::date as mes,
  categoria,
  sum(valor) as total
from public.transacoes
group by 1, 2
order by 1, 2;

grant select on public.gastos_categoria_mensais to anon, authenticated;
