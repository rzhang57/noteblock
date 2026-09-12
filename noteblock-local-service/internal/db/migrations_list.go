package db

import "gorm.io/gorm"

// Migrations apply in slice order; IDs must sort ascending. Never edit one that has shipped.
var Migrations = []Migration{
	{ID: "0001_baseline", Up: baseline},
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
