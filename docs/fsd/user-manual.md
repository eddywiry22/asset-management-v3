# Asset Management System — User Manual

**Version:** 2.0
**Date:** April 15, 2026
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
14. [Activity Timeline & Collaboration](#14-activity-timeline--collaboration)
15. [Stock Opname Report](#15-stock-opname-report)
16. [System Rules, Permissions, and Real-Time Behavior](#16-system-rules-permissions-and-real-time-behavior)

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

---

## 6. Product Registration

### 6.1 What Product Registration Is

**Product Registration** is the record that links a specific product to a specific location. It acts as a switch — when it is Active, stock can be tracked at that location. When it is Inactive, that product is invisible to stock operations at that location.

Every product has one registration per location. These are created automatically when a product is added to the system, but they must be manually activated before use.

---

### 6.2 Why Activation Is Needed

Not every product needs to be stocked at every location. Activation gives Managers control over which products are tracked where. It prevents clutter, avoids accidental stock entries, and ensures that operators only see relevant products for their location.

For example, a product used only at the Head Office warehouse does not need to be active at a regional branch.

---

### 6.3 How to Activate a Product at a Location

> **Note:** Only Managers and Admins can activate or deactivate registrations.

1. Go to **Product Registration** in the main navigation.
2. Use the search bar or filters to find the product you want to activate.
3. Locate the row for the correct **product + location** combination.
4. Click the **Activate** button (or toggle) on that row.
5. Confirm the action when prompted.

The registration status will change to **Active** immediately. The product is now available for stock tracking at that location.

---

### 6.4 How to Deactivate a Product at a Location

1. Go to **Product Registration**.
2. Find the product-location row you wish to deactivate.
3. Click the **Deactivate** button (or toggle).
4. Confirm the action when prompted.

> **Warning:** You cannot deactivate a product-location that is currently involved in an active request (a pending adjustment or in-progress movement). You must wait for those requests to be finalized or cancelled first.

---

### 6.5 Bulk Activate / Deactivate

If you need to activate or deactivate multiple registrations at once:

1. Go to **Product Registration**.
2. Use the checkboxes on the left of each row to select the registrations you want to change.
3. Once you have made your selections, click **Bulk Activate** or **Bulk Deactivate** from the action bar that appears at the top.
4. Confirm the action.

The system will process all selected registrations at once.

> **Note:** The bulk action will skip any registrations that cannot be deactivated (e.g. those tied to active requests) and notify you of any that were skipped.

---

### 6.6 Restrictions Summary

| Situation | Can Activate? | Can Deactivate? |
|---|---|---|
| No active requests | Yes | Yes |
| Pending adjustment exists | Yes | No |
| In-progress movement exists | Yes | No |
| Stock on hand > 0 | Yes | Yes (with caution) |

---

## 7. Stock Dashboard

The Stock Dashboard gives you a real-time view of your inventory across all products and locations. It is the go-to place for checking stock levels and spotting issues.

---

### 7.1 How to Read the Stock Table

The stock table shows one row per **product-location combination**. Each row tells you the current stock situation for that product at that location.

---

### 7.2 Column Meanings

| Column | What it means |
|---|---|
| **Product** | The name of the product |
| **Category** | The product category (e.g. Electronics, Furniture) |
| **Location** | The location where this stock is held |
| **On-Hand** | Total units physically present at the location |
| **Reserved** | Units currently held for an in-progress outgoing movement |
| **Available** | On-Hand minus Reserved — the amount free to use or adjust |
| **Status** | Whether the product-location registration is Active or Inactive |
| **Last Updated** | When the stock was last changed |

> **Tip:** Focus on the **Available** column when deciding whether you can raise a new adjustment or movement — this is what the system checks against.

---

### 7.3 Using Simple Filters

Simple filters are quick, single-click options to narrow down what you see.

1. Above the stock table, look for the **Filter bar**.
2. Click on a filter option — for example, **Location**, **Category**, or **Status**.
3. Select a value from the dropdown (e.g. "Warehouse A" or "Electronics").
4. The table updates instantly to show only matching rows.

You can apply multiple simple filters at the same time. Each active filter appears as a **chip** (a small tag) above the table so you can see at a glance what is currently applied.

To remove a single filter, click the **×** on its chip. To remove all filters at once, click **Reset**.

---

### 7.4 Using Advanced Filters

Advanced filters let you build more specific queries — for example, "show me all products in the Electronics category where available stock is less than 10."

1. Click the **Advanced Filter** button (usually shown as a funnel or "Advanced" link).
2. A panel opens where you can add filter conditions.
3. For each condition, select:
   - **Field** — what to filter on (e.g. Available Stock, Category, Vendor)
   - **Operator** — how to compare (e.g. equals, less than, contains)
   - **Value** — what to match (e.g. 10, "Electronics", "Vendor A")
4. Add as many conditions as needed by clicking **+ Add Condition**.
5. Click **Apply** to run the filter.

> **Tip:** Advanced filters are especially useful for finding low-stock items or checking all products from a specific vendor at once.

---

### 7.5 Saving and Using Filter Presets

If you use the same filter combination regularly, you can save it as a **preset** so you do not have to rebuild it each time.

**To save a filter preset:**

1. Set up your filters (simple or advanced) as desired.
2. Click **Save Filter** or **Save as Preset**.
3. Give the preset a name (e.g. "Low Stock — Warehouse A").
4. Click **Save**.

**To load a saved preset:**

1. Click the **Saved Filters** dropdown or button.
2. Select the preset name from the list.
3. The filters are applied automatically.

**To delete a preset:**

1. Open the **Saved Filters** list.
2. Click the delete icon (trash) next to the preset you want to remove.
3. Confirm the deletion.

---

## 8. Stock Adjustment

A **Stock Adjustment** is used when you need to change the stock quantity of a product at a single location — for example, when new stock arrives, or when items are lost, damaged, or consumed.

---

### 8.1 Creating an Adjustment

> **Who can do this:** Operators, Managers, Admins.

1. Go to **Stock Adjustments** in the navigation menu.
2. Click **+ New Adjustment**.
3. Fill in the required fields:
   - **Product** — search for and select the product
   - **Location** — select the location where the stock change is happening
   - **Adjustment Type** — choose **Increase** (adding stock) or **Decrease** (removing stock)
   - **Quantity** — enter the number of units to add or remove
   - **Reason** — provide a brief reason for the adjustment (e.g. "Delivery received", "Damaged goods")
4. Review your entries carefully.
5. Click **Submit** to send the adjustment for approval.

> **Warning:** Submitting creates a request but does **not** change stock yet. Stock only changes after finalization.

---

### 8.2 Manager Approval

Once submitted, the adjustment moves to a **Pending Approval** state and appears in the Manager's "My Actions" dashboard.

**For Managers:**

1. Open the adjustment request from the dashboard or the Adjustments list.
2. Review the details — product, location, quantity, and reason.
3. Choose one of the following:
   - **Approve** — the request moves to the next step.
   - **Reject** — the request is closed. Stock is not changed. The operator is notified.

> **Tip:** Always check the reason provided and verify it makes sense for the quantity requested before approving.

---

### 8.3 Finalization

After the Manager approves the request, it moves to **Finalization**. This is the step where the stock number actually changes.

- For **Increase** adjustments: the On-Hand quantity increases by the specified amount.
- For **Decrease** adjustments: the On-Hand quantity decreases by the specified amount.

The system records the change permanently in the stock ledger with a timestamp and the name of the approving Manager.

---

### 8.4 What Happens to Stock

Here is a summary of the stock impact at each stage:

| Stage | Stock Changed? |
|---|---|
| Adjustment created (Submitted) | No |
| Pending Manager approval | No |
| Rejected | No — request is closed |
| Approved & Finalized | **Yes — stock is updated** |

> **Warning:** Stock does not change until the adjustment is fully finalized. Do not assume the stock has been updated just because you submitted the request.

---

### 8.5 Adjustment Restrictions

- You **cannot decrease** stock below zero. If available stock is 5, you cannot create a decrease adjustment for more than 5 units.
- You cannot create an adjustment for a product-location that is **Inactive**.
- Only the original submitter or a Manager can cancel a pending adjustment before it is approved.

---

## 9. Stock Movement

A **Stock Movement** is a transfer of stock from one location to another. It involves two locations and requires approval from both sides before the transfer is complete.

---

### 9.1 Creating a Movement (Transfer)

> **Who can do this:** Operators, Managers, Admins.

1. Go to **Stock Movements** in the navigation menu.
2. Click **+ New Movement**.
3. Fill in the required fields:
   - **Product** — search for and select the product to transfer
   - **Origin Location** — where the stock is coming from
   - **Destination Location** — where the stock is going to
   - **Quantity** — how many units to transfer
   - **Notes** — optional reason or reference
4. Review carefully — make sure origin and destination are correct.
5. Click **Submit** to initiate the transfer.

> **Warning:** Once submitted, the requested quantity is immediately **reserved** at the origin. This means those units are locked and cannot be used in other requests until this movement is resolved.

---

### 9.2 Reservation Explained

When a movement is submitted, the system places a **reservation** on the units at the origin location.

- The **On-Hand** quantity at the origin does not change yet.
- The **Reserved** quantity increases by the transfer amount.
- The **Available** quantity decreases accordingly.

This prevents the same stock from being committed to two different requests at the same time.

> **Example:** Origin has 50 on-hand. You submit a movement for 20. Reserved becomes 20, available drops to 30. The 20 units are "spoken for" until the movement is resolved.

---

### 9.3 Origin Approval

Once submitted, the movement goes to the **Origin Manager** for approval.

**For the Origin Manager:**

1. Open the movement request from your dashboard.
2. Verify the product, quantity, and destination.
3. Choose:
   - **Approve** — confirms the stock is available and the transfer can proceed.
   - **Reject** — cancels the movement. The reserved stock is released back to available.

---

### 9.4 Destination Approval

After the Origin Manager approves, the request moves to the **Destination Manager** for their approval.

**For the Destination Manager:**

1. Open the movement request from your dashboard.
2. Verify the incoming product and quantity.
3. Choose:
   - **Approve** — confirms the destination is ready to receive the stock.
   - **Reject** — the movement is cancelled. Reserved stock at origin is released.

---

### 9.5 Finalization and Stock Impact

Once both sides have approved, the movement is **finalized**. At this point:

| Location | Change |
|---|---|
| **Origin — On-Hand** | Decreases by the transfer quantity |
| **Origin — Reserved** | Decreases by the transfer quantity (reservation is cleared) |
| **Destination — On-Hand** | Increases by the transfer quantity |

Both changes are recorded in the stock ledger simultaneously, ensuring there is no period where the stock "disappears" between locations.

---

### 9.6 Movement Lifecycle Summary

```
[Operator submits movement]
        ↓
[Stock reserved at origin]
        ↓
[Origin Manager approves]
        ↓
[Destination Manager approves]
        ↓
[Movement finalized]
        ↓
[Origin stock decreases | Destination stock increases]
```

If the movement is **rejected at any stage**, the reservation is released and no stock changes occur.

---

## 10. Filtering System

The filtering system works consistently across all major pages in the system — the stock dashboard, product list, adjustments, and movements. Understanding how it works will save you significant time.

---

### 10.1 Simple vs Advanced Filters

| | Simple Filters | Advanced Filters |
|---|---|---|
| **Speed** | Very fast — one click | Takes a moment to set up |
| **Use case** | Quick lookups by a single field | Complex queries with multiple conditions |
| **Example** | Show all stock at "Warehouse A" | Show items in "Electronics" where available < 10 |
| **Combinable** | Yes, with each other | Yes, with each other and with simple filters |

You can use simple and advanced filters **together** at the same time. For example: use a simple filter to select a location, then add an advanced filter to show only items with low available stock at that location.

---

### 10.2 Combining Filters

When you apply multiple filters, the system uses **AND logic** — meaning a row must match **all** active filters to appear in the results.

> **Example:** If you filter by Category = "Electronics" AND Location = "Warehouse A", only electronics products at Warehouse A will show. Products in Electronics at other locations will not appear.

---

### 10.3 Filter Chips

Every active filter is shown as a **chip** — a small labeled tag — above the results table. Chips give you a live summary of what is currently applied.

- To remove one filter, click the **×** on its chip.
- The results update instantly when a chip is removed.
- Chips appear for both simple and advanced filters.

---

### 10.4 Reset vs Clear

The system has two related but different actions:

| Action | What it does |
|---|---|
| **Clear** (on a single chip) | Removes only that one filter condition |
| **Reset** | Removes **all** active filters at once and returns the view to its default state |

Use **Reset** when you want to start fresh. Use the **×** on a chip when you only want to remove one specific condition.

---

### 10.5 Saved Filters

Any combination of filters — simple or advanced — can be saved as a **preset** for future use.

**To save:**
1. Apply the filters you want.
2. Click **Save Filter** and give it a name.

**To load:**
1. Click **Saved Filters**.
2. Select a preset from the list.

**To delete:**
1. Open **Saved Filters**.
2. Click the trash icon next to the preset name.

Saved filters are personal — they are saved to your account and are not shared with other users.

---

## 11. Common Scenarios

This section walks through the most common tasks users perform, step by step.

---

### 11.1 "I Want to Increase Stock"

**Scenario:** A delivery has arrived at your warehouse and you need to add units to the system.

1. Go to **Stock Adjustments** → **+ New Adjustment**.
2. Select the **Product** and the **Location** where the delivery arrived.
3. Set **Adjustment Type** to **Increase**.
4. Enter the **Quantity** received.
5. Enter a **Reason** (e.g. "Delivery from Vendor X, PO #12345").
6. Click **Submit**.
7. Notify your Manager that an adjustment is pending their approval.
8. Once the Manager approves and finalizes, the stock level will increase.

> **Reminder:** The stock will not update until the Manager finalizes the request.

---

### 11.2 "I Want to Transfer Items to Another Location"

**Scenario:** You need to send 30 units from Warehouse A to Branch B.

1. Go to **Stock Movements** → **+ New Movement**.
2. Select the **Product** to transfer.
3. Set **Origin Location** to "Warehouse A."
4. Set **Destination Location** to "Branch B."
5. Enter **Quantity** as 30.
6. Add any relevant **Notes**.
7. Click **Submit**.
8. The 30 units are now reserved at Warehouse A.
9. The Manager at Warehouse A will review and approve.
10. The Manager at Branch B will then review and approve.
11. Once both approve, the transfer is finalized — 30 units leave Warehouse A and arrive at Branch B.

---

### 11.3 "I Want to Activate Products at My Location"

**Scenario:** New products have been added to the system and you need to make them available at your location.

1. Go to **Product Registration** in the navigation.
2. Use the **Location** filter to show only registrations for your location.
3. Look for rows with a status of **Inactive**.
4. Click **Activate** on each product you want to enable, or use checkboxes and **Bulk Activate** for multiple products.
5. Confirm the activation.
6. Those products are now active and ready for stock tracking at your location.

---

### 11.4 "I Want to Find Stock Quickly"

**Scenario:** You need to check the available stock of all electronics at Warehouse A.

1. Go to the **Stock Dashboard**.
2. In the filter bar, select **Location** = "Warehouse A."
3. Also select **Category** = "Electronics."
4. The table now shows only electronics at Warehouse A.
5. Check the **Available** column for the current stock.

**To save this for next time:**
6. Click **Save Filter** and name it (e.g. "Electronics — Warehouse A").
7. Next time, just open **Saved Filters** and select it.

---

## 12. Important Rules & Limitations

This section summarizes the key rules of the system. Understanding these will help you avoid confusion and prevent errors.

---

### 12.1 Stock Only Changes After Finalization

This is the most important rule in the system.

> No stock number changes until a request is fully approved and finalized.

Submitting a request, having it approved by a Manager, or even both — none of these update the stock on their own. The final step is finalization, and only then does the count change.

**Why this matters:** Do not assume stock has been updated just because you submitted an adjustment or a movement was approved. Always check the request status to confirm finalization.

---

### 12.2 Cannot Deactivate a Used Product-Location

If a product-location registration is tied to an **active request** (a pending adjustment or an in-progress movement), it **cannot be deactivated** until that request is resolved.

You must either:
- Wait for the request to be finalized, or
- Cancel the request first

Then you can proceed with deactivation.

---

### 12.3 Cannot Exceed Available Stock

You cannot create a **decrease adjustment** or a **movement** for more units than are currently available.

> Available = On-Hand − Reserved

If a product has 50 on-hand but 20 are reserved for an existing movement, your available stock is 30. You cannot submit a new movement or decrease for more than 30 units.

---

### 12.4 Approval Workflow Must Be Followed

There are no shortcuts in the approval process. Requests must go through every required step:

- **Adjustments:** Operator submits → Manager approves → Finalized.
- **Movements:** Operator submits → Origin Manager approves → Destination Manager approves → Finalized.

No one — including Admins — can skip an approval step. This ensures accountability and a clean audit trail.

---

### 12.5 Immutable Stock Ledger

Every stock change that is finalized is recorded permanently. Records cannot be edited or deleted after the fact.

If a mistake is made (e.g. wrong quantity was approved), it must be corrected by submitting a new adjustment in the opposite direction — not by modifying the original record.

---

### 12.6 Product-Location Must Be Active

Stock operations can only be performed on **Active** product-location registrations. If a product is inactive at a location:
- It will not appear in stock operation dropdowns for that location.
- No adjustments or movements can be created for it there.

---

## 13. Tips & Best Practices

These recommendations will help you use the system more effectively and avoid common mistakes.

---

### 13.1 Use Saved Filters

If you check the same view regularly — for example, your location's stock every morning — set up the filters once and save them as a preset. This saves time and ensures consistency.

> Good preset names: "My Location — All Stock", "Low Stock Alert — Warehouse A", "Pending Movements — This Week"

---

### 13.2 Always Review Before Submitting or Approving

Before you submit a request or approve one as a Manager, take a moment to double-check:

- Is the correct **product** selected?
- Is the correct **location** (or origin/destination) selected?
- Is the **quantity** accurate?
- Does the **reason** make sense for the quantity?

Mistakes discovered after finalization cannot be undone — they can only be corrected with a new adjustment.

---

### 13.3 Use the Dashboard for Pending Work

Start each shift or workday by checking the **Dashboard**. The "My Actions" section will immediately show you:
- Requests waiting for your approval (Managers)
- Your submitted requests that are pending or need follow-up (Operators)

This prevents requests from sitting unactioned for long periods.

---

### 13.4 Communicate with Your Team

The system handles approvals, but it does not send automatic alerts to individuals outside of the dashboard. If you submit a request that needs urgent approval, let your Manager know directly so they can prioritize it.

---

### 13.5 Do Not Create Duplicate Requests

If you have already submitted a request, do not submit an identical one while waiting for approval. Check the **Adjustments** or **Movements** list to see if your request is already in the system before creating a new one.

---

### 13.6 Keep Reasons Clear and Consistent

When submitting adjustments or movements, always write a clear and meaningful reason. This helps Managers approve confidently and makes the stock ledger useful as a historical record.

> Good reasons: "Weekly delivery from Vendor X — Invoice #9821", "Transfer for Q2 branch restock"
> Poor reasons: "stock", "adjustment", "fix"

---

### 13.7 Understand Reserved Stock Before Acting

Before creating a movement, check the **Available** column — not the **On-Hand** column. Available stock accounts for reservations and tells you what you can actually work with right now.

---

---

## 14. Activity Timeline & Collaboration

Every stock adjustment and stock movement request has its own **Activity Timeline** — a running log of everything that has happened on that request, visible to everyone involved. You can use this timeline to leave comments, upload supporting documents, and see exactly how the request has moved through the approval process.

---

### 14.1 What the Timeline Is

The Activity Timeline appears on the detail page of any adjustment or movement request. It shows all activity on that request in chronological order, from the moment it was created to its current state.

The timeline has two parts:

| Part | What it shows |
|---|---|
| **Timeline** | Status changes, approvals, rejections, cancellations, comments, and file uploads — in the order they happened |
| **Attachments** | A separate panel below the timeline listing all files currently attached to the request |

> **Note:** The timeline updates automatically while you have the page open. You do not need to refresh to see new activity from other users.

---

### 14.2 Understanding Timeline Events

Each entry in the timeline represents one thing that happened on the request. The event type is shown alongside the date, time, and the person responsible.

| Event type | What it means |
|---|---|
| **Created** | The request was submitted for the first time |
| **Status change** | The request moved to a new stage (e.g. Submitted, Approved, Finalized) |
| **Approved / Rejected** | A Manager or Operator completed an approval action |
| **Cancelled** | The request was cancelled, with the reason shown |
| **Comment added** | A team member left a message on the request |
| **File uploaded** | A new attachment was added to the request |
| **File deleted** | An attachment was removed (visible to users who were online at the time) |

> **Note:** If you reload the page after a file has been deleted, that deletion event will no longer appear in the timeline. File removal is shown in real time but is not stored in the history.

---

### 14.3 Adding a Comment

You can leave a comment on any request that is not yet finalized, cancelled, or rejected. Comments are visible to all users who can view the request.

**To add a comment:**

1. Open the request detail page.
2. Scroll to the **Timeline** section.
3. Type your message in the comment box at the bottom.
4. Click **Submit** (or press **Enter**, depending on your setup).

Your comment will appear in the timeline immediately and will also be visible to other users viewing the request.

> **Tip:** Use comments to explain a decision, flag a question for the approving Manager, or record context that does not fit into the request notes field.

---

### 14.4 Editing and Deleting Comments

Only the person who wrote a comment can edit or delete it.

**To edit a comment:**

1. Find your comment in the timeline.
2. Click the **Edit** icon next to it.
3. Make your changes and save.

> **Warning:** You can edit a comment a maximum of **3 times**. After the third edit, the edit option is disabled permanently for that comment. An "(edited)" indicator appears next to any comment that has been changed.

**To delete a comment:**

1. Find your comment in the timeline.
2. Click the **Delete** icon next to it.
3. Confirm when prompted.

> **Note:** Deleting a comment does not remove it from the timeline. The entry remains, but the message is replaced with a placeholder indicating the comment was deleted. This preserves the timeline's continuity.

---

### 14.5 Uploading Attachments

You can attach supporting documents to any request — for example, a delivery note, an invoice, or a photo of damaged goods.

**To upload a file:**

1. Open the request detail page.
2. Scroll to the **Attachments** section below the timeline.
3. Click **Upload** or drag a file onto the upload area.
4. Optionally add a short description of the file.
5. Click **Confirm** to complete the upload.

The file will appear in the **Attachments** panel and an upload event will be added to the timeline.

> **Tip:** Attaching the relevant invoice or delivery document before submitting an adjustment gives the approving Manager all the information they need in one place.

---

### 14.6 Deleting Attachments

Only the person who uploaded a file — or an Administrator — can delete it.

**To delete an attachment:**

1. Find the file in the **Attachments** panel.
2. Click the **Delete** icon next to it.
3. Confirm when prompted.

> **Warning:** Attachment deletion is **permanent**. The file and its record are removed immediately. There is no way to recover a deleted attachment.

> **Note:** Users who are currently viewing the request will see the deletion event appear in the timeline in real time. If a user reloads the page later, the deletion will not appear — the attachment will simply no longer be in the list.

---

### 14.7 Real-Time Updates

The timeline page stays live while you have it open. You do not need to refresh to see:

- A new comment from a colleague
- A status change (e.g. someone approving or rejecting the request)
- A new file upload

Updates from other users appear in the timeline automatically within a few seconds.

> **Note:** Real-time updates require an active connection to the server. If your connection drops, the page will stop receiving live updates until you reload. You can always reload the page to see the current state of the request.

---

---

## 15. Stock Opname Report

The Stock Opname Report is a tool for physically verifying and reconciling your stock. It shows you what the system says you have, so you can compare it against what you actually count on the warehouse floor. This process is commonly called a **stock opname** or **stock count**.

Use this report to:
- Detect discrepancies between system records and physical stock
- Support internal audits and compliance checks
- Maintain confidence in your stock accuracy over time

---

### 15.1 What the Stock Opname Report Is

The report covers a period you choose and shows, for each product at each location:

- How much stock the system recorded at the **start** of the period
- How much came **in** and went **out** during the period
- What the system **calculates** as the closing balance
- A blank **Physical Qty** column for you to fill in during counting
- A **Variance** column to record the difference

The report can be filtered by date range, location, and product category, so you can scope the count to a single warehouse or a specific product group rather than running the whole inventory at once.

---

### 15.2 Opening the Report

1. Go to the **Stock Dashboard**.
2. Click **Export / Stock Opname Report**.
3. A report window will appear over the page.

> **Note:** Opening this window does not change your Stock Dashboard filters. The report tool is completely separate from the dashboard view.

---

### 15.3 Setting Filters

Before generating the report, set your filters in the report window.

**Start Date and End Date** *(required)*
- Defines the period the report will cover.
- The start date must be on or before the end date.

**Locations** *(optional)*
- Select one or more warehouse locations to include.
- If you leave this blank, the report covers **all locations**.

**Categories** *(optional)*
- Filter by one or more product categories.
- If you leave this blank, the report covers **all categories**.

> **Tip:** For large warehouses, apply a location or category filter to keep the report focused and easier to work with during counting.

---

### 15.4 Generating the Preview

1. Set your filters.
2. Click **Preview**.

The system will generate the report and display it directly in the window. Results are grouped by location, then by category, then by individual product.

If no transactions match your selected filters, the report will show **"No data available"** instead of an empty table.

---

### 15.5 Understanding the Report Structure

The report is organized in three levels:

1. **Report Header** — shows the report title, the date and time it was generated, and the selected period.
2. **Location Section** — each warehouse location appears as its own block.
3. **Category Section** — within each location, products are grouped by category.

Each product row contains the following columns:

| Column | What it shows |
|---|---|
| **SKU / Name** | The product's unique code and name |
| **Starting Qty** | The stock on hand at the very beginning of the selected period |
| **Inbound Qty** | Total stock received during the period (adjustments in, transfers in) |
| **Outbound Qty** | Total stock dispatched during the period (adjustments out, transfers out) |
| **System Qty** | What the system calculates as the closing balance: Starting + Inbound − Outbound |
| **Physical Qty** | Blank — fill this in yourself when counting on the warehouse floor |
| **Variance** | Blank — fill this in after counting: Physical Qty minus System Qty |

> **Note:** Only **finalized** transactions are included. Requests that are still in Draft, Submitted, or Approved status are not reflected in these figures.

---

### 15.6 Performing a Stock Opname

1. Generate and print the report (see Section 15.7).
2. Take the printed report to the warehouse.
3. Count the actual quantity of each product on the shelves.
4. Write the counted quantity in the **Physical Qty** column.
5. Calculate the difference and write it in the **Variance** column (Physical Qty minus System Qty).
   - A positive variance means you have **more** stock than the system shows.
   - A negative variance means you have **less** stock than the system shows.
6. Investigate any variance before making corrections. Common causes include unrecorded deliveries, miscounts, damage write-offs, or data entry errors.

> **Note:** The Variance column is filled in by hand after printing. The system does not calculate it automatically.

---

### 15.7 Printing or Exporting the Report

1. Click **Print / Export PDF** in the report window.
2. Your browser's print dialog will open.
3. Choose an option:
   - Select a **printer** to print on paper.
   - Select **Save as PDF** to download a digital copy.

The report layout is designed for **A4 paper**:
- Each location starts on a new page, so sections do not split across location boundaries.
- Column headers repeat at the top of every page, making multi-page reports easy to follow.

> **Tip:** If you are saving a PDF for audit purposes, include the date in the filename so it is easy to find later.

---

### 15.8 Notes and Tips

- **Only finalized data is shown.** Any request still in progress (Draft, Submitted, Approved) will not appear in the report. Run the report after all pending requests for the period have been resolved for the most accurate figures.
- **Filter before you print.** If you only need to count one location or one product category, apply those filters first. A smaller, focused report is easier to work with on the warehouse floor.
- **Large date ranges may take longer.** If your selected period spans many months or covers many locations, the preview may take a moment to generate.
- **System Qty vs. Physical Qty.** System Qty is calculated from transaction records. Physical Qty is what you count. A zero variance means the two agree. Any variance requires investigation.
- **Use the report regularly.** Periodic stock counts catch small discrepancies before they grow. Many operations run a full stock opname monthly and spot-checks on high-value items weekly.

---

---

## 16. System Rules, Permissions, and Real-Time Behavior

This section explains the rules the system enforces automatically, what each role can and cannot do, and how the real-time features work. Understanding these rules will help you know what to expect and avoid confusion when certain actions are unavailable.

---

### 16.1 Timeline Behavior

The Activity Timeline on each request updates automatically. You do not need to refresh the page to see what other users are doing.

Events appear in **newest-first** order. The timeline records:

- Workflow actions — creating, submitting, approving, rejecting, cancelling, and finalizing a request
- Comments — added, edited, or deleted
- File activity — uploads and deletions

All users viewing the same request see the same updates as they happen. The timeline always reflects real system activity — nothing is shown that did not actually occur.

---

### 16.2 Comment Rules

**Adding comments**
Any user with access to a request can add a comment while the request is still active (not yet finalized, rejected, or cancelled).

**Editing comments**
- Only the person who wrote the comment can edit it.
- A comment can be edited a maximum of **3 times**.
- Once the limit is reached, the edit option disappears permanently for that comment.
- Edited comments show an **(edited)** indicator so other users know the message was changed.

**Deleting comments**
- Only the original author can delete their own comment.
- Deleting a comment does not remove the entry from the timeline. The entry remains, but the message content is replaced with a placeholder. The **(edited)** indicator is also removed.

---

### 16.3 Attachment Rules

**Uploading**
Any user with access to the request can upload an attachment. An optional description can be added to explain what the file is.

**Deleting**
- Only the person who uploaded a file can delete it. Other users will not see a delete option for files they did not upload.
- Administrators can delete any attachment regardless of who uploaded it.
- The system will block deletion attempts by anyone who does not have permission.

**What happens after deletion**
- The file is permanently removed and cannot be recovered.
- Users who are currently viewing the request will see a **"Attachment deleted"** event appear in the timeline in real time.
- The file can no longer be downloaded.
- If another user reloads the page after the deletion, the event will not appear in the timeline — the attachment will simply no longer be listed.

---

### 16.4 Workflow Status Rules

Every request follows a fixed sequence of states. The system only allows transitions that are valid from the current state — you cannot skip steps or go backwards.

**Adjustment workflow:**
```
Draft → Submitted → Approved → Finalized
                 ↘ Rejected
Draft or Approved → Cancelled
```

**Transfer workflow:**
```
Draft → Submitted → Origin Approved → Ready to Finalize → Finalized
                 ↘ Rejected
Submitted, Origin Approved, or Ready to Finalize → Cancelled
```

Key rules:

- Approval actions (approve, reject) require a **Manager** role at the relevant location — or Admin access.
- Finalization requires an **Operator** or **Manager** role at the relevant location — or Admin access.
- Once a request is **Finalized**, the stock figures are locked and cannot be changed. There is no edit or undo for finalized requests.
- Once a request is **Rejected** or **Cancelled**, it is closed. No further actions can be taken on it.

---

### 16.5 Real-Time Updates

The system delivers updates automatically while you have a request page open. The following events appear without a manual refresh:

- Status changes (submitted, approved, finalized, etc.)
- New comments
- File uploads

You do not need to do anything — updates appear within a few seconds of the action occurring.

**If updates are not appearing:**
1. Check your network connection.
2. Reload the page. This will show the current state of the request, even if live updates stopped arriving.

> **Note:** Real-time updates are delivered per browser tab. If you have the same request open in two tabs, each tab receives updates independently.

---

### 16.6 Permissions Overview

What you can do in the system depends on your role. The table below summarizes the main permission boundaries.

| Action | Operator | Manager | Admin |
|---|---|---|---|
| Create a request | Yes | Yes | Yes |
| Submit a request | Yes | Yes | Yes |
| Approve or reject a request | No | Yes (own locations) | Yes |
| Finalize a request | Yes (own locations) | Yes (own locations) | Yes |
| Cancel a request | Yes (own, if not finalized) | Yes (own locations) | Yes |
| Add a comment | Yes | Yes | Yes |
| Edit or delete own comment | Yes | Yes | Yes |
| Upload an attachment | Yes | Yes | Yes |
| Delete own attachment | Yes | Yes | Yes |
| Delete any attachment | No | No | Yes |
| Access admin settings | No | No | Yes |

> **Note:** "Own locations" means locations where you have been assigned a role. Users without a role at a location cannot view or act on requests for that location. Admins have access to all locations.

---

### 16.7 System Limitations and Practical Notes

**Performance**
- Reports or lists covering long date ranges or many locations may take a moment to load. Apply filters to narrow the scope if results are slow.

**Irreversible actions**
The following actions **cannot be undone**:
- Finalizing a request — stock figures are locked
- Deleting an attachment — the file is permanently removed
- Rejecting or cancelling a request — the request is closed

Think carefully before confirming these actions.

**Missing data or actions**
If something you expect to see is not visible:
- Check whether an active filter is hiding results.
- Confirm that you have the correct role at the relevant location.
- Ask your Administrator if you believe your access is incomplete.

**Connection dependency**
Real-time updates and report generation both require an active connection to the server. If your connection is interrupted, reload the page to get the latest data.

---

*End of User Manual — Asset Management System v2.0*
*Last updated: April 15, 2026*
