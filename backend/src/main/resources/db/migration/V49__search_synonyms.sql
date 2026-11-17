-- Search synonyms: "phone" also finds "mobile" listings. The team edits this table (no deploy needed).
-- The starter list below is a draft: it is reviewed each month by the person who owns the list (decision 5 in docs/PROPOSAL_PROFILES_SOCIAL_SEARCH_IMAGES.md).
CREATE TABLE search_synonyms (
    word     TEXT NOT NULL,   -- what the person types: one word, lower case
    synonym  TEXT NOT NULL,   -- a word that means the same, lower case
    PRIMARY KEY (word, synonym),
    CHECK (word <> synonym AND word = lower(word) AND synonym = lower(synonym))
);

INSERT INTO search_synonyms (word, synonym) VALUES
    ('phone', 'mobile'), ('mobile', 'phone'),
    ('laptop', 'notebook'), ('notebook', 'laptop'),
    ('sofa', 'couch'), ('couch', 'sofa'),
    ('bag', 'purse'), ('purse', 'bag'),
    ('sneakers', 'trainers'), ('trainers', 'sneakers'),
    ('tv', 'television'), ('television', 'tv'),
    ('headphones', 'headset'), ('headset', 'headphones'),
    ('fridge', 'refrigerator'), ('refrigerator', 'fridge');

-- Same rule as before (every word must match, typos allowed), plus: a word also matches its synonyms.
-- STABLE, not IMMUTABLE: it now reads search_synonyms.
CREATE OR REPLACE FUNCTION search_match(pname TEXT, pdesc TEXT, shop TEXT, q TEXT) RETURNS BOOLEAN
    LANGUAGE sql STABLE AS $$
    SELECT COALESCE(bool_and(
        lower(COALESCE(pname, '')) LIKE '%' || w || '%'
        OR lower(COALESCE(pdesc, '')) LIKE '%' || w || '%'
        OR lower(COALESCE(shop, '')) LIKE '%' || w || '%'
        OR (length(w) >= 4 AND word_similarity(w, lower(COALESCE(pname, ''))) > 0.35)
        OR EXISTS (
            SELECT 1 FROM search_synonyms s
            WHERE s.word = w
              AND (lower(COALESCE(pname, '')) LIKE '%' || s.synonym || '%'
                   OR lower(COALESCE(pdesc, '')) LIKE '%' || s.synonym || '%'
                   OR lower(COALESCE(shop, '')) LIKE '%' || s.synonym || '%'))), TRUE)
    FROM unnest(regexp_split_to_array(lower(trim(COALESCE(q, ''))), '\s+')) AS w
    WHERE w <> ''
$$;
