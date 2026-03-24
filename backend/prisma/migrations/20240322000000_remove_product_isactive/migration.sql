-- Remove global isActive flag from Product table.
-- ProductLocation.isActive is now the single source of truth for activation.
-- All product-location pairs are created automatically on product creation (inactive by default).

ALTER TABLE `Product` DROP COLUMN `isActive`;
