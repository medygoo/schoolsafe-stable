\set ON_ERROR_STOP on

-- SchoolSafe M1.1 — Mon école native settings RPCs
-- Additive unit: creates new SECURITY DEFINER functions without modifying existing tables.
-- No GRANT on tables; only EXECUTE on functions for schoolsafe_api.

begin;
set local role schoolsafe_owner;

-- ============================================================================
-- 1. READ SCHOOL SETTINGS (identity + brand + contact)
-- ============================================================================
create or replace function api.school_settings_read()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_school app.schools%rowtype;
  v_contact app.school_contacts%rowtype;
begin
  perform iam.require_access('school.manage', null, null, null);

  select * into v_school from app.schools where id = v_school_id;
  if not found then
    raise foreign_key_violation using message = 'School not found';
  end if;

  select * into v_contact from app.school_contacts where school_id = v_school_id;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'name', v_school.name,
      'name_en', v_school.name_en,
      'legal_name', v_school.legal_name,
      'school_type', v_school.school_type,
      'approval_code', v_school.approval_code,
      'currency', v_school.currency,
      'motto', v_school.motto,
      'bank_name', v_school.bank_name,
      'bank_account', v_school.bank_account,
      'tax_id', v_school.tax_id,
      'director_name', v_school.director_name,
      'official_language', v_school.official_language
    ),
    'brand', jsonb_build_object(
      'primary_color', v_school.primary_color,
      'accent_color', v_school.accent_color,
      'document_footer', v_school.document_footer,
      'logo_path', v_school.logo_path
    ),
    'contact', case when v_contact is not null then jsonb_build_object(
      'country', v_contact.country,
      'province', v_contact.province,
      'city', v_contact.city,
      'address', v_contact.address,
      'email', v_contact.email,
      'phone', v_contact.phone,
      'website_url', v_contact.website_url,
      'website_mode', v_contact.website_mode,
      'public_news', v_contact.public_news,
      'public_gallery', v_contact.public_gallery,
      'public_honors', v_contact.public_honors
    ) else '{}'::jsonb end
  );
end;
$schoolsafe$;

grant execute on function api.school_settings_read() to schoolsafe_api;

-- ============================================================================
-- 2. UPDATE SCHOOL SETTINGS (partial update, preserves unset keys)
-- ============================================================================
create or replace function api.school_settings_update(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $schoolsafe$
declare
  v_school_id uuid := iam.current_school_id();
  v_identity jsonb := p_payload -> 'identity';
  v_brand jsonb := p_payload -> 'brand';
  v_contact jsonb := p_payload -> 'contact';
begin
  perform iam.require_access('school.manage', null, null, null);

  -- Verify school exists and belongs to current session
  if not exists (select 1 from app.schools where id = v_school_id) then
    raise foreign_key_violation using message = 'School not found';
  end if;

  -- Update identity fields (only provided keys)
  if v_identity is not null and v_identity <> '{}'::jsonb then
    update app.schools set
      name = coalesce(v_identity ->> 'name', name),
      name_en = coalesce(v_identity ->> 'name_en', name_en),
      legal_name = coalesce(v_identity ->> 'legal_name', legal_name),
      school_type = coalesce(v_identity ->> 'school_type', school_type),
      approval_code = coalesce(v_identity ->> 'approval_code', approval_code),
      currency = coalesce(v_identity ->> 'currency', currency),
      motto = coalesce(v_identity ->> 'motto', motto),
      bank_name = coalesce(v_identity ->> 'bank_name', bank_name),
      bank_account = coalesce(v_identity ->> 'bank_account', bank_account),
      tax_id = coalesce(v_identity ->> 'tax_id', tax_id),
      director_name = coalesce(v_identity ->> 'director_name', director_name),
      official_language = coalesce(v_identity ->> 'official_language', official_language),
      updated_at = now()
    where id = v_school_id;
  end if;

  -- Update brand fields (only provided keys)
  if v_brand is not null and v_brand <> '{}'::jsonb then
    update app.schools set
      primary_color = coalesce(v_brand ->> 'primary_color', primary_color),
      accent_color = coalesce(v_brand ->> 'accent_color', accent_color),
      document_footer = coalesce(v_brand ->> 'document_footer', document_footer),
      logo_path = coalesce(v_brand ->> 'logo_path', logo_path),
      updated_at = now()
    where id = v_school_id;
  end if;

  -- Upsert contact fields (only provided keys)
  if v_contact is not null and v_contact <> '{}'::jsonb then
    insert into app.school_contacts (school_id, country, province, city, address, email, phone, website_url, website_mode, public_news, public_gallery, public_honors)
    values (
      v_school_id,
      v_contact ->> 'country',
      v_contact ->> 'province',
      v_contact ->> 'city',
      v_contact ->> 'address',
      v_contact ->> 'email',
      v_contact ->> 'phone',
      v_contact ->> 'website_url',
      v_contact ->> 'website_mode',
      coalesce((v_contact ->> 'public_news')::boolean, false),
      coalesce((v_contact ->> 'public_gallery')::boolean, false),
      coalesce((v_contact ->> 'public_honors')::boolean, false)
    )
    on conflict (school_id) do update set
      country = coalesce(excluded.country, app.school_contacts.country),
      province = coalesce(excluded.province, app.school_contacts.province),
      city = coalesce(excluded.city, app.school_contacts.city),
      address = coalesce(excluded.address, app.school_contacts.address),
      email = coalesce(excluded.email, app.school_contacts.email),
      phone = coalesce(excluded.phone, app.school_contacts.phone),
      website_url = coalesce(excluded.website_url, app.school_contacts.website_url),
      website_mode = coalesce(excluded.website_mode, app.school_contacts.website_mode),
      public_news = coalesce(excluded.public_news, app.school_contacts.public_news),
      public_gallery = coalesce(excluded.public_gallery, app.school_contacts.public_gallery),
      public_honors = coalesce(excluded.public_honors, app.school_contacts.public_honors),
      updated_at = now();
  end if;

  -- Set setup_completed_at if not already set
  update app.schools set setup_completed_at = coalesce(setup_completed_at, now()) where id = v_school_id;

  -- Return refreshed settings via read function
  return api.school_settings_read();
end;
$schoolsafe$;

grant execute on function api.school_settings_update(jsonb) to schoolsafe_api;

commit;