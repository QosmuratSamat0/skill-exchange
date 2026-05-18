-- Add contact_number to user_profiles.
-- This column stores the user's phone / WhatsApp / Telegram handle shown on their public profile.
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS contact_number VARCHAR(100) NOT NULL DEFAULT '';
