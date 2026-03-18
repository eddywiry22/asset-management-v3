-- Add username field to User table
-- Default existing rows to their id so the NOT NULL + UNIQUE constraint can be applied
ALTER TABLE `User` ADD COLUMN `username` VARCHAR(191) NOT NULL DEFAULT '';

-- Make each existing row's username unique by using its id
UPDATE `User` SET `username` = `id` WHERE `username` = '';

-- Add unique index
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
