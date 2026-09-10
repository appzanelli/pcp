begin;
alter table public.pedidos add column if not exists numero_corte text;
alter table public.pedidos_itens add column if not exists grade jsonb not null default '{}'::jsonb;
alter table public.pedidos_etapas add column if not exists costura_externa boolean not null default false;
update public.pedidos_etapas set costura_externa = false where etapa <> 'COSTURA' or costura_externa is null;

-- A importação inteira passa a ser uma única transação. Se itens ou etapas
-- falharem, o pedido também não é gravado pela metade.
create or replace function public.importar_pedido_atomico(
  p_pedido jsonb,
  p_itens jsonb,
  p_etapas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos;
begin
  insert into public.pedidos (
    id_pedido, numero_pedido, data_entrada, cliente, prazo_original, prazo_min,
    prazo_max, data_entrega, qtd_itens, qtd_total, link_pdf, data_importacao,
    usuario, status, ativo, excluido_em, excluido_por, motivo_exclusao
  ) values (
    p_pedido->>'id_pedido', p_pedido->>'numero_pedido', (p_pedido->>'data_entrada')::date,
    p_pedido->>'cliente', p_pedido->>'prazo_original', (p_pedido->>'prazo_min')::integer,
    (p_pedido->>'prazo_max')::integer, (p_pedido->>'data_entrega')::date,
    (p_pedido->>'qtd_itens')::integer, (p_pedido->>'qtd_total')::numeric,
    p_pedido->>'link_pdf', (p_pedido->>'data_importacao')::timestamptz,
    p_pedido->>'usuario', p_pedido->>'status', true, null, null, ''
  )
  on conflict (numero_pedido) do update set
    data_entrada=excluded.data_entrada, cliente=excluded.cliente,
    prazo_original=excluded.prazo_original, prazo_min=excluded.prazo_min,
    prazo_max=excluded.prazo_max, data_entrega=excluded.data_entrega,
    qtd_itens=excluded.qtd_itens, qtd_total=excluded.qtd_total,
    link_pdf=excluded.link_pdf, data_importacao=excluded.data_importacao,
    usuario=excluded.usuario, status=excluded.status, ativo=true,
    excluido_em=null, excluido_por=null, motivo_exclusao=''
  returning * into v_pedido;

  delete from public.pedidos_itens where numero_pedido = v_pedido.numero_pedido;
  insert into public.pedidos_itens
    (id_item, pedido_id, id_pedido, numero_pedido, item, manga, tecido, cor, grade, qtd, ordem_item, observacao)
  select 'ITEM-' || upper(substr(gen_random_uuid()::text, 1, 8)), v_pedido.id,
    v_pedido.id_pedido, v_pedido.numero_pedido, x.item, x.manga, x.tecido,
    x.cor, coalesce(x.grade, '{}'::jsonb), x.qtd, x.ordem_item, x.observacao
  from jsonb_to_recordset(p_itens) as x(
    item text, manga text, tecido text, cor text, grade jsonb, qtd numeric,
    ordem_item integer, observacao text
  );

  if not exists (select 1 from public.pedidos_etapas where numero_pedido = v_pedido.numero_pedido) then
    insert into public.pedidos_etapas
      (id_etapa, pedido_id, id_pedido, numero_pedido, cliente, etapa,
       ordem_etapa, status_etapa, tipo_responsavel, usuario_atualizacao)
    select 'ETP-' || upper(substr(gen_random_uuid()::text, 1, 8)), v_pedido.id,
      v_pedido.id_pedido, v_pedido.numero_pedido, v_pedido.cliente, x.etapa,
      x.ordem_etapa, 'PENDENTE', 'INTERNO', p_pedido->>'usuario'
    from jsonb_to_recordset(p_etapas) as x(etapa text, ordem_etapa integer);
  end if;

  return to_jsonb(v_pedido);
end;
$$;

revoke all on function public.importar_pedido_atomico(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_atomico(jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;

-- Limpeza operacional: executar somente após confirmar projeto e versão publicada.
-- truncate table public.auditoria, public.importacoes, public.anexos,
-- public.pedidos_etapas, public.pedidos_itens, public.pedidos restart identity cascade;
