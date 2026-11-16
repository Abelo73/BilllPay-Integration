-- Social handles of a shop (without the @ or the web address). Shown as links on the public shop page.
ALTER TABLE shops
    ADD COLUMN instagram VARCHAR(40),
    ADD COLUMN facebook VARCHAR(80),
    ADD COLUMN telegram VARCHAR(40);
