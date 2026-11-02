-- "Any table" reservations for restaurants without a floor plan. The exclusion
-- constraint ignores NULL tableId rows, so unassigned requests never clash.
ALTER TABLE "reservations" ALTER COLUMN "tableId" DROP NOT NULL;
