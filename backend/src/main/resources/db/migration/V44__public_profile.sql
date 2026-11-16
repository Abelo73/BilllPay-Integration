-- A customer's public profile: off until they switch it on. Others see only the first name, picture, bio and area.
ALTER TABLE users
    ADD COLUMN profile_public BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN bio VARCHAR(300),
    ADD COLUMN area VARCHAR(120);
