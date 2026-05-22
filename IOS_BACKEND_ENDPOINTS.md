# ProjectPRT iOS Backend Endpoints

This document summarizes the backend endpoints needed for the ProjectPRT Executive iOS app. It is based on the current backend implementation in `ProjectPRT-BE`.

Production base URL:

```text
https://backend-api-886029565568.asia-southeast1.run.app
```

API prefix:

```text
/api/v1
```

Full API example:

```text
https://backend-api-886029565568.asia-southeast1.run.app/api/v1/auth/login
```

## 1. Mobile App Scope

The iOS app has a persistent bottom tab bar with 4 main routes:

| Tab | Purpose | Main Endpoints |
| --- | --- | --- |
| Dashboard | Executive overview | `GET /dashboard` or `GET /documents` |
| Approvals | Pending approvals and approve/reject actions | `GET /cases`, `POST /cases/{id}/approve`, `POST /cases/{id}/reject` |
| Insights | Transaction explorer and reports | `GET /insights`, `GET /categories`, `GET /admin/users` |
| FinBot | AI assistant with voice prompt support | `POST /chat` |

## 2. iOS Authentication Standard

After login, iOS must store the `access_token` and send it on protected requests:

```http
Authorization: Bearer <access_token>
```

Most backend responses use this envelope:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Some endpoints do not use the envelope and return a direct object or array, such as:

- `GET /cases`
- `GET /cases/paged`
- `POST /cases/{id}/approve`
- `POST /cases/{id}/reject`
- `POST /chat`

### Token Expiration

JWT expiration is controlled by `ACCESS_TOKEN_EXPIRE_MINUTES` in backend settings. The current default is 60 minutes.

There is currently no refresh token endpoint. iOS should handle:

- `401`: clear the stored token and return to login
- `403`: user is authenticated but does not have the required role

## 3. Auth Endpoints

### 3.1 Email/Password Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

Request:

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "access_token": "jwt-token",
    "user": {
      "user_id": "uuid",
      "email": "admin@example.com",
      "name": "Admin User",
      "position": "Admin"
    }
  },
  "error": null
}
```

Common errors:

- `401`: invalid email or password
- `403`: user is disabled

### 3.2 Sign Up

This endpoint exists in the backend, but the Executive/Admin iOS app may not need to expose self-registration.

```http
POST /api/v1/auth/signup
Content-Type: application/json
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name",
  "position": "Executive"
}
```

Behavior:

- Creates a new user
- Assigns the default role `requester`
- Returns an access token

### 3.3 Google SSO

iOS should use the Google Sign-In SDK to obtain a Google ID token, then send that ID token to the backend.

```http
POST /api/v1/auth/google
Content-Type: application/json
```

Request:

```json
{
  "id_token": "google-id-token-from-ios"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "access_token": "jwt-token",
    "user": {
      "user_id": "google-sub",
      "email": "user@gmail.com",
      "name": "User Name",
      "position": null
    }
  },
  "error": null
}
```

Important backend note:

- The current `/auth/google` implementation creates the JWT with Google `sub` as the token `sub`.
- Several protected endpoints resolve users by `User.id`, which is a database UUID.
- If the token `sub` is a Google subject but `User.id` is a UUID, protected endpoints may return `401`.
- Before enabling Google SSO in iOS, update the backend so the JWT `sub` is `str(db_user.id)`, or update the auth dependencies to resolve users by `google_sub` as well.

### 3.4 Current User

There are 2 similar endpoints.

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "username": "user@example.com",
    "roles": ["admin", "finance"]
  },
  "error": null
}
```

Alternative endpoint:

```http
GET /api/v1/me
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "google_sub": null,
    "email": "admin@example.com",
    "name": "Admin User",
    "roles": ["admin"]
  },
  "error": null
}
```

iOS recommendation:

- Prefer `GET /api/v1/me` for profile and role checks.
- If Google SSO is enabled, fix the token subject issue first.

## 4. Dashboard Tab

Mobile screen requirements:

- Header: `Overview`
- Top metric cards: Total Income, Total Expense, Net Balance
- Middle chart: simple bar chart or trend line
- Bottom list: recent transactions, last 5 approved items

### 4.1 Recommended Endpoint for Executive

```http
GET /api/v1/dashboard?year=2026
Authorization: Bearer <token>
```

Allowed roles:

- `admin`
- `accounting`
- `viewer`
- `executive`

Response:

```json
{
  "success": true,
  "data": {
    "summary": {
      "expenses": 120000.0,
      "income": 300000.0,
      "balance": 180000.0
    },
    "monthlyStats": [
      {
        "name": "Jan",
        "value": 10000.0,
        "highlight": false
      }
    ],
    "activityStats": [
      {
        "name": "Travel Expense",
        "value": 5000.0,
        "fill": "#8884d8"
      }
    ],
    "latestTransactions": [
      {
        "id": "document-uuid",
        "case_id": "case-uuid",
        "initial": "P",
        "name": "Travel Expense (Requester Name)",
        "description": "PV-2605-0001",
        "amount": 5000.0,
        "has_attachment": true,
        "receipt_url": null
      }
    ]
  },
  "error": null
}
```

Important note:

- This endpoint currently counts only `Case.status = APPROVED`.
- If the mobile dashboard should include `PAID` and `CLOSED` items like the web dashboard logic, update the backend filter.

### 4.2 Web-Compatible Dashboard Endpoint

```http
GET /api/v1/documents?year=2026
Authorization: Bearer <token>
```

Allowed roles:

- `admin`
- `accounting`
- `viewer`

Not currently allowed:

- `executive`

Important note:

- The current web frontend dashboard uses this endpoint.
- This endpoint excludes `DRAFT`, `CANCELLED`, `REJECTED`, and `SUBMITTED`.
- It includes a broader set of completed workflow states than `/dashboard`.
- If iOS Executive users need this same logic, add `executive` to the allowed roles or create a dedicated mobile dashboard endpoint.

### 4.3 Recent Transaction File Preview

When the user taps a recent transaction file:

```http
GET /api/v1/files/{case_id}/list
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "id": "file-or-document-id",
    "case_id": "case-uuid",
    "file_name": "PV-2605-0001_approved.pdf",
    "url": "signed-download-url",
    "type": "APPROVED_PDF"
  },
  {
    "id": "attachment-id",
    "case_id": "case-uuid",
    "file_name": "receipt.pdf",
    "url": "signed-download-url",
    "type": "RECEIPT"
  }
]
```

Recommended file priority:

1. `APPROVED_PDF`
2. `RECEIPT`
3. `PS`
4. Other attachments

## 5. Approvals Tab

Mobile screen requirements:

- List pending cases with status `SUBMITTED`
- Each card shows Document No., Requester Name, Purpose, and Amount in THB
- Detail view must not show the PDF immediately
- Detail top summary shows Amount, Requester Name, Department, and Purpose
- Detail middle button: `View Original PDF Document`
- Fixed bottom actions: `Reject` and `Approve`
- Reject flow must require a rejection reason before confirmation

### 5.1 Pending Cases

```http
GET /api/v1/cases/?status=SUBMITTED
Authorization: Bearer <token>
```

Response is a direct array:

```json
[
  {
    "id": "case-uuid",
    "case_no": "CAS-260521-ABC123",
    "doc_no": "PV-2605-0001",
    "requester_name": "Requester Name",
    "description": "Travel reimbursement",
    "requested_amount": 5000.0,
    "created_at": "2026-05-21T04:00:00Z",
    "status": "SUBMITTED",
    "department": "Finance",
    "is_receipt_uploaded": false,
    "ps_url": "signed-url-original-ps-pdf",
    "approved_pdf_url": null,
    "mime_type": "application/pdf"
  }
]
```

Card mapping for iOS:

- Document No.: `doc_no`, fallback to `case_no`
- Requester Name: `requester_name`
- Purpose: `description`
- Amount: `requested_amount`

Detail mapping:

- Amount: `requested_amount`
- Requester: `requester_name`
- Department: `department`
- Purpose: `description`
- Original PDF button: open `ps_url`

### 5.2 Pending Cases with Pagination

Recommended for mobile lists:

```http
GET /api/v1/cases/paged?status=SUBMITTED&page=1&limit=20
Authorization: Bearer <token>
```

Response:

```json
{
  "items": [],
  "total": 120,
  "page": 1,
  "limit": 20,
  "total_pages": 6
}
```

### 5.3 Approve Case

```http
POST /api/v1/cases/{case_id}/approve
Authorization: Bearer <token>
```

Allowed roles:

- `finance`
- `accounting`
- `admin`

Request body: none

Success response:

```json
{
  "message": "Case Approved (PV-2605-0001)",
  "case_id": "case-uuid",
  "status": "APPROVED",
  "doc_no": "PV-2605-0001",
  "audit_details": {
    "approved_by": "admin@example.com",
    "approved_at": "2026-05-21T04:00:00+00:00",
    "approved_pdf_url": "signed-url-approved-pdf"
  }
}
```

Backend validation:

- Case must be `SUBMITTED`
- Case must already have a Document
- Approver must have a display name
- Case must have an attachment with type `PS`
- PS attachment must be a PDF
- Backend stamps approval text on the PDF and uploads the approved PDF to GCS

### 5.4 Reject Case

```http
POST /api/v1/cases/{case_id}/reject
Authorization: Bearer <token>
Content-Type: application/json
```

Allowed roles:

- `finance`
- `accounting`
- `admin`

Request:

```json
{
  "note": "Required supporting document is missing."
}
```

Success response:

```json
{
  "message": "Case Rejected (PV-2605-0001)",
  "case_id": "case-uuid",
  "status": "REJECTED",
  "doc_no": "PV-2605-0001"
}
```

iOS validation:

- Reject reason must not be empty
- Tapping `Reject` should open a bottom sheet or modal
- Send `note` only after the user confirms rejection

## 6. Insights Tab

Mobile screen requirements:

- Header: `Insights & Reports`
- Horizontal filter bar: User, Category, Month, Year
- Content: scrollable transaction list
- Each item shows Date, Doc No., Purpose, and Amount

### 6.1 Get Insights Data

```http
GET /api/v1/insights/?user_id={requester_id}&category_id={category_uuid}&month=5&year=2026
Authorization: Bearer <token>
```

Query params:

| Param | Type | Required | Note |
| --- | --- | --- | --- |
| `user_id` | string | no | Matches `Case.requester_id` |
| `category_id` | UUID | no | Category ID |
| `category_type` | `EXPENSE` / `REVENUE` / `ASSET` | no | Supported by backend |
| `month` | int 1-12 | no | Uses `Case.created_at` |
| `year` | int | no | Gregorian year, e.g. `2026` |

Response:

```json
{
  "success": true,
  "data": {
    "summary": {
      "normal_count": 10,
      "normal_amount": 120000.0,
      "pending_count": 2,
      "pending_amount": 15000.0,
      "approved_count": 8,
      "approved_amount": 105000.0
    },
    "transactions": [
      {
        "id": "case-uuid",
        "doc_no": "PV-2605-0001",
        "date": "21/05/2026",
        "creator_id": "requester@example.com",
        "user_code": "reques",
        "purpose": "Travel reimbursement",
        "amount": 5000.0,
        "status": "APPROVED"
      }
    ]
  },
  "error": null
}
```

Important backend note:

- This endpoint currently does not enforce auth or role in the router.
- iOS should still send the token.
- Amounts use `Case.requested_amount`.

### 6.2 Category Filter

```http
GET /api/v1/categories/?active=true
Authorization: Bearer <token>
```

Optional type filters:

```http
GET /api/v1/categories/?type=EXPENSE&active=true
GET /api/v1/categories/?type=REVENUE&active=true
GET /api/v1/categories/?type=ASSET&active=true
```

Response is a direct array:

```json
[
  {
    "id": "category-uuid",
    "name_th": "Travel Expense",
    "type": "EXPENSE",
    "account_code": "501043",
    "is_active": true
  }
]
```

### 6.3 User Filter

```http
GET /api/v1/admin/users
Authorization: Bearer <token>
```

Allowed roles:

- `admin`

Response envelope:

```json
{
  "success": true,
  "data": [
    {
      "user_id": "uuid",
      "google_sub": null,
      "email": "user@example.com",
      "name": "User Name",
      "position": "Executive",
      "roles": ["requester"],
      "is_active": true
    }
  ],
  "error": null
}
```

Important backend note:

- If an Executive user needs the User filter but does not have the `admin` role, this endpoint will return `403`.
- Recommended backend improvement: add a read-only user option endpoint, for example `GET /api/v1/users/options`, or allow `executive` on a limited user list endpoint.

## 7. FinBot Tab

Mobile screen requirements:

- Standard chat UI similar to ChatGPT or iMessage
- Text input field
- Prominent microphone button for voice commands
- Clear visual distinction between User and AI bubbles
- AI responses may include formatted numbers or short lists

### 7.1 Send Chat Message

```http
POST /api/v1/chat
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "message": "Summarize this month's expenses."
}
```

Response is not envelope:

```json
{
  "reply": "Here is the expense summary..."
}
```

iOS voice flow:

1. User taps the microphone button
2. iOS converts speech to text using Apple's Speech framework or another selected speech service
3. App either shows the text in the input field or sends it immediately, depending on UX
4. App sends text to `POST /chat`
5. App renders `reply` as an AI bubble

Backend behavior:

- Login is required
- AI replies in Thai according to the current backend prompt
- Chat tools can query the database
- Spending, expense, and income analytics exclude JV unless the user explicitly asks about JV

## 8. File Preview Endpoint

Use this endpoint for Dashboard, Approvals, and Insights file previews.

```http
GET /api/v1/files/{case_id}/list
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "id": "attachment-id",
    "case_id": "case-uuid",
    "file_name": "20260521110000_receipt.pdf",
    "url": "signed-download-url",
    "type": "RECEIPT"
  }
]
```

iOS implementation notes:

- Open PDF/image files with `SFSafariViewController`, `WKWebView`, or a native PDF viewer.
- Signed URLs expire based on backend config.
- If preview fails because the URL expired, call the file list endpoint again to get a new signed URL.

Important backend note:

- This endpoint currently has a code comment saying stricter access validation may still be needed.

## 9. Optional Admin/User Management Endpoints

Use these only if the iOS app needs Admin user management.

### 9.1 List Users

```http
GET /api/v1/admin/users
Authorization: Bearer <token>
```

### 9.2 Update User Profile

```http
PATCH /api/v1/admin/users/{user_id}
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "name": "New Name",
  "position": "Executive"
}
```

### 9.3 Replace User Roles

```http
POST /api/v1/admin/users/{user_id}/roles
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "roles": ["admin", "executive"]
}
```

Allowed role values:

- `admin`
- `accounting`
- `finance`
- `treasury`
- `requester`
- `executive`
- `viewer`

### 9.4 Soft Delete User

```http
DELETE /api/v1/admin/users/{user_id}
Authorization: Bearer <token>
```

Behavior:

- Does not physically delete the row
- Sets `users.is_active = false`

## 10. Endpoint Recommendation by iOS Screen

### Dashboard

Recommended:

```text
GET /api/v1/dashboard?year=YYYY
```

Use for:

- Income card: `data.summary.income`
- Expense card: `data.summary.expenses`
- Balance card: `data.summary.balance`
- Chart: `data.monthlyStats`
- Recent list: `data.latestTransactions`

If Executive users need the same numbers as the web dashboard:

- Align `/dashboard` logic with `/documents`, or
- Allow the `executive` role on `/documents`

### Approvals

List:

```text
GET /api/v1/cases/paged?status=SUBMITTED&page=1&limit=20
```

Detail:

- Use the selected list item as the detail payload
- Open the original PDF through `ps_url`

Approve:

```text
POST /api/v1/cases/{case_id}/approve
```

Reject:

```text
POST /api/v1/cases/{case_id}/reject
```

### Insights

Filters:

```text
GET /api/v1/categories/
GET /api/v1/admin/users
```

Main data:

```text
GET /api/v1/insights/?user_id=&category_id=&month=&year=
```

### FinBot

```text
POST /api/v1/chat
```

## 11. Mobile Readiness Issues to Fix or Confirm

Before the iOS team integrates with production, confirm or fix these backend issues:

1. **Google SSO token subject mismatch**
   - `/auth/google` currently issues tokens with Google `sub`
   - Protected endpoints often resolve users by database UUID
   - Fix this before using Google SSO in production

2. **Dashboard role and logic mismatch**
   - The iOS app targets Executive/Admin users
   - `/documents` does not allow `executive`
   - `/dashboard` allows `executive` but uses different status filtering

3. **Insights user filter**
   - `GET /admin/users` is admin-only
   - If executives need a User filter, add a read-only user options endpoint

4. **Approvals detail endpoint**
   - Current list responses contain enough data for the mobile detail screen
   - If a stable detail contract is needed, add something like `GET /cases/{id}/admin-view`

5. **File access validation**
   - `GET /files/{case_id}/list` should enforce visibility rules before production mobile rollout

6. **No refresh token**
   - iOS must handle session expiration by forcing login again

7. **Inconsistent response shapes**
   - Some endpoints return `{success,data,error}`
   - Some endpoints return direct objects or arrays
   - The iOS networking layer should support both, or the backend should normalize responses

## 12. Minimal iOS API Client Checklist

iOS should have at least these service layers:

- `AuthService`
  - Email/password login
  - Google ID token login
  - Current user
  - Logout and clear token

- `DashboardService`
  - Fetch dashboard by year
  - Fetch case files for recent transaction preview

- `ApprovalService`
  - Fetch pending cases with pagination
  - Approve case
  - Reject case with reason

- `InsightsService`
  - Fetch insights
  - Fetch categories
  - Fetch user filter options

- `ChatService`
  - Send text message
  - Voice-to-text should happen on iOS; backend receives text

- `FilePreviewService`
  - Fetch file list
  - Open signed URL
  - Refresh signed URL when expired

