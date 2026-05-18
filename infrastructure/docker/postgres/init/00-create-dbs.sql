-- This script runs only when the database is created for the first time
CREATE DATABASE users_db;
CREATE DATABASE chat_db;
CREATE DATABASE moderation_db;

-- Note: The user defined in POSTGRES_USER is automatically created by the image.
-- These databases will be owned by that user if the script is executed by it.
