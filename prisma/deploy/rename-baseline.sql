-- The baseline migration was renamed from `0_init` to `0000_init`.
--
-- Prisma applies migrations in the byte order of their folder names, and
-- `0001_invites` sorts before `0_init` ('0' < '_'). On an empty database the
-- invitations migration therefore ran first and failed on a "User" table that
-- did not exist yet: the schema could not be rebuilt from scratch, which is
-- exactly what a restore into a new database needs.
--
-- A database that already applied the baseline has it recorded under the old
-- name. This renames the record so `migrate deploy` does not try to create
-- every table a second time. It is safe to run any number of times, and does
-- nothing on a fresh database, which has no migrations table yet.
DO $$
BEGIN
    IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
        UPDATE "_prisma_migrations"
        SET migration_name = '0000_init'
        WHERE migration_name = '0_init';
    END IF;
END $$;
