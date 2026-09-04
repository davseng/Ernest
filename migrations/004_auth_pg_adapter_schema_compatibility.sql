-- @auth/pg-adapter returns `id` from its account and session mutations.
-- Keep the existing natural primary keys and add only the missing surrogate
-- identifiers. PostgreSQL assigns values to any rows that already exist.
ALTER TABLE accounts ADD COLUMN id serial UNIQUE;
ALTER TABLE sessions ADD COLUMN id serial UNIQUE;
