-- Identity check, stage 1: a keyed hash (HMAC) of the seller's ID number, never the number itself.
-- A second shop with the same ID is refused while the first is pending or approved (see VerificationService).
ALTER TABLE verifications ADD COLUMN id_number_hash VARCHAR(64);
CREATE INDEX idx_verifications_id_hash ON verifications (id_number_hash) WHERE id_number_hash IS NOT NULL;
