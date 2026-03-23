-- ============================================================
-- Stage M2: Backfill Product-Location Matrix
-- ============================================================
-- Goal: Ensure every product exists in every location.
-- - Inserts ONLY missing pairs (idempotent — safe to re-run)
-- - New rows default to isActive = false
-- - Existing rows are NOT modified
-- ============================================================

-- ------------------------------------------------------------
-- Step 1: Log row counts before insertion (for auditing)
-- ------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM `Product`)                AS total_products,
  (SELECT COUNT(*) FROM `Location`)               AS total_locations,
  (SELECT COUNT(*) FROM `ProductLocation`)        AS existing_pairs,
  (SELECT COUNT(*) FROM `Product`) *
  (SELECT COUNT(*) FROM `Location`)               AS expected_total_pairs,
  (SELECT COUNT(*) FROM `Product`) *
  (SELECT COUNT(*) FROM `Location`) -
  (SELECT COUNT(*) FROM `ProductLocation`)        AS pairs_to_insert;

-- ------------------------------------------------------------
-- Step 2: Backfill missing product-location pairs
-- ------------------------------------------------------------
-- Uses CROSS JOIN to generate all possible pairs, then filters
-- out existing ones via NOT EXISTS. The unique constraint on
-- (productId, locationId) provides a second safety net.
-- isActive = false: newly backfilled pairs are inactive by
-- default; only explicitly activated pairs become active.
-- ------------------------------------------------------------

INSERT INTO `ProductLocation`
  (`id`, `productId`, `locationId`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  UUID(),
  p.`id`,
  l.`id`,
  false,
  NOW(3),
  NOW(3)
FROM `Product` p
CROSS JOIN `Location` l
WHERE NOT EXISTS (
  SELECT 1
  FROM `ProductLocation` pl
  WHERE pl.`productId`  = p.`id`
    AND pl.`locationId` = l.`id`
);

-- ------------------------------------------------------------
-- Step 3: Post-insertion verification queries
-- ------------------------------------------------------------
-- A. Confirm total pairs = products × locations
SELECT
  (SELECT COUNT(*) FROM `Product`)         AS total_products,
  (SELECT COUNT(*) FROM `Location`)        AS total_locations,
  (SELECT COUNT(*) FROM `ProductLocation`) AS total_pairs,
  (SELECT COUNT(*) FROM `Product`) *
  (SELECT COUNT(*) FROM `Location`)        AS expected_pairs,
  CASE
    WHEN (SELECT COUNT(*) FROM `ProductLocation`) =
         (SELECT COUNT(*) FROM `Product`) *
         (SELECT COUNT(*) FROM `Location`)
    THEN 'PASS'
    ELSE 'FAIL'
  END AS count_check;

-- B. Confirm no duplicate (productId, locationId) pairs
SELECT
  `productId`,
  `locationId`,
  COUNT(*) AS occurrences
FROM `ProductLocation`
GROUP BY `productId`, `locationId`
HAVING COUNT(*) > 1
LIMIT 10;
-- Expected: 0 rows returned

-- C. Confirm previously active mappings are still active
--    (all isActive=true rows must have been pre-existing, not backfilled)
SELECT COUNT(*) AS active_pairs_preserved
FROM `ProductLocation`
WHERE `isActive` = true;
-- This count must match the active count before the migration ran.

-- D. Confirm backfilled rows default to isActive = false
SELECT COUNT(*) AS inactive_backfilled_pairs
FROM `ProductLocation`
WHERE `isActive` = false;
-- This should equal the number of pairs_to_insert logged in Step 1.
