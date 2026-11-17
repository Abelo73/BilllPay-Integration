-- An optional pin on the map for an address. Both numbers or neither. Only the owner sees it.
ALTER TABLE customer_addresses ADD COLUMN latitude NUMERIC(9, 6);
ALTER TABLE customer_addresses ADD COLUMN longitude NUMERIC(9, 6);
ALTER TABLE customer_addresses ADD CONSTRAINT customer_addresses_pin_both
    CHECK ((latitude IS NULL) = (longitude IS NULL));
ALTER TABLE customer_addresses ADD CONSTRAINT customer_addresses_pin_range
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
