-- AlterTable: add description column and rename uploadedBy -> uploadedById with FK
ALTER TABLE `Attachment`
  ADD COLUMN `description` VARCHAR(191) NULL,
  ADD COLUMN `uploadedById` VARCHAR(191) NOT NULL DEFAULT '';

-- Migrate existing data: copy uploadedBy -> uploadedById
UPDATE `Attachment` SET `uploadedById` = `uploadedBy`;

-- Drop old column
ALTER TABLE `Attachment` DROP COLUMN `uploadedBy`;

-- Remove default now that data is migrated
ALTER TABLE `Attachment` ALTER COLUMN `uploadedById` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_uploadedById_fkey`
  FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
