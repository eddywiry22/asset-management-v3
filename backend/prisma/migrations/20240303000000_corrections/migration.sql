-- Stage 3 corrections migration
-- 1. Add isAdmin column to User
-- 2. Rename Goods table to Product

ALTER TABLE `User` ADD COLUMN `isAdmin` BOOLEAN NOT NULL DEFAULT FALSE;

RENAME TABLE `Goods` TO `Product`;
