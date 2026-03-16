# api-contract.md

## Purpose

This document defines the **HTTP API contract** for the Asset Management System. It acts as the single source of truth for backend and frontend development.

AI development tools must follow this contract when implementing:

- Express routes
- Controllers
- Frontend API clients

The contract defines:

- endpoints
- request payloads
- response structures
- authorization rules

All responses must use JSON.

---

# Base Configuration

Base URL

/api/v1

Authentication

JWT Bearer Token

Header

Authorization: Bearer&#x20;

---

# Standard Response Format

Successful response

```
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error response

```
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

# Authentication

## Login

POST /auth/login

Request

```
{
  "identifier": "email_or_phone",
  "password": "string"
}
```

Response

```
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "name": "string",
      "email": "string"
    }
  }
}
```

---

# Stock Module

## Get Stock Overview

GET /stock

Query Parameters

locationId periodStart periodEnd page limit

Response

```
{
  "success": true,
  "data": [
    {
      "productId": "PROD-001",
      "productName": "USB Cable",
      "startingQty": 100,
      "inboundQty": 20,
      "outboundQty": 10,
      "finalQty": 110,
      "pendingInbound": 5,
      "pendingOutbound": 3
    }
  ]
}
```

---

# Stock Adjustment Module

## Create Adjustment Request

POST /adjustments

Request

```
{
  "locationId": "uuid",
  "items": [
    {
      "productId": "PROD-001",
      "quantity": 10
    }
  ],
  "reason": "string"
}
```

Response

```
{
  "success": true,
  "data": {
    "adjustmentId": "uuid",
    "status": "PENDING"
  }
}
```

---

## Approve Adjustment

POST /adjustments/{id}/approve

Authorization

Manager of same location

Response

```
{
  "success": true
}
```

---

## Finalize Adjustment

POST /adjustments/{id}/finalize

Authorization

Operator of same location

Response

```
{
  "success": true
}
```

---

## Cancel Adjustment

POST /adjustments/{id}/cancel

Request

```
{
  "reason": "string"
}
```

---

# Movement Module

## Create Movement Request

POST /movements

Request

```
{
  "sourceLocationId": "uuid",
  "destinationLocationId": "uuid",
  "items": [
    {
      "productId": "PROD-001",
      "quantity": 10
    }
  ],
  "reason": "string"
}
```

Response

```
{
  "success": true,
  "data": {
    "movementId": "uuid",
    "status": "PENDING_ORIGIN_APPROVAL"
  }
}
```

---

## Approve Origin

POST /movements/{id}/approve-origin

Authorization

Origin manager

---

## Approve Destination

POST /movements/{id}/approve-destination

Authorization

Destination operator

---

## Finalize Movement

POST /movements/{id}/finalize

Authorization

Destination operator or manager

---

## Cancel Movement

POST /movements/{id}/cancel

Request

```
{
  "reason": "string"
}
```

---

# Admin Module

Admin endpoints manage master data.

Authorization

Admin role only

---

## Products

GET /admin/products POST /admin/products PUT /admin/products/{id} DELETE /admin/products/{id}

---

## Vendors

GET /admin/vendors POST /admin/vendors PUT /admin/vendors/{id} DELETE /admin/vendors/{id}

---

## Categories

GET /admin/categories POST /admin/categories PUT /admin/categories/{id} DELETE /admin/categories/{id}

---

## Locations

GET /admin/locations POST /admin/locations PUT /admin/locations/{id} DELETE /admin/locations/{id}

---

## Users

GET /admin/users POST /admin/users PUT /admin/users/{id} DELETE /admin/users/{id}

---

# Audit Logs

## Get Audit Logs

GET /audit-logs

Query

page limit userId entityType entityId

Response

```
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "action": "CREATE_ADJUSTMENT",
      "entityType": "Adjustment",
      "entityId": "uuid",
      "createdAt": "timestamp"
    }
  ]
}
```

---

# Pagination Standard

List endpoints must support pagination.

Query parameters

page limit

Response meta

```
{
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

# Authorization Summary

Operator

- create adjustments
- create movements
- finalize adjustments
- approve destination movements

Manager

- approve adjustments
- approve origin movements

Admin

- manage master data
- view all locations

---

# AI Implementation Rules

AI tools implementing this API must:

1. Validate all input payloads
2. Enforce role authorization
3. Call service layer only
4. Never write stock logic inside controllers
5. Follow workflow rules defined in ai-system-architecture.md

---

# Success Criteria

A compliant API implementation should allow:

- frontend development without guessing endpoints
- safe stock workflow execution
- strict authorization enforcement
- consistent error handling

