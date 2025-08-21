-- Add gender column to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male','female','other'));

-- Optional: enforce role values (skip if not desired)
-- ALTER TABLE users
-- ADD CONSTRAINT IF NOT EXISTS users_role_check CHECK (role IN ('student','professor','employee'));

-- IMPORTANT: Do not run any random enrichment updates for phone/department/year.
-- Remove or skip any statements like:
-- UPDATE users SET phone = COALESCE(phone, ... RANDOM ...), department = COALESCE(department, ...), year = COALESCE(year, ...);


