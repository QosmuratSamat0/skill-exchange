DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'unique_reporter_reported'
			AND conrelid = 'reports'::regclass
	) THEN
		ALTER TABLE reports
			ADD CONSTRAINT unique_reporter_reported UNIQUE (reporter_user_id, reported_user_id);
	END IF;
END $$;
