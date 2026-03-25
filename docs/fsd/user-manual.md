# Asset Management System — User Manual

**Version:** 1.0
**Date:** March 25, 2026
**Audience:** Operators, Managers, Administrators

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [User Roles](#2-user-roles)
3. [Core Concepts](#3-core-concepts)
4. [Dashboard](#4-dashboard)
5. [Managing Products](#5-managing-products)
6. [Product Registration](#6-product-registration)
7. [Stock Dashboard](#7-stock-dashboard)
8. [Stock Adjustment](#8-stock-adjustment)
9. [Stock Movement](#9-stock-movement)
10. [Filtering System](#10-filtering-system)
11. [Common Scenarios](#11-common-scenarios)
12. [Important Rules & Limitations](#12-important-rules--limitations)
13. [Tips & Best Practices](#13-tips--best-practices)

---

## 1. Introduction

### Purpose of the System

The Asset Management System is an internal tool designed to help your organization track, manage, and control physical inventory across multiple storage locations. It gives your team a single, reliable place to see what stock you have, where it is, and how it moves — all with a clear audit trail.

Whether you are restocking a warehouse, transferring items between branches, or approving a stock adjustment, this system guides you through every step and ensures that nothing changes without the right people signing off.

### Who Uses It

This system is used by three types of people inside the organization:

- **Operators** — the day-to-day users who create requests, check stock levels, and carry out transfers.
- **Managers** — team leads or supervisors who review and approve requests before they take effect.
- **Administrators** — system owners who set up locations, manage users, and control system-wide settings.

### High-Level Overview

At its core, the system works like this:

1. **Products** are registered in the system and assigned to one or more **locations** (e.g. warehouses, stores, stockrooms).
2. Each product-location pairing must be **activated** before stock can be tracked there.
3. When stock changes — either through a delivery, a correction, or a transfer — a **request** is created and goes through an **approval workflow** before the stock numbers are updated.
4. All stock changes are recorded permanently, so there is always a complete history of what happened and who approved it.

This means stock numbers in the system are always trustworthy, because nothing changes without a proper review.

---

## 2. User Roles

The system uses a role-based access model. Your role determines what you can see and what actions you can take. There are three roles: **Operator**, **Manager**, and **Admin**.

---

### 2.1 Operator

Operators are the primary day-to-day users of the system. They are typically warehouse staff, stock controllers, or branch employees who handle physical inventory.

**An Operator can:**
- View the product list and stock levels
- Create stock adjustment requests (to increase or decrease stock)
- Create stock movement requests (to transfer stock between locations)
- Use filters and saved presets to find information quickly
- View the status of their own requests on the dashboard

**An Operator cannot:**
- Approve or reject requests
- Activate or deactivate product-location pairings
- Create or edit products
- Manage users or system settings

> **In short:** Operators initiate work — they raise the requests that need to be acted on.

---

### 2.2 Manager

Managers oversee the work done by Operators. They review requests to make sure they are correct before stock is actually changed.

**A Manager can:**
- Do everything an Operator can do
- Approve or reject stock adjustment requests
- Approve the origin or destination step in a stock movement
- Activate and deactivate product-location registrations
- View all pending requests across their location(s)

**A Manager cannot:**
- Create or delete products (unless also an Admin)
- Manage user accounts or assign roles
- Change system-wide settings

> **In short:** Managers are the gatekeepers — nothing changes until they approve it.

---

### 2.3 Admin

Administrators have full access to the system. They are responsible for setting it up and keeping it running correctly.

**An Admin can:**
- Do everything a Manager and Operator can do
- Create, edit, and archive products
- Create and manage locations
- Manage user accounts and assign roles
- Configure system-wide settings

**An Admin cannot:**
- Bypass the approval workflow (approvals still follow the same process)

> **In short:** Admins set up and maintain the system, but the same rules apply to everyone when it comes to stock changes.

---

## 3. Core Concepts

Before using the system, it helps to understand a few key ideas. These are the building blocks that everything else is based on.

---

### 3.1 Product

A **Product** is any item your organization tracks — for example, a laptop, a chair, a box of pens, or a piece of machinery. Each product has a name, a category, a vendor, and other identifying details.

Products exist independently of locations. Think of a product as the "what" — it describes the item, not where it is.

---

### 3.2 Location

A **Location** is a physical place where stock is stored — for example, a warehouse in City A, a stockroom on Floor 3, or a retail branch. The system supports multiple locations, and stock is tracked separately at each one.

---

### 3.3 Product Registration (Active / Inactive)

Before you can track stock of a product at a location, that product must be **registered** at that location and set to **Active**.

Think of it like giving a product "permission" to exist at a specific location.

- **Active** — stock can be tracked, adjusted, and moved for this product at this location.
- **Inactive** — the product-location pairing exists in the system but is effectively switched off. No stock operations can be performed.

When a new product is created, the system automatically creates a registration for it at every existing location — but those registrations start as **Inactive** by default. A Manager must activate them before stock work can begin.

---

### 3.4 Stock

**Stock** refers to how many units of a product are at a given location. The system tracks stock in three ways:

| Term | What it means |
|---|---|
| **On-Hand** | The total number of units physically present at the location |
| **Reserved** | Units that are currently being moved out (held for an in-progress transfer) |
| **Available** | On-Hand minus Reserved — the amount free to use |

> **Example:** You have 100 units on-hand. 20 are reserved for an outgoing transfer. Your available stock is 80.

---

### 3.5 Adjustment

An **Adjustment** is a request to change the stock quantity of a product at a single location — either increasing it (e.g. a delivery arrived) or decreasing it (e.g. items were damaged or consumed).

Adjustments go through an approval process. The stock number does **not** change until the adjustment is fully approved and finalized.

---

### 3.6 Movement

A **Movement** is a request to transfer stock from one location to another. It involves two locations:

- The **Origin** — where the stock is coming from
- The **Destination** — where the stock is going to

Both the origin and destination must approve the transfer before it is finalized. When the movement is in progress, the transferred quantity is **reserved** at the origin (so it cannot be used elsewhere) until the transfer is complete.

---

### 3.7 Request Lifecycle (Simplified)

Every stock change — whether an adjustment or a movement — follows a workflow before it takes effect. Here is a simplified view:

```
[Operator creates request]
        ↓
[Manager reviews and approves]
        ↓
[Request is finalized]
        ↓
[Stock numbers are updated]
```

If a request is **rejected** at any point, it is closed and stock is not changed. If the request is **cancelled** before approval, the reserved stock (if any) is released.

> **Key rule:** Stock only changes at the very last step — finalization. Until then, everything is just a pending request.

---

## 4. Dashboard

The Dashboard is the first screen you see when you log in. It gives you a quick overview of work that needs your attention.

---

### 4.1 What the Dashboard Shows

The Dashboard is your personal action center. It surfaces requests and tasks that are **waiting for you specifically** — based on your role and location. It does not show everything in the system, only what is relevant to you right now.

---

### 4.2 What "My Actions" Means

**My Actions** is the main section of the dashboard. It lists all requests that require action from you at this moment.

- If you are an **Operator**, it shows requests you have created that are pending or awaiting updates.
- If you are a **Manager**, it shows requests that are waiting for your approval.

The goal is simple: if something appears in "My Actions," it needs your attention. If it is not there, you have no outstanding tasks.

---

### 4.3 How to Interpret the Cards

Each item in "My Actions" is displayed as a **card**. Here is what each card tells you:

| Card Element | What it means |
|---|---|
| **Request Type** | Whether it is an Adjustment or a Movement |
| **Status** | The current stage of the request (e.g. Pending Approval, Awaiting Destination) |
| **Product & Location** | Which product and location(s) are involved |
| **Quantity** | How many units are affected |
| **Created By / Date** | Who raised it and when |

Cards are color-coded or labeled by urgency where applicable. Older pending items may be highlighted to draw your attention.

---

### 4.4 How the Preview Table Works

Below the action cards, the Dashboard includes a **preview table** — a compact summary of recent activity. This table shows the latest requests across all types, giving you a broader view of what has been happening.

You can click on any row in the preview table to open the full details of that request. From there, you can approve, reject, or review as appropriate for your role.

---

## 5. Managing Products

The Products section is where you view, search, and (if you are an Admin) create products in the system.

---

### 5.1 Viewing the Product List

To view all products:

1. Click **Products** in the main navigation menu.
2. The product list will load, showing all products in the system.

Each row in the list shows:
- Product name
- Category
- Vendor / Supplier
- Status (Active / Inactive)
- Date added

---

### 5.2 Searching for a Product

To find a specific product quickly:

1. Click the **Search** bar at the top of the product list.
2. Type the product name, part of the name, or a keyword.
3. The list will filter in real time as you type.

> **Tip:** You do not need to type the full name. Typing "lap" will return results like "Laptop 14-inch" and "Laptop Charger."

---

### 5.3 Filtering by Category or Vendor

If you want to browse products within a specific group:

1. On the product list page, locate the **Filter** options (above or beside the list).
2. Select a **Category** from the dropdown (e.g. Electronics, Furniture, Stationery).
3. Optionally, also select a **Vendor** to narrow down further.
4. The list updates automatically to show only matching products.

To clear the filters, click the **Reset** button or remove individual filter chips.

---

### 5.4 Creating a Product

> **Note:** Only Admins can create products.

To add a new product to the system:

1. Go to the **Products** page.
2. Click the **+ New Product** button (top right).
3. Fill in the required fields:
   - **Product Name** — a clear, descriptive name
   - **Category** — select the appropriate category
   - **Vendor** — the supplier or manufacturer
   - Any additional fields shown (e.g. SKU, description, unit of measure)
4. Click **Save** to create the product.

---

### 5.5 What Happens After a Product Is Created

When a new product is saved, the system automatically does the following:

- Creates a **registration record** for this product at **every existing location** in the system.
- All of those registrations are set to **Inactive** by default.

This means the product exists in the system, but it is not yet trackable at any location. A Manager must go to the **Product Registration** section and activate the product at the relevant locations before any stock work can begin.

> **Important:** Creating a product does not add any stock. Stock is added separately through a Stock Adjustment after the product is activated at a location.
