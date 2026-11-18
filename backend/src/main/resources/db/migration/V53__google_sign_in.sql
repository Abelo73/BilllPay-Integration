-- Sign in with Google: Google's own account id for the person (the email can change, this does not).
ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) UNIQUE;
