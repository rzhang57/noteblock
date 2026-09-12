package db

import (
	"gorm.io/gorm"
	"server/internal/model"
)

// Migrations apply in slice order; IDs must sort ascending. Never edit one that has shipped.
var Migrations = []Migration{
	{ID: "0001_baseline", Up: baseline},
	{ID: "0002_user_ownership", Up: userOwnership},
	{ID: "0003_tombstones", Up: tombstones},
}

// Mirrors what AutoMigrate had already created, so an existing database adopts the ledger untouched.
func baseline(tx *gorm.DB) error {
	stmts := []string{
		"CREATE TABLE IF NOT EXISTS `folders` (`id` uuid,`name` text,`parent_id` uuid,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`),CONSTRAINT `fk_folders_children_folders` FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`))",
		"CREATE TABLE IF NOT EXISTS `notes` (`id` uuid,`title` text,`folder_id` uuid NOT NULL,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`),CONSTRAINT `fk_folders_notes` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`))",
		"CREATE INDEX IF NOT EXISTS `idx_notes_folder_id` ON `notes`(`folder_id`)",
		"CREATE TABLE IF NOT EXISTS `blocks` (`id` uuid,`note_id` uuid NOT NULL,`type` text,`index` integer,`created_at` datetime,`updated_at` datetime,`content` text,PRIMARY KEY (`id`),CONSTRAINT `fk_notes_blocks` FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`))",
		"CREATE INDEX IF NOT EXISTS `idx_blocks_note_id` ON `blocks`(`note_id`)",
	}

	for _, stmt := range stmts {
		if err := tx.Exec(stmt).Error; err != nil {
			return err
		}
	}

	return nil
}

// Nothing reads these columns yet; they exist so adding auth later is not a second migration.
func userOwnership(tx *gorm.DB) error {
	stmts := []string{
		"CREATE TABLE IF NOT EXISTS `users` (`id` uuid,`name` text,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`))",
		"ALTER TABLE `folders` ADD COLUMN `user_id` uuid",
		"ALTER TABLE `notes` ADD COLUMN `user_id` uuid",
		"ALTER TABLE `blocks` ADD COLUMN `user_id` uuid",
		"CREATE INDEX IF NOT EXISTS `idx_folders_user_id` ON `folders`(`user_id`)",
		"CREATE INDEX IF NOT EXISTS `idx_notes_user_id` ON `notes`(`user_id`)",
		"CREATE INDEX IF NOT EXISTS `idx_blocks_user_id` ON `blocks`(`user_id`)",
	}

	for _, stmt := range stmts {
		if err := tx.Exec(stmt).Error; err != nil {
			return err
		}
	}

	if err := tx.Exec(
		"INSERT OR IGNORE INTO `users` (`id`, `name`, `created_at`, `updated_at`) VALUES (?, ?, datetime('now'), datetime('now'))",
		model.LocalUserID, "Local",
	).Error; err != nil {
		return err
	}

	for _, table := range []string{"folders", "notes", "blocks"} {
		if err := tx.Exec(
			"UPDATE `"+table+"` SET `user_id` = ? WHERE `user_id` IS NULL",
			model.LocalUserID,
		).Error; err != nil {
			return err
		}
	}

	return nil
}

// Blocks are excluded: a note carries its whole block set, so a missing block is already a delete.
func tombstones(tx *gorm.DB) error {
	stmts := []string{
		"ALTER TABLE `folders` ADD COLUMN `deleted_at` datetime",
		"ALTER TABLE `notes` ADD COLUMN `deleted_at` datetime",
		"CREATE INDEX IF NOT EXISTS `idx_folders_deleted_at` ON `folders`(`deleted_at`)",
		"CREATE INDEX IF NOT EXISTS `idx_notes_deleted_at` ON `notes`(`deleted_at`)",
	}

	for _, stmt := range stmts {
		if err := tx.Exec(stmt).Error; err != nil {
			return err
		}
	}

	return nil
}
