-- A seller can settle a problem without staff: refund in full at once, or offer part of the money back,
-- which the buyer accepts (settled) or declines (staff decide as before).
alter table disputes add column seller_offer_amount numeric(12, 2);
alter table disputes add column seller_offer_at timestamptz;
