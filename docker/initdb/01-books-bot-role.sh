#!/bin/sh
# Run once by the official postgres image, only against a fresh (empty) data
# volume — see docker-entrypoint-initdb.d in its docs. Creates the read-only
# role the bot's DATABASE_URL connects as, so its blast radius is bounded at
# the database level too, not just by what the bot's own code happens to call.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE books_bot LOGIN PASSWORD '$BOOKS_BOT_PASSWORD';
  GRANT USAGE ON SCHEMA public TO books_bot;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO books_bot;

  -- This runs before the migrate service ever creates a table, so the grant
  -- above covers zero tables. Default privileges are scoped to the role that
  -- *creates* an object, not the role that sets the default — naming
  -- POSTGRES_USER here (the same role the migrate service's DATABASE_URL
  -- connects as) is what makes every table migrations create afterward
  -- automatically grant books_bot SELECT, with no second script to keep in
  -- sync as the schema grows.
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
    GRANT SELECT ON TABLES TO books_bot;
EOSQL
