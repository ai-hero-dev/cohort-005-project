-- Progress and ratings now belong to the Enrollment they were made under.
-- SQLite cannot add a NOT NULL column to a table that has rows, so both tables
-- are rebuilt, and each existing row is given the Enrollment of its user on the
-- lesson's (or rating's) course.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lesson_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`enrollment_id` integer NOT NULL,
	`status` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_lesson_progress`("id", "user_id", "lesson_id", "enrollment_id", "status", "completed_at") SELECT "lp"."id", "lp"."user_id", "lp"."lesson_id", (SELECT "e"."id" FROM `enrollments` "e" JOIN `modules` "m" ON "m"."course_id" = "e"."course_id" JOIN `lessons` "l" ON "l"."module_id" = "m"."id" WHERE "e"."user_id" = "lp"."user_id" AND "l"."id" = "lp"."lesson_id" ORDER BY "e"."id" LIMIT 1), "lp"."status", "lp"."completed_at" FROM `lesson_progress` "lp";--> statement-breakpoint
DROP TABLE `lesson_progress`;--> statement-breakpoint
ALTER TABLE `__new_lesson_progress` RENAME TO `lesson_progress`;--> statement-breakpoint
CREATE INDEX `lesson_progress_user_lesson_idx` ON `lesson_progress` (`user_id`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `__new_course_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`enrollment_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_course_ratings`("id", "user_id", "course_id", "enrollment_id", "rating", "created_at", "updated_at") SELECT "r"."id", "r"."user_id", "r"."course_id", (SELECT "e"."id" FROM `enrollments` "e" WHERE "e"."user_id" = "r"."user_id" AND "e"."course_id" = "r"."course_id" ORDER BY "e"."id" LIMIT 1), "r"."rating", "r"."created_at", "r"."updated_at" FROM `course_ratings` "r";--> statement-breakpoint
DROP TABLE `course_ratings`;--> statement-breakpoint
ALTER TABLE `__new_course_ratings` RENAME TO `course_ratings`;--> statement-breakpoint
CREATE UNIQUE INDEX `course_ratings_user_course_unique` ON `course_ratings` (`user_id`,`course_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
