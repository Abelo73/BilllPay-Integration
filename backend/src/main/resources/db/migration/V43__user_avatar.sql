-- A customer's profile picture (square, shown round). Stored like shop logos, under avatars/<n>/ so the public media route serves it.
ALTER TABLE users ADD COLUMN avatar_key VARCHAR(300);
