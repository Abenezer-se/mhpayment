-- Temporary (initial) passwords: kept ENCRYPTED (AES-256-GCM, key derived from AUTH_SECRET) only until the member
-- changes the password for the first time; the application then sets these columns to NULL.
alter table users add column if not exists initial_password_enc text;
alter table users add column if not exists initial_password_at timestamptz;