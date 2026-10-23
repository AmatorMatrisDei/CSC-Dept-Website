-- The faculty role: ranked student, reviewer, faculty, admin. The next migration gives it its powers.
-- A new enum value can't be used in the transaction that adds it, so it has a file of its own.

alter type public.app_role add value 'faculty' before 'admin';
