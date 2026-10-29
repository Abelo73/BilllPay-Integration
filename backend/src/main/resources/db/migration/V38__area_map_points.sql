-- Where each area is on the map, for the order tracking map (seller's area → buyer's area).
-- Starting points are approximate; staff move them in Admin → Areas. NULL = the centre of Sodo.
ALTER TABLE areas ADD COLUMN lat NUMERIC(9, 6);
ALTER TABLE areas ADD COLUMN lng NUMERIC(9, 6);
ALTER TABLE areas ADD CONSTRAINT areas_lat_check CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE areas ADD CONSTRAINT areas_lng_check CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);

UPDATE areas SET lat = 6.856000, lng = 37.757000 WHERE name = 'Arada';
UPDATE areas SET lat = 6.860500, lng = 37.751500 WHERE name = 'Merkato area';
UPDATE areas SET lat = 6.851000, lng = 37.761500 WHERE name = 'Bus station';
UPDATE areas SET lat = 6.834000, lng = 37.748000 WHERE name = 'University area';
UPDATE areas SET lat = 6.855000, lng = 37.757000 WHERE name = 'All of Sodo town';
