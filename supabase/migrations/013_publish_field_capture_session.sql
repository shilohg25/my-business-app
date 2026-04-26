-- Publish reviewed mobile field capture sessions into official shift reports.

create or replace function public.fuel_jsonb_numeric(value jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  raw text;
  parsed numeric;
begin
  if value is null then
    return 0;
  end if;

  if jsonb_typeof(value) in ('number', 'string', 'boolean') then
    raw := trim(both '"' from value::text);
  else
    return 0;
  end if;

  if raw is null or raw = '' then
    return 0;
  end if;

  begin
    parsed := raw::numeric;
  exception when others then
    return 0;
  end;

  return coalesce(parsed, 0);
end;
$$;

create or replace function public.fuel_jsonb_text(value jsonb, fallback text default null)
returns text
language plpgsql
immutable
as $$
declare
  raw text;
begin
  if value is null then
    return fallback;
  end if;

  if jsonb_typeof(value) in ('string', 'number', 'boolean') then
    raw := trim(both '"' from value::text);
  else
    return fallback;
  end if;

  raw := nullif(trim(raw), '');
  return coalesce(raw, fallback);
end;
$$;

create or replace function public.fuel_publish_shift_capture_session(capture_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.fuel_shift_capture_sessions%rowtype;
  draft_payload_value jsonb := '{}'::jsonb;
  meter_readings jsonb := '[]'::jsonb;
  cash_count_rows jsonb := '[]'::jsonb;
  expense_rows jsonb := '[]'::jsonb;
  credit_rows jsonb := '[]'::jsonb;
  lubricant_rows jsonb := '[]'::jsonb;
  delivery_rows jsonb := '[]'::jsonb;
  meter_row jsonb;
  cash_row jsonb;
  expense_row jsonb;
  credit_row jsonb;
  lubricant_row jsonb;
  delivery_row jsonb;

  report_id_value uuid;
  profile_name text;
  duty_name_value text;
  report_totals jsonb;
  publish_warnings jsonb := '[]'::jsonb;

  normalized_product text;
  product_id_value uuid;
  pump_id_value uuid;
  pump_label_value text;
  before_value numeric;
  after_value numeric;
  calibration_value numeric;
  liters_out numeric;

  denominator_value numeric;
  quantity_value numeric;
  amount_value numeric;

  expense_category text;
  expense_description text;
  expense_amount numeric;

  credit_company text;
  credit_receipt_number text;
  credit_external_reference text;
  credit_liters numeric;
  credit_amount numeric;

  lubricant_product_id_value uuid;
  lubricant_name text;
  lubricant_quantity numeric;
  lubricant_unit_price numeric;

  delivery_liters numeric;
  delivery_code text;
  delivery_supplier_name text;
  delivery_note text;

  total_meter_liters_out numeric := 0;
  total_cash_count numeric := 0;
  total_expenses numeric := 0;
  total_credit_amount numeric := 0;
  total_lubricant_sales numeric := 0;
  total_fuel_delivery_liters numeric := 0;
  meter_liters_out_by_product jsonb := '{}'::jsonb;

  expected_cash numeric := 0;
  discrepancy_value numeric := 0;
  has_fuel_deliveries_table boolean := false;
  has_audit_logs boolean := false;
  inserted_meter_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.fuel_can_write() then
    raise exception 'Only Owner/Admin can publish final shift reports.';
  end if;

  select * into session_row
  from public.fuel_shift_capture_sessions
  where id = capture_session_id
  for update;

  if session_row.id is null then
    raise exception 'Capture session not found';
  end if;

  if session_row.status = 'published' and session_row.published_shift_report_id is not null then
    return session_row.published_shift_report_id;
  end if;

  if session_row.status <> 'ready_for_review' then
    raise exception 'Only ready-for-review field capture sessions can be published.';
  end if;

  if session_row.published_shift_report_id is not null then
    raise exception 'Capture session already has a published shift report.';
  end if;

  if session_row.station_id is null or session_row.report_date is null or nullif(trim(session_row.shift_label), '') is null then
    raise exception 'Capture session is missing required station/date/shift fields.';
  end if;

  draft_payload_value := coalesce(session_row.draft_payload, '{}'::jsonb);

  meter_readings := coalesce(draft_payload_value->'meter_readings', '[]'::jsonb);
  if jsonb_typeof(meter_readings) <> 'array' then
    raise exception 'draft_payload.meter_readings must be an array';
  end if;
  if jsonb_array_length(meter_readings) = 0 then
    raise exception 'At least one meter reading row is required before publishing.';
  end if;

  cash_count_rows := case when jsonb_typeof(draft_payload_value->'cash_count') = 'array' then draft_payload_value->'cash_count' else '[]'::jsonb end;
  expense_rows := case when jsonb_typeof(draft_payload_value->'expenses') = 'array' then draft_payload_value->'expenses' else '[]'::jsonb end;
  credit_rows := case when jsonb_typeof(draft_payload_value->'credit_receipts') = 'array' then draft_payload_value->'credit_receipts' else '[]'::jsonb end;
  lubricant_rows := case when jsonb_typeof(draft_payload_value->'lubricant_sales') = 'array' then draft_payload_value->'lubricant_sales' else '[]'::jsonb end;
  delivery_rows := case when jsonb_typeof(draft_payload_value->'fuel_deliveries') = 'array' then draft_payload_value->'fuel_deliveries' else '[]'::jsonb end;

  select coalesce(nullif(trim(p.username), ''), nullif(trim(p.email), ''))
  into profile_name
  from public.profiles p
  where p.id = actor_id
  limit 1;

  duty_name_value := coalesce(
    public.fuel_jsonb_text(draft_payload_value->'duty_name', null),
    public.fuel_jsonb_text(draft_payload_value->'cashier_name', null),
    profile_name,
    'Field cashier'
  );

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'fuel_deliveries'
  ) into has_fuel_deliveries_table;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audit_logs'
  ) into has_audit_logs;

  for meter_row in select value from jsonb_array_elements(meter_readings)
  loop
    before_value := coalesce(
      public.fuel_jsonb_numeric(meter_row->'opening_reading'),
      public.fuel_jsonb_numeric(meter_row->'before_reading'),
      0
    );
    after_value := coalesce(
      public.fuel_jsonb_numeric(meter_row->'closing_reading'),
      public.fuel_jsonb_numeric(meter_row->'after_reading'),
      0
    );
    calibration_value := coalesce(public.fuel_jsonb_numeric(meter_row->'calibration_liters'), 0);

    if after_value < before_value then
      raise exception 'Meter row has after_reading lower than before_reading.';
    end if;

    liters_out := after_value - before_value;
    if liters_out < 0 then
      raise exception 'Meter row liters out cannot be negative.';
    end if;

    normalized_product := public.fuel_normalize_product_code(
      coalesce(
        public.fuel_jsonb_text(meter_row->'product_code', null),
        public.fuel_jsonb_text(meter_row->'product', null),
        'OTHER'
      )
    );

    if normalized_product = 'OTHER' then
      raise exception 'Meter row product code is required.';
    end if;

    select id into product_id_value from public.fuel_products where code = normalized_product limit 1;

    pump_label_value := coalesce(
      public.fuel_jsonb_text(meter_row->'pump_label', null),
      public.fuel_jsonb_text(meter_row->'pump_label_snapshot', null),
      normalized_product || ' Meter'
    );

    pump_id_value := nullif(public.fuel_jsonb_text(meter_row->'pump_id', null), '')::uuid;
    if pump_id_value is not null and not exists (select 1 from public.fuel_pumps where id = pump_id_value) then
      pump_id_value := null;
    end if;

    inserted_meter_count := inserted_meter_count + 1;
    total_meter_liters_out := total_meter_liters_out + greatest(0, liters_out - calibration_value);
    meter_liters_out_by_product := jsonb_set(
      meter_liters_out_by_product,
      array[normalized_product],
      to_jsonb(
        coalesce((meter_liters_out_by_product->>normalized_product)::numeric, 0) + greatest(0, liters_out - calibration_value)
      ),
      true
    );
  end loop;

  if inserted_meter_count = 0 then
    raise exception 'At least one valid meter reading row is required before publishing.';
  end if;

  for cash_row in select value from jsonb_array_elements(cash_count_rows)
  loop
    denominator_value := public.fuel_jsonb_numeric(cash_row->'denomination');
    quantity_value := public.fuel_jsonb_numeric(cash_row->'quantity');
    if denominator_value <= 0 and quantity_value <= 0 then
      continue;
    end if;

    amount_value := denominator_value * quantity_value;
    total_cash_count := total_cash_count + amount_value;
  end loop;

  for expense_row in select value from jsonb_array_elements(expense_rows)
  loop
    expense_amount := public.fuel_jsonb_numeric(expense_row->'amount');
    expense_category := public.fuel_jsonb_text(expense_row->'category', null);
    expense_description := public.fuel_jsonb_text(expense_row->'description', null);

    if expense_amount <= 0 and expense_category is null and expense_description is null then
      continue;
    end if;

    total_expenses := total_expenses + greatest(expense_amount, 0);
  end loop;

  for credit_row in select value from jsonb_array_elements(credit_rows)
  loop
    credit_liters := public.fuel_jsonb_numeric(credit_row->'liters');
    credit_amount := public.fuel_jsonb_numeric(credit_row->'amount');
    if credit_liters <= 0 and credit_amount <= 0 then
      continue;
    end if;

    total_credit_amount := total_credit_amount + greatest(credit_amount, 0);
  end loop;

  for lubricant_row in select value from jsonb_array_elements(lubricant_rows)
  loop
    lubricant_quantity := public.fuel_jsonb_numeric(lubricant_row->'quantity');
    if lubricant_quantity <= 0 then
      continue;
    end if;

    lubricant_unit_price := coalesce(
      public.fuel_jsonb_numeric(lubricant_row->'unit_price'),
      public.fuel_jsonb_numeric(lubricant_row->'amount'),
      0
    );

    total_lubricant_sales := total_lubricant_sales + greatest(lubricant_quantity * lubricant_unit_price, 0);
  end loop;

  for delivery_row in select value from jsonb_array_elements(delivery_rows)
  loop
    delivery_liters := coalesce(
      public.fuel_jsonb_numeric(delivery_row->'liters_received'),
      public.fuel_jsonb_numeric(delivery_row->'liters'),
      0
    );

    if delivery_liters <= 0 then
      if public.fuel_jsonb_text(delivery_row->'product_code', null) is not null then
        raise exception 'Fuel delivery liters must be greater than zero.';
      end if;
      continue;
    end if;

    total_fuel_delivery_liters := total_fuel_delivery_liters + delivery_liters;
  end loop;

  if coalesce(public.fuel_jsonb_text(draft_payload_value->'prices'->'DIESEL', null), '') = ''
    and coalesce(public.fuel_jsonb_text(draft_payload_value->'prices'->'SPECIAL', null), '') = ''
    and coalesce(public.fuel_jsonb_text(draft_payload_value->'prices'->'UNLEADED', null), '') = '' then
    publish_warnings := publish_warnings || to_jsonb('Fuel prices unavailable; fuel sales cash not computed.'::text);
  end if;

  expected_cash := total_lubricant_sales - total_credit_amount - total_expenses;
  discrepancy_value := total_cash_count - expected_cash;

  report_totals := jsonb_build_object(
    'prices', coalesce(draft_payload_value->'prices', '{}'::jsonb),
    'fuel_sales_amount', coalesce((session_row.calculated_summary->>'fuelSalesAmount')::numeric, 0),
    'lubricant_sales_amount', coalesce((session_row.calculated_summary->>'lubricantSalesAmount')::numeric, total_lubricant_sales),
    'credit_amount', coalesce((session_row.calculated_summary->>'creditAmount')::numeric, total_credit_amount),
    'expenses_amount', coalesce((session_row.calculated_summary->>'expensesAmount')::numeric, total_expenses),
    'actual_cash_count', coalesce((session_row.calculated_summary->>'actualCashCount')::numeric, total_cash_count),
    'expected_cash_remittance', coalesce((session_row.calculated_summary->>'expectedCashRemittance')::numeric, expected_cash),
    'discrepancy_amount', coalesce((session_row.calculated_summary->>'discrepancyAmount')::numeric, discrepancy_value),
    'warnings', publish_warnings,
    'source_capture_session_id', session_row.id,
    'meter_liters_out_by_product', meter_liters_out_by_product,
    'total_meter_liters_out', total_meter_liters_out,
    'fuel_delivery_liters_total', total_fuel_delivery_liters
  );

  discrepancy_value := coalesce((report_totals->>'discrepancy_amount')::numeric, discrepancy_value);

  insert into public.fuel_shift_reports (
    station_id,
    report_date,
    duty_name,
    cashier_user_id,
    shift_time_label,
    source,
    status,
    submitted_at,
    calculated_totals,
    discrepancy_amount,
    created_by,
    updated_by
  ) values (
    session_row.station_id,
    session_row.report_date,
    duty_name_value,
    session_row.opened_by,
    session_row.shift_label,
    'mobile_submission',
    'submitted',
    now(),
    report_totals,
    discrepancy_value,
    actor_id,
    actor_id
  ) returning id into report_id_value;

  for meter_row in select value from jsonb_array_elements(meter_readings)
  loop
    before_value := coalesce(public.fuel_jsonb_numeric(meter_row->'opening_reading'), public.fuel_jsonb_numeric(meter_row->'before_reading'), 0);
    after_value := coalesce(public.fuel_jsonb_numeric(meter_row->'closing_reading'), public.fuel_jsonb_numeric(meter_row->'after_reading'), 0);
    calibration_value := coalesce(public.fuel_jsonb_numeric(meter_row->'calibration_liters'), 0);
    liters_out := after_value - before_value;

    if after_value < before_value or liters_out < 0 then
      raise exception 'Meter row has invalid before/after reading values.';
    end if;

    normalized_product := public.fuel_normalize_product_code(
      coalesce(public.fuel_jsonb_text(meter_row->'product_code', null), public.fuel_jsonb_text(meter_row->'product', null), 'OTHER')
    );
    if normalized_product = 'OTHER' then
      raise exception 'Meter row product code is required.';
    end if;

    select id into product_id_value from public.fuel_products where code = normalized_product limit 1;

    pump_label_value := coalesce(public.fuel_jsonb_text(meter_row->'pump_label', null), public.fuel_jsonb_text(meter_row->'pump_label_snapshot', null), normalized_product || ' Meter');
    pump_id_value := nullif(public.fuel_jsonb_text(meter_row->'pump_id', null), '')::uuid;
    if pump_id_value is not null and not exists (select 1 from public.fuel_pumps where id = pump_id_value) then
      pump_id_value := null;
    end if;

    insert into public.fuel_meter_readings(
      shift_report_id, pump_id, pump_label_snapshot, product_id, product_code_snapshot, before_reading, after_reading, calibration_liters, source
    ) values (
      report_id_value, pump_id_value, pump_label_value, product_id_value, normalized_product, before_value, after_value, calibration_value, 'mobile_submission'
    );
  end loop;

  for cash_row in select value from jsonb_array_elements(cash_count_rows)
  loop
    denominator_value := public.fuel_jsonb_numeric(cash_row->'denomination');
    quantity_value := public.fuel_jsonb_numeric(cash_row->'quantity');
    if denominator_value <= 0 and quantity_value <= 0 then
      continue;
    end if;

    insert into public.fuel_cash_counts(shift_report_id, denomination, quantity, amount, note)
    values (
      report_id_value,
      denominator_value,
      quantity_value,
      denominator_value * quantity_value,
      public.fuel_jsonb_text(cash_row->'note', null)
    );
  end loop;

  for expense_row in select value from jsonb_array_elements(expense_rows)
  loop
    expense_amount := public.fuel_jsonb_numeric(expense_row->'amount');
    expense_category := public.fuel_jsonb_text(expense_row->'category', null);
    expense_description := public.fuel_jsonb_text(expense_row->'description', null);

    if expense_amount <= 0 and expense_category is null and expense_description is null then
      continue;
    end if;

    insert into public.fuel_expenses(shift_report_id, category, description, amount, receipt_reference)
    values (
      report_id_value,
      expense_category,
      coalesce(expense_description, 'Field expense'),
      greatest(expense_amount, 0),
      public.fuel_jsonb_text(expense_row->'receipt_reference', null)
    );
  end loop;

  for credit_row in select value from jsonb_array_elements(credit_rows)
  loop
    credit_liters := public.fuel_jsonb_numeric(credit_row->'liters');
    credit_amount := public.fuel_jsonb_numeric(credit_row->'amount');
    if credit_liters <= 0 and credit_amount <= 0 then
      continue;
    end if;

    normalized_product := public.fuel_normalize_product_code(
      coalesce(public.fuel_jsonb_text(credit_row->'product_code', null), public.fuel_jsonb_text(credit_row->'product', null), 'OTHER')
    );
    select id into product_id_value from public.fuel_products where code = normalized_product limit 1;

    credit_company := coalesce(
      public.fuel_jsonb_text(credit_row->'company_name', null),
      public.fuel_jsonb_text(credit_row->'customer', null),
      public.fuel_jsonb_text(credit_row->'company', null),
      'Field credit customer'
    );
    credit_receipt_number := public.fuel_jsonb_text(credit_row->'receipt_number', null);
    credit_external_reference := public.fuel_jsonb_text(credit_row->'external_reference', null);

    insert into public.fuel_credit_receipts(
      shift_report_id,
      product_id,
      product_code_snapshot,
      company_name,
      external_reference,
      receipt_number,
      liters,
      amount,
      source
    ) values (
      report_id_value,
      product_id_value,
      normalized_product,
      credit_company,
      credit_external_reference,
      credit_receipt_number,
      greatest(credit_liters, 0),
      greatest(credit_amount, 0),
      'mobile_submission'
    );
  end loop;

  for lubricant_row in select value from jsonb_array_elements(lubricant_rows)
  loop
    lubricant_quantity := public.fuel_jsonb_numeric(lubricant_row->'quantity');
    if lubricant_quantity <= 0 then
      continue;
    end if;

    lubricant_unit_price := coalesce(public.fuel_jsonb_numeric(lubricant_row->'unit_price'), public.fuel_jsonb_numeric(lubricant_row->'amount'), 0);

    lubricant_product_id_value := nullif(public.fuel_jsonb_text(lubricant_row->'lubricant_product_id', null), '')::uuid;
    if lubricant_product_id_value is not null and not exists (select 1 from public.fuel_lubricant_products where id = lubricant_product_id_value) then
      lubricant_product_id_value := null;
    end if;

    lubricant_name := coalesce(
      public.fuel_jsonb_text(lubricant_row->'product_name', null),
      public.fuel_jsonb_text(lubricant_row->'product_name_snapshot', null),
      public.fuel_jsonb_text(lubricant_row->'item_name', null),
      'Field lubricant'
    );

    insert into public.fuel_lubricant_sales(
      shift_report_id,
      lubricant_product_id,
      product_name_snapshot,
      quantity,
      unit_price
    ) values (
      report_id_value,
      lubricant_product_id_value,
      lubricant_name,
      lubricant_quantity,
      lubricant_unit_price
    );
  end loop;

  if has_fuel_deliveries_table then
    for delivery_row in select value from jsonb_array_elements(delivery_rows)
    loop
      delivery_liters := coalesce(public.fuel_jsonb_numeric(delivery_row->'liters_received'), public.fuel_jsonb_numeric(delivery_row->'liters'), 0);
      if delivery_liters <= 0 then
        if public.fuel_jsonb_text(delivery_row->'product_code', null) is not null then
          raise exception 'Fuel delivery liters must be greater than zero.';
        end if;
        continue;
      end if;

      delivery_code := public.fuel_normalize_product_code(coalesce(public.fuel_jsonb_text(delivery_row->'product_code', null), 'OTHER'));
      select id into product_id_value from public.fuel_products where code = delivery_code limit 1;

      delivery_supplier_name := public.fuel_jsonb_text(delivery_row->'supplier_name', null);
      delivery_note := public.fuel_jsonb_text(delivery_row->'notes', null);
      if delivery_supplier_name is not null then
        delivery_note := coalesce(delivery_note || '; ', '') || 'Supplier: ' || delivery_supplier_name;
      end if;

      insert into public.fuel_deliveries(
        station_id,
        product_id,
        product_code_snapshot,
        delivery_date,
        invoice_number,
        delivery_reference,
        liters,
        unit_cost,
        notes,
        created_by
      ) values (
        session_row.station_id,
        product_id_value,
        delivery_code,
        session_row.report_date,
        public.fuel_jsonb_text(delivery_row->'invoice_number', null),
        public.fuel_jsonb_text(delivery_row->'delivery_reference', null),
        delivery_liters,
        nullif(public.fuel_jsonb_text(delivery_row->'unit_cost', null), '')::numeric,
        delivery_note,
        actor_id
      );
    end loop;
  elsif jsonb_array_length(delivery_rows) > 0 then
    publish_warnings := publish_warnings || to_jsonb('fuel_deliveries table unavailable; delivery rows were skipped.'::text);
  end if;

  update public.fuel_shift_capture_sessions
  set
    status = 'published',
    published_shift_report_id = report_id_value,
    updated_at = now()
  where id = session_row.id;

  insert into public.fuel_shift_capture_events(capture_session_id, station_id, actor_id, event_type, event_payload)
  values (
    session_row.id,
    session_row.station_id,
    actor_id,
    'published',
    jsonb_build_object(
      'shift_report_id', report_id_value,
      'report_date', session_row.report_date,
      'shift_label', session_row.shift_label
    )
  );

  if has_audit_logs then
    insert into public.audit_logs(actor_id, actor_role, action_type, entity_type, entity_id, details)
    values (
      actor_id,
      public.fuel_current_role(),
      'field_capture_published',
      'fuel_shift_reports',
      report_id_value,
      jsonb_build_object('capture_session_id', session_row.id, 'source', 'mobile_submission')
    );
  end if;

  return report_id_value;
end;
$$;

grant execute on function public.fuel_jsonb_numeric(jsonb) to authenticated;
grant execute on function public.fuel_jsonb_text(jsonb, text) to authenticated;
grant execute on function public.fuel_publish_shift_capture_session(uuid) to authenticated;

notify pgrst, 'reload schema';
