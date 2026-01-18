-- Fix: earlier issue-tracking migration may have backfilled issued_at for legacy rows
-- (issued_by is NULL). That prevents issuing/deducting on paysheet print.
-- We reset those rows to "not issued" so the new issue endpoint can deduct inventory.

UPDATE farmer_free_products
SET issued_at = NULL
WHERE issued_by IS NULL;


