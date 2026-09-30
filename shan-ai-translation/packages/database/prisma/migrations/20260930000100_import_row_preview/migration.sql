-- Invalid preview rows may repeat an external id. Row number stays unique.
DROP INDEX IF EXISTS "import_rows_external_id";
