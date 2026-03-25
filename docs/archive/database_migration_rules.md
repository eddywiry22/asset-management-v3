# Database Migration Rules (AI Development Guardrails)

## Purpose

This document defines strict rules for how database schema migrations must be created, modified, and applied during development.

The goal is to prevent:

- Broken migrations
- Duplicate migrations
- Out-of-order schema changes
- Destructive schema updates
- AI-generated migrations that conflict with the existing database

These rules must be followed by both human developers and AI coding agents.

---

# 1. Source of Truth

The **Prisma schema** is the single source of truth for the database structure.

Location:

```
/backend/prisma/schema.prisma
```

Rules:

- All database structure changes must begin in the Prisma schema.
- Migrations must be generated from schema changes.
- Migrations must never be written manually unless absolutely necessary.

AI must **never modify the database directly**.

---

# 2. When Migrations Are Allowed

A new migration may be created only when one of the following occurs:

### Allowed Changes

1. New table is introduced
2. New column is added
3. New index is added
4. New relation is introduced
5. Enum value is added

These changes must be **backwards compatible** whenever possible.

---

# 3. When Migrations Are NOT Allowed

AI must **not generate migrations** when performing the following tasks:

- Implementing business logic
- Adding controllers or services
- Writing tests
- Implementing frontend code
- Fixing validation bugs

If no schema change is required, **no migration should exist**.

---

# 4. Dangerous Schema Changes

The following schema changes are considered **high risk** and must not be performed automatically by AI:

- Dropping tables
- Dropping columns
- Renaming columns
- Renaming tables
- Changing column types
- Changing primary keys

If such a change is required, the AI must:

1. Stop implementation
2. Explain the impact
3. Request explicit developer confirmation

---

# 5. Migration Naming Convention

Migration names must be descriptive and deterministic.

Format:

```
YYYYMMDDHHMM_description
```

Examples:

```
202401010900_init_schema
202401021200_add_goods_table
202401031100_add_stock_balances
202401041300_add_adjustment_module
```

Rules:

- Names must describe the change
- Avoid vague names like "update" or "fix"

---

# 6. Migration Workflow

Correct workflow for schema changes:

1. Update `schema.prisma`
2. Run migration generation
3. Review generated SQL
4. Apply migration locally
5. Run tests

Example command sequence:

```
npx prisma migrate dev --name add_goods_table
```

Then verify:

```
npx prisma generate
```

---

# 7. Local Development Rules

During development:

Allowed:

- Resetting database
- Re-running migrations

Commands:

```
npx prisma migrate reset
```

This will:

1. Drop database
2. Reapply migrations
3. Run seed script

This is safe **only in local environments**.

---

# 8. Seeder Compatibility Rule

Seed scripts must be compatible with the latest schema.

Whenever a migration modifies:

- tables
- required fields
- relations

The seed script must also be updated.

Otherwise seeds will fail.

---

# 9. Migration Order Integrity

Migrations must be executed **in chronological order**.

Rules:

- Never edit an existing migration after it is committed.
- Never reorder migration folders.
- Never delete migrations that have been applied.

If a mistake occurs:

Create a **new corrective migration**.

---

# 10. Production Safety Rules

For production environments:

Use:

```
npx prisma migrate deploy
```

Never run:

```
prisma migrate reset
```

in production.

---

# 11. AI Safety Rules

AI must follow these rules strictly:

AI MUST:

- modify schema.prisma first
- generate migrations via Prisma
- keep migrations small and atomic

AI MUST NOT:

- edit existing migration SQL files
- delete migration folders
- run destructive migrations automatically

---

# 12. Migration Testing

Before accepting a migration:

The following must succeed:

1. Fresh database migration
2. Seeder execution
3. Application startup
4. Automated tests

Commands:

```
docker compose up -d
npx prisma migrate reset
npm run seed
npm run test
```

---

# 13. AI Development Workflow Integration

When implementing new modules:

Correct order:

1. Update Prisma schema
2. Generate migration
3. Update seed data
4. Implement repository layer
5. Implement service logic
6. Implement controllers
7. Write tests

Incorrect order:

- Writing services before schema
- Writing controllers before database models

---

# 14. Red Flags

Stop development if any of the following occurs:

- Migration fails during reset
- Seed script fails
- Duplicate migrations appear
- Schema and migrations become inconsistent

If detected:

1. Stop implementation
2. Diagnose migration issue
3. Fix schema or create corrective migration

---

# 15. AI Instruction Summary

When working on this project:

AI must treat database schema as **critical infrastructure**.

Never modify database structure casually.

Always follow:

```
schema.prisma
→ migration
→ seed update
→ backend implementation
→ frontend implementation
```

Violating this order may break the system.
