-- The language each person reads the site in (Sodo Gebeya M18); SMS and alerts follow it.
ALTER TABLE users ADD COLUMN language VARCHAR(5) NOT NULL DEFAULT 'en';
ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('en', 'am'));
