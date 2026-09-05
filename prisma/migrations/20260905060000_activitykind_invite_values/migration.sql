-- Prod was converted from db-push to migrations after the baseline was written,
-- and the baseline was marked applied without running against the existing
-- database. That database's "ActivityKind" enum still lacks the
-- INVITE_CREATED / INVITE_REVOKED labels, so any query mentioning them fails
-- with P2007 (invalid input value for enum "ActivityKind"). IF NOT EXISTS
-- makes this safe everywhere: local dev already has both values.
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'INVITE_CREATED';
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'INVITE_REVOKED';
