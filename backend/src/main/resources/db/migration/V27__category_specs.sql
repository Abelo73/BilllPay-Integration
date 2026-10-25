-- Subcategories (Electronics > Mobile phones), the detail fields each category asks for (brand, model, RAM,
-- storage, chip, bed size, ...), and each product's answers.

alter table categories add column parent_id bigint references categories (id);
create index categories_parent_idx on categories (parent_id);

create table category_fields (
    id           bigserial primary key,
    category_id  bigint      not null references categories (id) on delete cascade,
    field_key    varchar(40) not null,
    label        varchar(80) not null,
    -- SELECT (one from a list), MULTI (several), NUMBER, TEXT, YES_NO
    type         varchar(16) not null,
    unit         varchar(16),
    -- SELECT/MULTI: ["64 GB", "128 GB"]; with depends_on: {"Samsung": ["Galaxy A15", ...], "Apple": [...]}
    options      jsonb,
    depends_on   varchar(40),
    allow_other  boolean     not null default false,
    required     boolean     not null default false,
    filterable   boolean     not null default false,
    position     int         not null default 0,
    active       boolean     not null default true,
    help         varchar(200),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (category_id, field_key)
);

-- {"brand": "Samsung", "ram": "8 GB", "features": ["5G", "Dual SIM"], "screen": 6.5}
alter table products add column specs jsonb not null default '{}'::jsonb;
create index products_specs_idx on products using gin (specs jsonb_path_ops);

-- Used by the store's product search (HQL calls them with function(...)):
-- specs_match: the product has every filter value ({"brand":"Samsung","features":["5G"]}), uses the GIN index.
create function specs_match(s jsonb, filter text) returns boolean
    language sql immutable as $$ select s @> filter::jsonb $$;

-- specs_has_text: a search word appears in one of the answers ("iPhone 13" finds model "iPhone 13 Pro").
create function specs_has_text(s jsonb, q text) returns boolean
    language sql immutable as $$
        select exists (select 1 from jsonb_each_text(s) e where strpos(lower(e.value), lower(q)) > 0)
    $$;
