-- Store search, phase 1: every word must match the product name, the description, the shop name, or (typo-tolerant)
-- the name. pg_trgm gives the typo tolerance: "iphon" still finds "iPhone". No new service is needed.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION search_match(pname TEXT, pdesc TEXT, shop TEXT, q TEXT) RETURNS BOOLEAN
    LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(bool_and(
        lower(COALESCE(pname, '')) LIKE '%' || w || '%'
        OR lower(COALESCE(pdesc, '')) LIKE '%' || w || '%'
        OR lower(COALESCE(shop, '')) LIKE '%' || w || '%'
        OR (length(w) >= 4 AND word_similarity(w, lower(COALESCE(pname, ''))) > 0.35)), TRUE)
    FROM unnest(regexp_split_to_array(lower(trim(COALESCE(q, ''))), '\s+')) AS w
    WHERE w <> ''
$$;
