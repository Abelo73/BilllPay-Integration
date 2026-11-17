-- When the person confirmed their email with a code. Accounts made before the check have no time here, so they confirm once at their next sign-in.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
