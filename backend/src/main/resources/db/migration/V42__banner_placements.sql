-- Banners per place on the home page: the hero's desktop panel (4:3), the hero's phone panel (16:10) and the offers
-- strip (3:1), each with its own picture and its own on/off switch. image_key (the old single picture) stays as the
-- fallback, so banners made before this keep working.
ALTER TABLE banner_ads
    ADD COLUMN hero_key VARCHAR(300),
    ADD COLUMN phone_key VARCHAR(300),
    ADD COLUMN strip_key VARCHAR(300),
    ADD COLUMN show_in_hero BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN show_in_strip BOOLEAN NOT NULL DEFAULT TRUE;
