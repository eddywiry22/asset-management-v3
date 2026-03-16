# demo-seed-guidelines.md

## Purpose

This document instructs AI development tools how to generate a **deterministic demo seed** for the Asset Management System.

The demo seed must:

- Populate realistic sample data
- Allow the UI to be explored immediately
- Support manual testing and automated tests (Jest)
- Be safe to run repeatedly

The seed must use **upserts or idempotent logic** so that re-running the seed does not create duplicate data.

---

# Seed Scope

The demo seed must create the following entities:

1. Locations
2. Users
3. User roles per location
4. Vendors
5. Categories
6. Units of measurement (if not already created)
7. Goods (products)
8. Stock balances

The seed must NOT create:

- stock adjustments
- stock movement requests
- stock ledger history

Ledger entries must only be generated through workflows.

---

# Deterministic IDs

To make testing reliable, use deterministic identifiers.

Example:

LOCATION\_A LOCATION\_B LOCATION\_C

PRODUCT\_1 PRODUCT\_2

This allows tests to reliably reference seeded data.

---

# Demo Data Specification

## 1. Locations

Create **3 locations**.

Example:

Location A Location B Location C

Each location must have:

- unique code
- unique name

Example codes:

LOC-A LOC-B LOC-C

---

# 2. Users

Each location must have:

- 1 operator
- 1 manager

Total users created:

6 users

Example:

[operatorA@example.com](mailto\:operatorA@example.com) [managerA@example.com](mailto\:managerA@example.com)

[operatorB@example.com](mailto\:operatorB@example.com) [managerB@example.com](mailto\:managerB@example.com)

[operatorC@example.com](mailto\:operatorC@example.com) [managerC@example.com](mailto\:managerC@example.com)

Password can be the same for all demo users.

Example:

password123

Password must be hashed using the system's password hashing utility.

---

# 3. User Location Roles

Assign roles using the UserLocation table.

Each location must have:

Operator role Manager role

Example mapping:

Operator A -> Location A -> OPERATOR Manager A -> Location A -> MANAGER

Repeat for each location.

---

# 4. Vendors

Create **3 vendors**.

Example:

Vendor Alpha Vendor Beta Vendor Gamma

Fields:

id name createdAt updatedAt

---

# 5. Categories

Create **3 product categories**.

Example:

Electronics Accessories Consumables

---

# 6. Units of Measurement

Ensure at least the following exist:

PCS BOX KG

If they already exist, do not duplicate them.

---

# 7. Goods (Products)

Create **9 products**.

Each category should have **3 products**.

Example:

Electronics

Laptop Charger Wireless Mouse Mechanical Keyboard

Accessories

USB Cable HDMI Cable Display Adapter

Consumables

Cleaning Wipes Thermal Paste Compressed Air

Each product must include:

productId name categoryId vendorId uomId createdAt updatedAt

Product IDs should be deterministic.

Example:

PROD-001 PROD-002 ... PROD-009

---

# 8. Stock Balances

Each location must contain **all 9 products**.

Create stock balances using the StockBalance table.

StockBalance fields:

productId locationId onHandQty reservedQty

Reserved quantity must always start at:

0

Example quantities:

Location A

PROD-001 -> 100 PROD-002 -> 50 PROD-003 -> 75 ...

Location B

PROD-001 -> 80 PROD-002 -> 120 PROD-003 -> 60 ...

Location C

PROD-001 -> 200 PROD-002 -> 40 PROD-003 -> 90 ...

Quantities can vary but must be positive.

---

# Seeder Structure

Recommended structure:

prisma/ seed/ demo.seed.ts

Example entry point:

prisma/seed.ts

```
async function main() {
  await seedDemo()
}

main()
```

---

# Idempotency Requirements

The seed must be safe to run repeatedly.

Use:

upsert or findFirst + create

Never blindly insert records.

---

# Stock Integrity Rules

The demo seed must:

- create stock balances
- never create ledger records
- never modify reserved quantities

Reserved quantity must remain 0 for demo data.

---

# Testing Compatibility

The demo seed must be compatible with:

Manual testing Integration testing Jest tests

Test cases should be able to reference seeded data such as:

Location A Operator A PROD-001

---

# Example Testing Use Cases

The seeded data should allow easy testing of:

Stock adjustments Stock movements Reservation logic Approval workflow

Example manual scenario:

Operator A creates a movement request from Location A to Location B for PROD-001 qty 10

Manager A approves Operator B approves Operator B finalizes

Expected result:

Location A stock decreases Location B stock increases

---

# AI Implementation Requirements

AI tools generating the seed must:

1. Follow the Prisma schema exactly
2. Use transactions when creating related data
3. Maintain deterministic references
4. Ensure all relations are valid
5. Avoid duplicate creation

---

# Success Criteria

After running the demo seed:

The system should contain:

3 locations 6 users 3 vendors 3 categories 9 products 27 stock balance rows

(9 products × 3 locations)

Reserved quantities must be zero.

No ledger entries should exist.

