-- መሠረተ ሕይወት ሰንበት ትምህርት ቤት — initial schema
create extension if not exists pg_trgm;

-- ───────── roles & users ─────────
create table roles (
  id        smallserial primary key,
  code      text unique not null,
  name_am   text not null
);
insert into roles (code, name_am) values
  ('ADMIN',   'ዋና አስተዳዳሪ'),
  ('FINANCE', 'የገንዘብ ያዥ'),
  ('MEMBER',  'አባል');

create table users (
  id                   uuid primary key default gen_random_uuid(),
  role_id              smallint not null references roles(id),
  phone                text not null unique check (phone ~ '^\+251[79][0-9]{8}$'),
  full_name            text not null,
  password_hash        text not null,
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  token_version        integer not null default 0,
  failed_attempts      integer not null default 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  created_by           uuid references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index users_name_trgm on users using gin (full_name gin_trgm_ops);
create index users_phone_trgm on users using gin (phone gin_trgm_ops);

-- ───────── configurable lookups ─────────
create table member_types (
  id serial primary key, name text not null, sort_order integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create unique index member_types_name_uq on member_types (lower(name));

create table service_departments (
  id serial primary key, name text not null, sort_order integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create unique index service_departments_name_uq on service_departments (lower(name));

create table payment_categories (
  id serial primary key, name text not null, sort_order integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create unique index payment_categories_name_uq on payment_categories (lower(name));

-- price history: the rule with the latest effective period <= obligation period applies
create table payment_rules (
  id              serial primary key,
  category_id     integer not null references payment_categories(id),
  amount          numeric(12,2) not null check (amount >= 0),
  effective_year  integer  not null,
  effective_month smallint not null check (effective_month between 1 and 13),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index payment_rules_lookup on payment_rules (category_id, effective_year desc, effective_month desc, id desc);

-- ───────── members ─────────
create sequence member_code_seq;
create table members (
  id               serial primary key,
  member_code      text unique not null default ('MH' || lpad(nextval('member_code_seq')::text, 6, '0')),
  user_id          uuid unique not null references users(id),
  member_type_id   integer not null references member_types(id),
  department_id    integer not null references service_departments(id),
  category_id      integer not null references payment_categories(id),
  registered_at    timestamptz not null,
  registered_year  integer  not null,
  registered_month smallint not null check (registered_month between 1 and 13),
  registered_day   smallint not null check (registered_day between 1 and 30),
  is_active        boolean not null default true,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index members_department on members (department_id);
create index members_category on members (category_id);
create index members_type on members (member_type_id);
create index members_code_trgm on members using gin (member_code gin_trgm_ops);

-- ───────── Ethiopian payment periods & monthly obligations ─────────
create table payment_periods (
  id               serial primary key,
  ethiopian_year   integer  not null,
  ethiopian_month  smallint not null check (ethiopian_month between 1 and 13),
  period_start     timestamptz not null,   -- inclusive
  period_end       timestamptz not null,   -- exclusive (first instant of next period)
  is_billable      boolean not null default true,
  unique (ethiopian_year, ethiopian_month)
);

create table payment_obligations (
  id               bigserial primary key,
  member_id        integer not null references members(id),
  period_id        integer not null references payment_periods(id),
  ethiopian_year   integer  not null,
  ethiopian_month  smallint not null,
  category_id      integer not null references payment_categories(id),  -- category applied when priced
  amount           numeric(12,2) not null check (amount >= 0),          -- price frozen on the obligation
  status           text not null default 'UNPAID' check (status in ('UNPAID','PENDING','PAID','REJECTED')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint obligation_member_period_uq unique (member_id, ethiopian_year, ethiopian_month)
);
create index obligations_period_status on payment_obligations (ethiopian_year, ethiopian_month, status);
create index obligations_member_year on payment_obligations (member_id, ethiopian_year);
create index obligations_category on payment_obligations (category_id);

-- ───────── payment transactions ─────────
create sequence payment_ref_seq;
create table payment_transactions (
  id               bigserial primary key,
  reference_no     text unique not null default ('MH-PAY-' || lpad(nextval('payment_ref_seq')::text, 6, '0')),
  member_id        integer not null references members(id),
  amount           numeric(12,2) not null check (amount >= 0),
  method           text not null check (method in ('CASH','MOBILE_BANKING')),
  source           text not null check (source in ('MEMBER_PROOF','STAFF_RECORDED')),
  status           text not null check (status in ('PENDING','VERIFIED','REJECTED','VOIDED')),
  note             text,
  reject_reason    text,
  created_by       uuid references users(id),
  reviewed_by      uuid references users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz not null,
  ethiopian_year   integer  not null,
  ethiopian_month  smallint not null,
  ethiopian_day    smallint not null
);
create index tx_status_paid on payment_transactions (status, paid_at desc);
create index tx_member on payment_transactions (member_id, created_at desc);
create index tx_method on payment_transactions (method);
create index tx_eth on payment_transactions (ethiopian_year, ethiopian_month);

create table payment_transaction_items (
  id             bigserial primary key,
  transaction_id bigint not null references payment_transactions(id) on delete cascade,
  obligation_id  bigint not null references payment_obligations(id),
  amount         numeric(12,2) not null,
  is_active      boolean not null default true
);
-- an obligation can be covered by at most ONE live transaction → no double payment, enforced by the DB
create unique index tx_items_one_active_per_obligation on payment_transaction_items (obligation_id) where is_active;
create index tx_items_tx on payment_transaction_items (transaction_id);

create table payment_proofs (
  id             bigserial primary key,
  transaction_id bigint not null references payment_transactions(id) on delete cascade,
  storage_key    text not null,
  original_name  text,
  mime_type      text not null,
  size_bytes     integer not null,
  sha256         text not null,
  uploaded_by    uuid references users(id),
  created_at     timestamptz not null default now()
);
create index payment_proofs_tx on payment_proofs (transaction_id);

-- ───────── settings & audit ─────────
create table organization_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id          bigserial primary key,
  user_id     uuid references users(id),
  user_name   text,
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index audit_created on audit_logs (created_at desc);
create index audit_entity on audit_logs (entity_type, entity_id);
