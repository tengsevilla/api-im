# 📦 Inventory Management API Documentation

This API powers a Multi-Tenant Inventory Management System. It uses **JWT Authentication** and a strict **`clientid` header** to isolate data between different business tenants.

## 🔐 Authentication & Headers

**Global Headers** (Required for most private routes):
* `Authorization`: `Bearer <your_jwt_token>`
* `clientid`: `<your_unique_client_uuid>` (Received after login/registration)
* `Content-Type`: `application/json`

---

## 1. 👤 Account (Auth)
**Base URL:** `/api/account`

### **Register**
Create a new user account.
* **Method:** `POST /register`
* **Payload:**
```json
{
  "username": "user123",
  "password": "securePassword",
  "name": "John Doe"
}

```

### **Login**

Authenticate and receive a Token + Client ID.

* **Method:** `POST /login`
* **Headers:** `Authorization: Basic <base64_username:password>` OR raw JSON body.
* **Payload (Optional):**

```json
{ "rememberMe": true }

```

* **Response:**

```json
{
  "status": 200,
  "access_token": "eyJhbG...",
  "data": {
    "clientId": "uuid-string-here",
    "username": "user123",
    "role": "admin"
  }
}