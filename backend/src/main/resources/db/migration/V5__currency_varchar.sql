-- CHAR(3) maps to bpchar, which Hibernate's schema validation rejects for String fields; VARCHAR(3) keeps the length rule.
ALTER TABLE products ALTER COLUMN currency TYPE VARCHAR(3);
ALTER TABLE orders ALTER COLUMN currency TYPE VARCHAR(3);
ALTER TABLE payment_attempts ALTER COLUMN currency TYPE VARCHAR(3);
ALTER TABLE refunds ALTER COLUMN currency TYPE VARCHAR(3);
