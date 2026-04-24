-- Browser-safe RPC layer for the GitHub Pages build.
-- Critical calculations are repeated in PostgreSQL before any report is committed.

create or replace function public.fuel_calculate_shift_report(payload jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  product_code text;
  price numeric := 0;
  gross_liters numeric := 0;
  credit_liters numeric := 0;
  calibration_liters numeric := 0;
  net_cash_liters numeric := 0;
  fuel_cash_amount numeric := 0;
  credit_amount numeric := 0;
  products jsonb := '[]'::jsonb;
  total_gross_liters numeric := 0;
  total_credit_liters numeric := 0;
  total_calibration_liters numeric := 0;
  total_net_cash_liters numeric := 0;
  total_fuel_cash_sales numeric := 0;
  total_credit_amount numeric := 0;
  total_lubricant_sales numeric := 0;
  total_expenses numeric := 0;
  total_cash_count numeric := 0;
  expected_cash_before_expenses numeric := 0;
  workbook_style_discrepancy numeric := 0;
  operational_net_remittance numeric := 0;
begin
  for product_code in
    select distinct code
    from (
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'prices', '[]'::jsonb)) as x("productCode" text, price numeric)
      union all
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb)) as x("productCode" text)
      union all
      select "productCode" as code from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb)) as x("productCode" text)
    ) codes
    where code is not null and btrim(code) <> ''
  loop
    select coalesce(max(x.price), 0)
      into price
    from jsonb_to_recordset(coalesce(payload->'prices', '[]'::jsonb)) as x("productCode" text, price numeric)
    where x."productCode" = product_code;

    select coalesce(sum(x."afterReading" - x."beforeReading"), 0),
           coalesce(sum(coalesce(x."calibrationLiters", 0)), 0)
      into gross_liters, calibration_liters
    from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb))
      as x("productCode" text, "beforeReading" numeric, "afterReading" numeric, "calibrationLiters" numeric)
    where x."productCode" = product_code;

    select coalesce(sum(x.liters), 0),
           coalesce(sum(coalesce(x.amount, x.liters * price)), 0)
      into credit_liters, credit_amount
    from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb))
      as x("productCode" text, liters numeric, amount numeric)
    where x."productCode" = product_code;

    net_cash_liters := gross_liters - credit_liters - calibration_liters;
    fuel_cash_amount := round(net_cash_liters * price, 2);

    products := products || jsonb_build_array(jsonb_build_object(
      'productCode', product_code,
      'grossLiters', round(gross_liters, 3),
      'creditLiters', round(credit_liters, 3),
      'calibrationLiters', round(calibration_liters, 3),
      'netCashLiters', round(net_cash_liters, 3),
      'price', round(price, 4),
      'fuelCashAmount', fuel_cash_amount,
      'creditAmount', round(credit_amount, 2)
    ));

    total_gross_liters := total_gross_liters + gross_liters;
    total_credit_liters := total_credit_liters + credit_liters;
    total_calibration_liters := total_calibration_liters + calibration_liters;
    total_net_cash_liters := total_net_cash_liters + net_cash_liters;
    total_fuel_cash_sales := total_fuel_cash_sales + fuel_cash_amount;
    total_credit_amount := total_credit_amount + credit_amount;
  end loop;

  select coalesce(sum(x.quantity * x."unitPrice"), 0)
    into total_lubricant_sales
  from jsonb_to_recordset(coalesce(payload->'lubricantSales', '[]'::jsonb))
    as x("productName" text, quantity numeric, "unitPrice" numeric);

  select coalesce(sum(x.amount), 0)
    into total_expenses
  from jsonb_to_recordset(coalesce(payload->'expenses', '[]'::jsonb))
    as x(description text, amount numeric);

  select coalesce(sum(coalesce(x."lineAmount", x.denomination * x.quantity)), 0)
    into total_cash_count
  from jsonb_to_recordset(coalesce(payload->'cashCounts', '[]'::jsonb))
    as x(denomination numeric, quantity numeric, "lineAmount" numeric);

  total_cash_count := total_cash_count + coalesce(nullif(payload->>'coinsAmount', '')::numeric, 0);
  expected_cash_before_expenses := round(total_fuel_cash_sales + total_lubricant_sales, 2);
  workbook_style_discrepancy := round(total_cash_count - expected_cash_before_expenses, 2);
  operational_net_remittance := round(total_cash_count - total_lubricant_sales - total_expenses, 2);

  return jsonb_build_object(
    'products', products,
    'totalGrossLiters', round(total_gross_liters, 3),
    'totalCreditLiters', round(total_credit_liters, 3),
    'totalCalibrationLiters', round(total_calibration_liters, 3),
    'totalNetCashLiters', round(total_net_cash_liters, 3),
    'totalFuelCashSales', round(total_fuel_cash_sales, 2),
    'totalCreditAmount', round(total_credit_amount, 2),
    'totalLubricantSales', round(total_lubricant_sales, 2),
    'totalExpenses', round(total_expenses, 2),
    'totalCashCount', round(total_cash_count, 2),
    'expectedCashBeforeExpenses', expected_cash_before_expenses,
    'workbookStyleDiscrepancy', workbook_style_discrepancy,
    'operationalNetRemittance', operational_net_remittance
  );
end;
$$;

create or replace function public.fuel_commit_shift_report(payload jsonb, import_context jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  batch_id uuid;
  totals jsonb;
  source_value text := coalesce(nullif(payload->>'source', ''), 'web_manual');
  station_value uuid := nullif(payload->>'stationId', '')::uuid;
  shift_template_value uuid := nullif(payload->>'shiftTemplateId', '')::uuid;
  reading record;
  credit record;
  expense record;
  cash record;
  lubricant record;
  product_value uuid;
  pump_value uuid;
  lube_value uuid;
  coins numeric;
begin
  if not public.fuel_can_write() then
    raise exception 'Only Owner and Admin profiles can create or edit fuel reports.';
  end if;

  if coalesce(nullif(payload->>'reportDate', ''), '') = '' then
    raise exception 'reportDate is required.';
  end if;

  if coalesce(nullif(payload->>'dutyName', ''), '') = '' then
    raise exception 'dutyName is required.';
  end if;

  if coalesce(nullif(payload->>'shiftTimeLabel', ''), '') = '' then
    raise exception 'shiftTimeLabel is required.';
  end if;

  totals := public.fuel_calculate_shift_report(payload);

  if import_context is not null then
    insert into public.fuel_import_batches (
      source_file_name,
      parser_version,
      status,
      warnings,
      parsed_payload,
      imported_by
    ) values (
      coalesce(import_context->>'sourceFileName', 'uploaded workbook'),
      coalesce(import_context->>'parserVersion', 'osr-v1-client'),
      'committing',
      coalesce(import_context->'warnings', '[]'::jsonb),
      jsonb_build_object('payload', payload, 'workbookTotals', import_context->'workbookTotals'),
      auth.uid()
    ) returning id into batch_id;
  end if;

  insert into public.fuel_shift_reports (
    station_id,
    shift_template_id,
    report_date,
    duty_name,
    shift_time_label,
    source,
    status,
    calculated_totals,
    discrepancy_amount,
    edit_reason,
    imported_batch_id,
    created_by,
    updated_by
  ) values (
    station_value,
    shift_template_value,
    (payload->>'reportDate')::date,
    payload->>'dutyName',
    payload->>'shiftTimeLabel',
    source_value::public.fuel_entry_source,
    'draft',
    totals,
    coalesce((totals->>'workbookStyleDiscrepancy')::numeric, 0),
    nullif(payload->>'editReason', ''),
    batch_id,
    auth.uid(),
    auth.uid()
  ) returning id into report_id;

  for reading in
    select * from jsonb_to_recordset(coalesce(payload->'meterReadings', '[]'::jsonb))
      as x("pumpId" text, "pumpLabel" text, "productCode" text, "beforeReading" numeric, "afterReading" numeric, "calibrationLiters" numeric)
  loop
    select id into product_value from public.fuel_products where code = reading."productCode" limit 1;
    pump_value := nullif(reading."pumpId", '')::uuid;

    insert into public.fuel_meter_readings (
      shift_report_id,
      pump_id,
      pump_label_snapshot,
      product_id,
      product_code_snapshot,
      before_reading,
      after_reading,
      calibration_liters,
      source
    ) values (
      report_id,
      pump_value,
      coalesce(nullif(reading."pumpLabel", ''), 'Unlabeled pump'),
      product_value,
      coalesce(nullif(reading."productCode", ''), 'UNKNOWN'),
      coalesce(reading."beforeReading", 0),
      coalesce(reading."afterReading", 0),
      coalesce(reading."calibrationLiters", 0),
      source_value::public.fuel_entry_source
    );
  end loop;

  for credit in
    select * from jsonb_to_recordset(coalesce(payload->'creditReceipts', '[]'::jsonb))
      as x("productCode" text, "companyName" text, "receiptNumber" text, liters numeric, amount numeric, "externalCustomerId" text, "externalReference" text, "attachmentPath" text)
  loop
    select id into product_value from public.fuel_products where code = credit."productCode" limit 1;
    insert into public.fuel_credit_receipts (
      shift_report_id,
      product_id,
      product_code_snapshot,
      customer_id,
      company_name,
      external_reference,
      receipt_number,
      liters,
      amount,
      attachment_path,
      source
    ) values (
      report_id,
      product_value,
      coalesce(nullif(credit."productCode", ''), 'UNKNOWN'),
      nullif(credit."externalCustomerId", '')::uuid,
      coalesce(nullif(credit."companyName", ''), 'Unknown credit customer'),
      nullif(credit."externalReference", ''),
      nullif(credit."receiptNumber", ''),
      coalesce(credit.liters, 0),
      credit.amount,
      nullif(credit."attachmentPath", ''),
      source_value::public.fuel_entry_source
    );
  end loop;

  for expense in
    select * from jsonb_to_recordset(coalesce(payload->'expenses', '[]'::jsonb))
      as x(description text, category text, amount numeric)
  loop
    insert into public.fuel_expenses (shift_report_id, category, description, amount)
    values (report_id, nullif(expense.category, ''), coalesce(nullif(expense.description, ''), 'Unlabeled expense'), coalesce(expense.amount, 0));
  end loop;

  for cash in
    select * from jsonb_to_recordset(coalesce(payload->'cashCounts', '[]'::jsonb))
      as x(denomination numeric, quantity numeric, "lineAmount" numeric)
  loop
    insert into public.fuel_cash_counts (shift_report_id, denomination, quantity, amount)
    values (report_id, coalesce(cash.denomination, 0), coalesce(cash.quantity, 0), coalesce(cash."lineAmount", coalesce(cash.denomination, 0) * coalesce(cash.quantity, 0)));
  end loop;

  coins := coalesce(nullif(payload->>'coinsAmount', '')::numeric, 0);
  if coins <> 0 then
    insert into public.fuel_cash_counts (shift_report_id, denomination, quantity, amount, note)
    values (report_id, 1, coins, coins, 'Coins / loose cash');
  end if;

  for lubricant in
    select * from jsonb_to_recordset(coalesce(payload->'lubricantSales', '[]'::jsonb))
      as x("productName" text, quantity numeric, "unitPrice" numeric)
  loop
    select id into lube_value from public.fuel_lubricant_products where lower(name) = lower(lubricant."productName") limit 1;
    insert into public.fuel_lubricant_sales (shift_report_id, lubricant_product_id, product_name_snapshot, quantity, unit_price)
    values (report_id, lube_value, coalesce(nullif(lubricant."productName", ''), 'Unlabeled lubricant'), coalesce(lubricant.quantity, 0), coalesce(lubricant."unitPrice", 0));
  end loop;

  if batch_id is not null then
    update public.fuel_import_batches
    set status = 'committed', committed_report_id = report_id
    where id = batch_id;

    insert into public.audit_logs (actor_id, actor_role, action_type, entity_type, entity_id, details, new_snapshot)
    values (auth.uid(), public.fuel_current_role(), 'import', 'fuel_import_batches', batch_id::text, 'Excel workbook imported into fuel shift report', jsonb_build_object('reportId', report_id, 'context', import_context));
  end if;

  return report_id;
end;
$$;

grant execute on function public.fuel_calculate_shift_report(jsonb) to authenticated;
grant execute on function public.fuel_commit_shift_report(jsonb, jsonb) to authenticated;
