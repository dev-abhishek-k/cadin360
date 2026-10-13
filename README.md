# CADIN360 Visitor Journey

A production-grade MERN platform for tracking and attributing visitor journeys across unauthenticated guest sessions and registered user accounts.

## Stack & Architecture

- **Client**: React 18, Vite, React Router 7, Axios, Tailwind CSS, Vitest.
- **Server**: Node.js ES modules, Express 4, Mongoose 8, MongoDB, bcryptjs, jsonwebtoken, cookie-parser, helmet, morgan.
- **Architecture**:
  - `server/src/config`: Environment validation, database lifecycle, CORS policy.
  - `server/src/shared`: Global error handling, HTTP status codes, constants, rate limiting, and JWT/role middleware.
  - `server/src/modules/health`: System diagnostics and MongoDB connection readiness API.
  - `server/src/modules/auth`: User model, repository, authentication service, and controllers.
  - `server/src/modules/guestSession`: Cryptographic guest session generator, SHA-256 credential hashing, and atomic user journey association.
  - `client/src`: React application featuring AuthContext, Toast notifications, diagnostics, guest session manager, and login/register views.

---

## Module 2: Event Tracking & Ingestion

### 1. Architecture & Design Principles

Module 2 provides a resilient event tracking pipeline capable of ingesting high-throughput visitor interactions across unauthenticated guests and authenticated users.

- **Client-Generated Unique Event IDs (`eventId`)**: Clients supply an idempotent UUID (e.g. `evt_...`), ensuring safe network retries without double-counting.
- **Strict Browser Ingestion Boundary**: The public event endpoint (`POST /api/events`) accepts browser interactions (`short_link_opened`, `page_viewed`, `exercise_started`, `exercise_submitted`, `signup_completed`, `plan_viewed`), but **strictly rejects** `payment_completed` (HTTP 403), even if client requests attempt to pass `verified: true`.
- **Server-Side Trusted Payment Flow**: Only trusted server-side flows (`POST /api/payments/verify-mock`) can create verified `payment_completed` events using deterministic event IDs (`pay_evt_${paymentId}`).
- **Immutable Content Verification**: When an `eventId` is re-transmitted:
  - Excludes server-generated fields (`receivedAt`, `createdAt`, `updatedAt`).
  - Compares client-submitted immutable fields (`type`, `occurredAt`, `canonicalRoute`, `originalRoute`, `exerciseName`, `source`, `payment`).
  - Returns `200 OK` with `duplicate: true` for identical retries.
  - Returns `409 Conflict` if immutable contents differ.
- **Atomic Duplicate Handling**: Concurrency-safe ingestion via a unique MongoDB index on `eventId` and atomic insert operations, catching E11000 duplicate key collisions without race conditions.
- **Deterministic Journey Ordering**: Journey timelines are ordered by `occurredAt ASC, eventId ASC` (never `receivedAt`).

---

### 2. MongoDB Event Model & Justified Indexes

The `Event` collection maintains the following schema and index architecture:

| Index Specification | Purpose & Justification |
| :--- | :--- |
| `{ eventId: 1 }` (unique) | Enforces global uniqueness and atomic duplicate rejection across concurrent requests. |
| `{ userId: 1, occurredAt: 1, eventId: 1 }` | Supports fast chronological timeline queries for authenticated user journeys. |
| `{ guestSessionId: 1, occurredAt: 1, eventId: 1 }` | Supports chronological queries for guest sessions before conversion. |
| `{ occurredAt: 1, eventId: 1 }` | Enables deterministic global timeline pagination and tie-breaking across journeys. |
| `{ type: 1, occurredAt: 1 }` | Optimizes analytics and conversion aggregation queries for Modules 3 & 4. |

---

### 3. Identity Resolution & Ownership Rules

1. **Guest Events**: Validates `x-guest-session-credential` header or request body. Computes SHA-256 hash to find the corresponding `GuestSession`. Rejects with HTTP 401 if invalid.
2. **Authenticated User Events**: Validates JWT cookie or `Authorization: Bearer <token>`. Derives `userId` strictly from the server-validated token.
3. **Session Ownership Enforcement**: If an authenticated user also passes a guest credential, the server verifies that `guestSession.associatedUserId` matches `user._id` (or is still unassociated). If owned by another user, the request is rejected with HTTP 403 Forbidden.
4. **Zero Client Trust**: Any client-submitted `userId` or `role` fields are explicitly ignored and stripped. No identity merging is performed via IP or email.

---

### 4. Route Label Normalization

Compatible with CADIN360 journey specifications:
- `/guest-dashboard/cad-practice/2d` and `/user-dashboard/cad-practice/2d` &rarr; `2D Exercises`
- `/guest-dashboard/cad-practice/3d` and `/user-dashboard/cad-practice/3d` &rarr; `3D Exercises`
- `/pricing` &rarr; `Plans`
- The raw browser path is always preserved in `originalRoute`.

---

## API Endpoints & Examples

### 1. Create Guest Session
- **Endpoint**: `POST /api/guest-sessions`
- **Request Body**: `{}`
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Guest session created successfully",
  "guestSession": {
    "id": "670aa1b0e3f2b1897c5e2190",
    "associatedUserId": null,
    "createdAt": "2026-10-12T10:15:30.000Z",
    "expiresAt": "2026-11-11T10:15:30.000Z"
  },
  "guestCredential": "e1a90c4f87b12d53c6a4802e9bc14238a8e10d29384a8bc93e472610ab56cd01"
}
```

### 2. User Signup (with optional Guest Session Association)
- **Endpoint**: `POST /api/auth/signup` (also aliased at `/api/auth/register`)
- **Request Body**:
```json
{
  "name": "Jane Visitor",
  "email": "jane@example.com",
  "password": "Password123!",
  "guestCredential": "e1a90c4f87b12d53c6a4802e9bc14238a8e10d29384a8bc93e472610ab56cd01"
}
```
- **Response** (`201 Created`, sets `token` httpOnly cookie):
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "670aa210e3f2b1897c5e2195",
    "name": "Jane Visitor",
    "email": "jane@example.com",
    "role": "user",
    "createdAt": "2026-10-12T10:16:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "guestSession": {
    "id": "670aa1b0e3f2b1897c5e2190",
    "associatedUserId": "670aa210e3f2b1897c5e2195"
  }
}
```

### 3. User Login
- **Endpoint**: `POST /api/auth/login`
- **Request Body**:
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```
- **Response** (`200 OK`, sets `token` httpOnly cookie):
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "670aa210e3f2b1897c5e2195",
    "name": "Jane Visitor",
    "email": "jane@example.com",
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 4. Current Authenticated Profile
- **Endpoint**: `GET /api/auth/me`
- **Headers**: Cookie `token=<jwt>` or `Authorization: Bearer <jwt>`
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "user": {
    "id": "670aa210e3f2b1897c5e2195",
    "name": "Jane Visitor",
    "email": "jane@example.com",
    "role": "user"
  }
}
```

### 5. Ingest Browser Event
- **Endpoint**: `POST /api/events`
- **Headers**:
  - `x-guest-session-credential: <credential>` (for guest events)
  - OR `Authorization: Bearer <jwt>` / cookie `token` (for user events)
- **Request Body**:
```json
{
  "eventId": "evt_guest_nav_001",
  "type": "page_viewed",
  "occurredAt": "2026-10-12T10:00:00.000Z",
  "canonicalRoute": "/guest-dashboard/cad-practice/2d",
  "originalRoute": "/guest-dashboard/cad-practice/2d?ref=social",
  "source": "google_search"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "duplicate": false,
  "message": "Event recorded successfully",
  "data": {
    "id": "670aa330e3f2b1897c5e2201",
    "eventId": "evt_guest_nav_001",
    "type": "page_viewed",
    "occurredAt": "2026-10-12T10:00:00.000Z",
    "receivedAt": "2026-10-12T10:00:02.145Z",
    "canonicalRoute": "2D Exercises",
    "originalRoute": "/guest-dashboard/cad-practice/2d?ref=social",
    "source": "google_search",
    "guestSessionId": "670aa1b0e3f2b1897c5e2190",
    "userId": null
  }
}
```
- **Duplicate Retry Response** (Same `eventId`, identical immutable content &rarr; `200 OK`):
```json
{
  "success": true,
  "duplicate": true,
  "message": "Duplicate event acknowledged",
  "data": {
    "eventId": "evt_guest_nav_001",
    "type": "page_viewed",
    "occurredAt": "2026-10-12T10:00:00.000Z",
    "canonicalRoute": "2D Exercises"
  }
}
```
- **Conflicting Retry Response** (Same `eventId`, altered content &rarr; `409 Conflict`):
```json
{
  "success": false,
  "message": "Event ID evt_guest_nav_001 already exists with differing immutable content"
}
```

### 6. Mock Payment Verification (Trusted Server Flow)
- **Endpoint**: `POST /api/payments/verify-mock`
- **Headers**: `Authorization: Bearer <jwt>`
- **Request Body**:
```json
{
  "paymentId": "pay_live_891274",
  "amount": 49.99,
  "currency": "USD",
  "method": "credit_card"
}
```
- **Response** (`201 Created` on first call, `200 OK` with `duplicate: true` on retry):
```json
{
  "success": true,
  "duplicate": false,
  "message": "Payment verified and recorded successfully",
  "data": {
    "eventId": "pay_evt_pay_live_891274",
    "type": "payment_completed",
    "payment": {
      "paymentId": "pay_live_891274",
      "amount": 49.99,
      "currency": "USD",
      "method": "credit_card",
      "status": "verified"
    },
    "occurredAt": "2026-10-12T10:15:00.000Z"
  }
}
```

### 7. Retrieve Chronological Journey Events
- **Endpoint**: `GET /api/events/journey`
- **Headers**: `Authorization: Bearer <jwt>` (or `x-guest-session-credential`)
- **Query Params**: `limit=50`
- **Response** (`200 OK`, sorted deterministically by `occurredAt ASC, eventId ASC`):
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "eventId": "evt_001",
      "type": "page_viewed",
      "occurredAt": "2026-10-12T10:00:00.000Z",
      "canonicalRoute": "2D Exercises"
    },
    {
      "eventId": "pay_evt_pay_live_891274",
      "type": "payment_completed",
      "occurredAt": "2026-10-12T10:15:00.000Z",
      "canonicalRoute": "Plans"
    }
  ]
}
```



## Module 3: Guest-to-User Journey Association

### 1. Architecture & Ownership Lifecycle

Module 3 stitches together pre-signup visitor activity with authenticated user identities into a unified chronological journey without copying, duplicating, or altering historical event records.

- **Unowned Initially**: When created, a guest session has `associatedUserId: null`.
- **Atomic Association**: An unowned session is associated with an authenticated user via an atomic conditional query (`findOneAndUpdate({ credentialHash, associatedUserId: null }, { $set: { associatedUserId } })`).
- **Idempotent Retries**: Repeated association attempts by the same user return `200 OK` with `associated: true` and `alreadyAssociated: true`.
- **Strict Cross-User Rejection**: If a user attempts to claim a guest session already owned by another user, the server rejects the request with `HTTP 409 Conflict` without transferring ownership.
- **Multi-Session Ownership**: One authenticated user may safely own multiple guest sessions (e.g., from multiple browsers, sessions, or visits). All associated guest sessions are resolved as part of the user's unified journey.
- **Zero Client Trust**: Association targets are derived strictly from server-validated authentication tokens (`req.user.id`), never from request bodies. Arbitrary `userId` fields in request payloads are ignored.
- **No Insecure Merging**: Identities are never merged based on IP address, browser fingerprint, or email submitted with an event.

---

### 2. Event History Preservation & Journey Resolution

1. **Zero Event Rewrites**: All historical Event documents retain their original `eventId`, `occurredAt`, `receivedAt`, `guestSessionId`, `type`, route, and source metadata. No events are deleted or duplicated into second collections.
2. **Unified Journey Resolution Helper** (`journeyService`):
   - **For Guests**: Resolves events associated with the active `guestSessionId`.
   - **For Authenticated Users**: Resolves the user's direct events (`userId`) combined with events from **all** associated guest sessions (`guestSessionId: { $in: guestSessionIds }`).
3. **Deterministic Chronological Sorting**: All journey events are ordered by `occurredAt ASC, eventId ASC` (never `receivedAt`).

---

### 3. API Endpoints & Examples

#### Associate Guest Session with User
- **Endpoint**: `POST /api/guest-sessions/associate`
- **Headers**: `Authorization: Bearer <jwt>` (or cookie `token`)
- **Request Body**:
```json
{
  "guestCredential": "e1a90c4f87b12d53c6a4802e9bc14238a8e10d29384a8bc93e472610ab56cd01"
}
```
- **Response** (`200 OK` — Initial Association):
```json
{
  "success": true,
  "message": "Guest session associated successfully",
  "data": {
    "associated": true,
    "alreadyAssociated": false,
    "guestSession": {
      "id": "670aa1b0e3f2b1897c5e2190",
      "associatedUserId": "670aa210e3f2b1897c5e2195",
      "createdAt": "2026-10-12T10:15:30.000Z",
      "expiresAt": "2026-11-11T10:15:30.000Z"
    }
  }
}
```
- **Response** (`200 OK` — Repeated Association by Same User):
```json
{
  "success": true,
  "message": "Guest session already associated with this user",
  "data": {
    "associated": true,
    "alreadyAssociated": true,
    "guestSession": {
      "id": "670aa1b0e3f2b1897c5e2190",
      "associatedUserId": "670aa210e3f2b1897c5e2195"
    }
  }
}
```
- **Response** (`409 Conflict` — Session Claimed by Another User):
```json
{
  "success": false,
  "message": "Guest session is already claimed by another user"
}
```

---

## Module 4: Journey Processing & Attribution

### 1. Architecture & Design Principles

Module 4 provides a reusable Journey Processing and Attribution engine that derives complete visitor timelines, canonical route mappings, first-source attribution, and independent milestone stages on-demand from existing event records.

- **On-Demand Calculation Without Data Duplication**: Historical events are never copied into secondary collections or merged via background mutations. Journey history is dynamically computed from MongoDB using unified identity resolution.
- **Unified Identity Resolution**:
  - **Guest-Only Journeys**: Unassociated guest sessions represent a single guest journey (`identityType: 'guest'`).
  - **Registered-User Journeys**: Authenticated users and all associated guest sessions represent a single logical user journey (`identityType: 'user'`).
  - **Associated Session Redirection**: If a request queries a guest session ID that has already been claimed by a user, the service automatically resolves to the owning user's journey. A claimed guest session **never** appears as an orphaned or separate journey.
  - **Zero Insecure Merging**: Identities are never merged based on IP address, browser fingerprint, or email submitted in an event. No session ownership is mutated during journey queries.
- **Deterministic Event Ordering**:
  - Events are strictly sorted by `occurredAt ASC, eventId ASC`.
  - Ordering reflects actual user interaction time (`occurredAt`), never ingestion time (`receivedAt`).
  - Duplicate deliveries share the same `eventId` and are deduplicated at ingestion, preserving individual navigation events even if canonical route labels match.

---

### 2. Activity Bounds & Delayed Event Handling

The service calculates journey boundaries dynamically from the complete resolved event history:
- `firstActivityAt`: The earliest event's `occurredAt` timestamp (ISO 8601 string or `null` if empty).
- `lastActivityAt`: The latest event's `occurredAt` timestamp (ISO 8601 string or `null` if empty).
- `uniqueEventCount`: The count of unique stored events in the journey (`Set(eventId).size`).

**Delayed Ingestion Rules**:
- Delayed events arriving out of order with an earlier `occurredAt` automatically expand `firstActivityAt`.
- Delayed events arriving with a later `occurredAt` automatically advance `lastActivityAt`.
- Network retries and duplicate transmissions do not inflate `uniqueEventCount`.
- Empty journeys are handled safely, returning `null` for activity bounds and `0` for count.

---

### 3. First-Source Attribution Algorithm

Attribution determines the initial marketing channel that brought the visitor to the platform:

1. **Qualifying Events**: Only events of type `short_link_opened` qualify for attribution.
2. **Deterministic Sequence**: Qualifying events are sorted chronologically by `occurredAt ASC, eventId ASC`.
3. **Earliest Attribution Credit**: The `source` metadata from the earliest qualifying event is assigned as `firstSource`.
4. **Missing Source Policy**:
   - If no `short_link_opened` event exists in the journey history, `firstSource` evaluates to `null`.
   - If the earliest qualifying `short_link_opened` event exists but contains no source (empty string, `null`, or undefined), `firstSource` evaluates to `null`.
   - The engine **never** silently substitutes a subsequent event's source when the earliest qualifying event lacks a source value.
5. **Channel Invariance**: Direct site visits, subsequent page views, or later short links can never overwrite the initial attributed source. Delayed earlier link-opening events correctly update attribution.

---

### 4. Canonical Route Normalization

The mapping service standardizes diverse URL paths across guest and authenticated dashboards into uniform human-readable labels:

| Original Route Pattern | Canonical Route Label |
| :--- | :--- |
| `/guest-dashboard/cad-practice/2d` | `2D Exercises` |
| `/user-dashboard/cad-practice/2d` | `2D Exercises` |
| `/guest-dashboard/cad-practice/3d` | `3D Exercises` |
| `/user-dashboard/cad-practice/3d` | `3D Exercises` |
| `/pricing` | `Plans` |
| Unknown / Unregistered routes | `null` (raw path preserved in `originalRoute`) |

- **Preservation of Raw URLs**: The browser path is always preserved in `originalRoute` for auditability and drill-down analysis.
- **Event Distinctness**: Two distinct visits to `/guest-dashboard/cad-practice/2d` and `/user-dashboard/cad-practice/2d` both map to `2D Exercises` but remain distinct events in the journey timeline.

---

### 5. Independent Journey Stage Calculation

Four milestone stages are evaluated independently across the entire resolved journey history:

- **Arrived**: Reached if the journey contains at least one `short_link_opened` event.
- **Explored**: Reached if the journey contains at least one `page_viewed` event.
- **Signed up**: Reached if the journey contains at least one `signup_completed` event.
- **Paid**: Reached **only** if the journey contains at least one verified `payment_completed` event (must have server-verified metadata: `paymentVerification.status === 'verified'` or `metadata.verified === true`).

**Rules**:
- Payment verification integrity: Browser-submitted or unverified payment events can **never** trigger the `Paid` stage.
- Independent & Non-Sequential: Stages do not need to occur in a specific order. Any combination of stages may be active simultaneously.
- Idempotent Stage Counting: Each journey counts at most once per stage in summary statistics.

---

### 6. Query Performance & Index Strategy

- **Zero N+1 Database Queries**: Resolves all guest session IDs belonging to an authenticated user in a single indexed query (`guestSessionRepository.findByUserId(userId)`).
- **Compound Index Utilization**: Journey event retrieval leverages Module 2 compound indexes:
  - `{ userId: 1, occurredAt: 1, eventId: 1 }`
  - `{ guestSessionId: 1, occurredAt: 1, eventId: 1 }`
- **Projection & Sensitive Data Shielding**: Database queries and response formatters strictly project out sensitive credentials (`credentialHash`, `passwordHash`, raw auth tokens).

---

### 7. API Endpoints & Response Examples

#### Get Normalized Journey Summary
- **Endpoint**: `GET /api/events/journey/summary`
- **Headers**:
  - `Authorization: Bearer <jwt>` (or cookie `token`) for authenticated users
  - OR `x-guest-session-credential: <credential>` for guests
- **Query Parameters**:
  - `includeTimeline=true` (optional, default `false`): Appends chronological event timeline.
  - `limit=100` (optional, default `100`, max `500`): Timeline pagination limit.
- **Response** (`200 OK` — Registered User with Historical Guest Activity):
```json
{
  "success": true,
  "data": {
    "journeyId": "670aa210e3f2b1897c5e2195",
    "identityType": "user",
    "firstActivityAt": "2026-10-12T09:00:00.000Z",
    "lastActivityAt": "2026-10-12T09:04:00.000Z",
    "firstSource": "youtube",
    "uniqueEventCount": 4,
    "stages": {
      "arrived": true,
      "explored": true,
      "signedUp": true,
      "paid": false
    },
    "guestSessionCount": 1
  }
}
```

---

### 8. Assumptions & Limitations

- **Clock Skew Bound**: Event `occurredAt` is client-supplied and validated at ingestion against a maximum 5-minute future threshold to prevent timestamp poisoning.
- **Explicit Identity Linking**: Unregistered guests who use private browsing or alternate devices without logging in remain separate guest journeys until explicitly associated.
- **Privacy Preservation**: No heuristic fingerprinting or IP matching is used for identity merging to avoid erroneous associations and maintain user privacy.

---

---

## Module 5: Admin Journey Dashboard

### 1. Architecture & Design Principles

Module 5 provides a high-performance, server-paginated administrator interface and reporting API that aggregates, attributes, and visualizes visitor journeys across the entire platform.

- **Unified Admin Dashboard UI**:
  - Located at `/admin/journeys`, protected by server-side authentication and role-based access control.
  - Displays real-time summary cards: **Total Journeys**, **Arrived**, **Explored**, **Signed Up**, and **Paid** (verified).
  - All summary metrics reflect the currently applied filters across the **complete filtered dataset**, never just the visible pagination page.
  - Each logical journey is counted at most once per milestone stage.
- **Backend-Powered Search & Filters**:
  - **Visitor Search**: Searches by synthetic user name, guest session ID, or canonical journey ID without downloading the full dataset to the client.
  - **UTC Date Range**: Interpreted strictly using UTC boundaries (inclusive: start of day `00:00:00.000Z` to end of day `23:59:59.999Z`).
  - **Inclusive Range Qualification**: A journey qualifies if at least one event occurred inside the selected date range. Once qualified, all activity bounds, attribution, event counts, and stage badges are calculated using its **complete event history**.
  - **Attribution Channel Filter**: Filters on the journey's initial marketing source (`firstSource`), powered by Module 4's deterministic attribution algorithm.
  - **Clear Filters**: Resets all active filter parameters and automatically returns pagination to page 1.
- **Server-Side Pagination & High Performance**:
  - Server-side cursor/skip pagination (`page`, `limit` [default 20, capped at 100], `total`, `totalPages`, `hasNextPage`, `hasPrevPage`).
  - Single-pass MongoDB aggregation pipeline without N+1 queries.
  - Avoids loading entire event collections into application memory.
- **Security & Authorization**:
  - Strict middleware guards: `authenticate` & `authorize('admin')`. Anonymous callers receive `401 Unauthorized`, and non-admin users receive `403 Forbidden`.
  - Input sanitization: Date validation rejects inverted or malformed dates (`400 Bad Request`). Search queries prevent ReDoS or query injection.
  - Zero sensitive credential exposure: Hashes, salts, and tokens are completely excluded from API responses.

---

### 2. Database Indexes Added

To support high-throughput admin queries and name searches, the following database index was added:

| Collection | Index Specification | Purpose & Justification |
| :--- | :--- | :--- |
| `User` | `{ name: 1 }` | Accelerates visitor search queries on synthetic user names without collection scans. |

This complements the existing indexes on `Event` (`{ occurredAt: 1, eventId: 1 }`, `{ userId: 1, occurredAt: 1, eventId: 1 }`, `{ guestSessionId: 1, occurredAt: 1, eventId: 1 }`) and `GuestSession` (`{ associatedUserId: 1 }`).

---

### 3. API Endpoint & Query Specification

#### GET `/api/admin/journeys`
Retrieves filtered and paginated visitor journeys with overall stage summaries.

- **Headers**:
  - `Authorization: Bearer <jwt>` (or cookie `token`) — **Requires `role: 'admin'`**
- **Query Parameters**:
  - `search` (string, optional): Search by user name or guest ID.
  - `startDate` (string, optional): Inclusive start date (`YYYY-MM-DD` or ISO string).
  - `endDate` (string, optional): Inclusive end date (`YYYY-MM-DD` or ISO string).
  - `source` (string, optional): First-source attribution channel (`youtube`, `google`, `facebook`, `none`, etc.).
  - `page` (number, optional, default `1`): Page number (min `1`).
  - `limit` (number, optional, default `20`, max `100`): Results per page.

#### Example Request:
```http
GET /api/admin/journeys?search=visitor&startDate=2026-10-01&endDate=2026-10-15&source=youtube&page=1&limit=20 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Admin journeys retrieved successfully",
  "data": {
    "journeys": [
      {
        "journeyId": "user_670aa210e3f2b1897c5e2195",
        "identityType": "user",
        "displayIdentity": "Visitor 1 Engineering",
        "firstActivityAt": "2026-10-02T09:00:00.000Z",
        "lastActivityAt": "2026-10-14T16:45:00.000Z",
        "firstSource": "youtube",
        "uniqueEventCount": 12,
        "stages": {
          "arrived": true,
          "explored": true,
          "signedUp": true,
          "paid": true
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 48,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    },
    "summaryMetrics": {
      "totalJourneys": 48,
      "arrived": 48,
      "explored": 46,
      "signedUp": 32,
      "paid": 18
    }---

## Module 6: Journey Details & Timeline

### 1. Architecture & Design Principles

Module 6 provides an administrator view for deep inspection of individual visitor journeys, tracking milestone progression and chronological event timelines across unauthenticated guest interactions and registered user accounts.

- **Frontend Route**: `/admin/journeys/:journeyId` accessible via the **View Details** action in the Module 5 Journey Dashboard.
- **Unified Logical Journey Resolution**:
  - Registered user journeys (`user_<id>`) unify all interactions performed under the user account along with all guest sessions associated with that user.
  - Guest journeys (`guest_<id>`) display interactions for that guest session.
  - **Claimed Guest Session Redirection**: If an admin opens a guest journey that has since been linked to a registered user (`associatedUserId !== null`), the service automatically resolves and renders the unified registered user journey, preventing fractured views.
- **Stage Progression Calculation**:
  - Independent milestone detection using Module 4's `journeyService`:
    - **Arrived**: Triggered by `short_link_opened`.
    - **Explored**: Triggered by `page_viewed`.
    - **Signed Up**: Triggered by `signup_completed`.
    - **Paid**: Triggered strictly by verified `payment_completed` events (browser payment events without verified server records are rejected).
  - Calculates and returns both boolean `reached` status and the exact timestamp (`reachedAt`) of the earliest qualifying event.
- **Deterministic Chronological Timeline**:
  - Ordered deterministically by `occurredAt ASC, eventId ASC` (secondary sort on `eventId` prevents unstable pagination ordering when timestamps are identical).
  - Preserves both canonical route labels (`2D Exercises`, `3D Exercises`, `Plans`) and the original client route.
  - Automatically deduplicates repeated events without mutating historical records.
- **Backend Timeline Pagination**:
  - Paginates timeline events with `page` and `limit` query parameters (default: 50, maximum: 100).
  - Summary metrics (`uniqueEventCount`, `firstActivityAt`, `lastActivityAt`, `firstSource`, `stages`, and `stageDetails`) are computed across the complete journey history, ensuring summary metrics never fluctuate between timeline pages.
- **Security & Secret Stripping**:
  - Protected with `authenticate` and `authorize('admin')` middleware. Non-admin requests receive HTTP 403 Forbidden; unauthenticated requests receive HTTP 401 Unauthorized.
  - Zero credential exposure: `passwordHash`, `credentialHash`, and raw session tokens are never returned in responses.

---

### 2. Module 6 API Specification

#### Single Journey Details API
- **Endpoint**: `GET /api/admin/journeys/:journeyId`
- **Query Parameters**:
  - `page` (optional, default: `1`): 1-indexed page number.
  - `limit` (optional, default: `50`, max: `100`): Events per page.
- **Headers**:
  - `Authorization: Bearer <admin_jwt>` OR Cookie `token=<admin_jwt>`
- **Example Request**:
  `GET /api/admin/journeys/user_670aa210e3f2b1897c5e2195?page=1&limit=50`
- **Example Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Journey details retrieved successfully",
  "data": {
    "journeyId": "user_670aa210e3f2b1897c5e2195",
    "identityType": "user",
    "displayIdentity": "Jane Visitor",
    "email": "jane@example.com",
    "firstActivityAt": "2026-10-12T09:00:00.000Z",
    "lastActivityAt": "2026-10-12T09:45:00.000Z",
    "firstSource": "youtube",
    "uniqueEventCount": 5,
    "stages": {
      "arrived": true,
      "explored": true,
      "signedUp": true,
      "paid": true
    },
    "stageDetails": {
      "arrived": { "reached": true, "reachedAt": "2026-10-12T09:00:00.000Z" },
      "explored": { "reached": true, "reachedAt": "2026-10-12T09:10:00.000Z" },
      "signedUp": { "reached": true, "reachedAt": "2026-10-12T09:30:00.000Z" },
      "paid": { "reached": true, "reachedAt": "2026-10-12T09:45:00.000Z" }
    },
    "associatedGuestSessionCount": 2,
    "associatedGuestSessions": [
      {
        "guestSessionId": "670aa1b0e3f2b1897c5e2190",
        "createdAt": "2026-10-12T08:55:00.000Z"
      },
      {
        "guestSessionId": "670aa1b0e3f2b1897c5e2191",
        "createdAt": "2026-10-12T09:15:00.000Z"
      }
    ],
    "timeline": [
      {
        "eventId": "evt_guest_1",
        "type": "short_link_opened",
        "occurredAt": "2026-10-12T09:00:00.000Z",
        "receivedAt": "2026-10-12T09:00:01.120Z",
        "canonicalRoute": "/pricing",
        "originalRoute": "/pricing?ref=youtube",
        "canonicalLabel": "Plans",
        "exerciseName": null,
        "source": "youtube",
        "paymentVerification": null,
        "metadata": {}
      },
      {
        "eventId": "evt_guest_2",
        "type": "page_viewed",
        "occurredAt": "2026-10-12T09:10:00.000Z",
        "receivedAt": "2026-10-12T09:10:02.050Z",
        "canonicalRoute": "/guest-dashboard/cad-practice/2d",
        "originalRoute": "/guest-dashboard/cad-practice/2d",
        "canonicalLabel": "2D Exercises",
        "exerciseName": null,
        "source": null,
        "paymentVerification": null,
        "metadata": {}
      },
      {
        "eventId": "evt_user_1",
        "type": "signup_completed",
        "occurredAt": "2026-10-12T09:30:00.000Z",
        "receivedAt": "2026-10-12T09:30:00.800Z",
        "canonicalRoute": "/register",
        "originalRoute": "/register",
        "canonicalLabel": null,
        "exerciseName": null,
        "source": null,
        "paymentVerification": null,
        "metadata": {}
      },
      {
        "eventId": "pay_evt_order_1001",
        "type": "payment_completed",
        "occurredAt": "2026-10-12T09:45:00.000Z",
        "receivedAt": "2026-10-12T09:45:01.000Z",
        "canonicalRoute": "/pricing",
        "originalRoute": "/pricing",
        "canonicalLabel": "Plans",
        "exerciseName": null,
        "source": null,
        "paymentVerification": {
          "status": "verified",
          "paymentId": "order_1001"
        },
        "metadata": {}
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 4,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. MongoDB Indexes Leveraged

Module 6 queries leverage existing database indexes:
- `{ userId: 1, occurredAt: 1, eventId: 1 }`: Fast timeline fetch for registered users.
- `{ guestSessionId: 1, occurredAt: 1, eventId: 1 }`: Fast timeline fetch for guest sessions.
- `{ occurredAt: 1, eventId: 1 }`: Deterministic chronological sort and tie-breaking.
- `{ associatedUserId: 1 }`: Fast retrieval of associated guest sessions for a user.

---

### 4. Seed Dataset Compatibility

A comprehensive seed generator is provided to populate realistic visitor behavior:
```powershell
npm run seed:journeys -w server
```

The generator seeds:
- At least **200 logical journeys** (split across registered users with multiple guest sessions and unassociated guest-only journeys).
- At least **10,000 realistic events** across diverse activity stages (`short_link_opened`, `page_viewed`, `exercise_started`, `signup_completed`, `payment_completed`).
- Diverse attribution channels (`youtube`, `google`, `facebook`, `linkedin`, `twitter`, `reddit`, direct).
- Delayed timestamps and simulated out-of-order event ingestion.


---

## Module 7: Mock Payment Verification

### 1. Architecture & Design Principles

Module 7 implements an end-to-end, safe, deterministic mock payment verification flow integrated into the visitor journey pipeline.

- **Zero Real Payment / PCI Scope**: The module is strictly a mock simulator. It collects no credit card numbers, CVVs, expiration dates, bank credentials, or payment secrets.
- **Server-Authoritative Pricing & Currencies**: The visitor selects a `planId` (`basic`, `starter`, `pro`, `enterprise`). The server enforces authoritative amounts and currency (`USD`) loaded from trusted server configuration (`MOCK_PLANS`). Any client-supplied `amount`, `currency`, or status overrides are discarded.
- **Controlled Mock Simulator**: Simulated payment attempts transition through deterministic outcomes (`success`, `failure`). The simulator never trusts client assertions (such as `success: true` or `verified: true`) and requires server-side validation against backend plan configurations.
- **Strict Ingestion Boundary**: The public browser event ingestion endpoint (`POST /api/events`) continues to reject `payment_completed` events with HTTP 400/403. Only trusted server-side execution triggered by verified mock payment flows creates `payment_completed` events.
- **Atomic Verification & Concurrency Safety**:
  - Payment attempts transition from `pending` to `succeeded` or `failed` atomically using MongoDB's find-and-modify semantics (`updateStatusAtomically`).
  - Concurrent requests trying to verify the same attempt run safely: exactly one caller executes the status transition and ingests the `payment_completed` event; concurrent duplicate calls receive an idempotent `200 OK` response with `alreadyFinalized: true`.
  - Conflicting state transitions (e.g. attempting to fail an already-succeeded attempt, or succeed an already-failed attempt) are rejected with `409 Conflict`.
- **Event Idempotency**:
  - Deterministic event IDs are generated on the server: `pay_evt_${paymentAttemptId}`.
  - Retried success simulations detect already-finalized succeeded attempts, verify the event in database, and return idempotent success without duplicating events or inflating journey metrics.
- **Journey Stage Integration**:
  - Ingestion of verified `payment_completed` updates the logical journey so that Module 4, Module 5 Admin Dashboard, and Module 6 Journey Timeline reflect the `Paid` stage.
  - Failed payments never create `payment_completed` and never mark the journey as `Paid`.

---

### 2. MongoDB Schema & Justified Indexes

The `MockPaymentAttempt` collection stores safe lifecycle data:

| Field | Type | Description |
| :--- | :--- | :--- |
| `paymentAttemptId` | String | Unique public identifier (`pay_att_<uuid>`). Indexed uniquely. |
| `userId` | ObjectId | Reference to `User` for authenticated visitors (optional). |
| `guestSessionId` | ObjectId | Reference to `GuestSession` for guest visitors (optional). |
| `planId` | String | Selected plan (`basic`, `starter`, `pro`, `enterprise`). |
| `planName` | String | Human-readable plan name. |
| `amount` | Number | Authoritative server-calculated amount in cents/units ($19.00 - $99.00). |
| `currency` | String | ISO 4217 currency code (`USD`). |
| `status` | String | Enum: `pending`, `succeeded`, `failed`. |
| `verificationReference` | String | Internal mock reference string (`mock_vref_<uuid>`). Never sensitive. |
| `verifiedAt` | Date | Timestamp of server verification (null if pending/failed). |
| `failureReason` | String | Error description if status is `failed`. |
| `metadata` | Object | Safe context (e.g. outcome simulation, flow markers). |

#### Justified Indexes:
| Index Specification | Purpose & Justification |
| :--- | :--- |
| `{ paymentAttemptId: 1 }` (unique) | Fast lookup and atomic uniqueness guarantee for payment attempt queries. |
| `{ userId: 1, createdAt: -1 }` | Fast retrieval of user payment history and journey authorization checks. |
| `{ guestSessionId: 1, createdAt: -1 }` | Fast retrieval of guest session payment attempts and ownership checks. |
| `{ status: 1, createdAt: -1 }` | Supports reconciliation and administrative status aggregation. |

---

### 3. API Endpoints & Examples

#### 1. List Available Mock Plans
- **Endpoint**: `GET /api/mock-payments/plans`
- **Authentication**: Public
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Available mock plans fetched successfully",
  "plans": [
    { "id": "basic", "name": "Basic CAD", "amount": 1900, "currency": "USD", "features": ["2D CAD Drafting", "Export DXF/DWG"] },
    { "id": "starter", "name": "CAD Starter", "amount": 2900, "currency": "USD", "features": ["2D/3D Practice", "Interactive Exercises"] },
    { "id": "pro", "name": "CAD Pro", "amount": 4900, "currency": "USD", "features": ["All Exercises", "Parametric Modeling", "Priority Review"] },
    { "id": "enterprise", "name": "Enterprise CAD", "amount": 9900, "currency": "USD", "features": ["Full Team Access", "API Integration", "Dedicated Support"] }
  ]
}
```

#### 2. Create Mock Payment Attempt
- **Endpoint**: `POST /api/mock-payments`
- **Authentication**: JWT token or `x-guest-session-credential`
- **Request Body**:
```json
{
  "planId": "pro"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "message": "Mock payment attempt initiated successfully",
  "paymentAttempt": {
    "paymentAttemptId": "pay_att_83df82aa-0bb2-411a-9ee0-d2b512ea2c15",
    "planId": "pro",
    "planName": "CAD Pro",
    "amount": 4900,
    "currency": "USD",
    "status": "pending",
    "createdAt": "2026-10-12T12:00:00.000Z"
  }
}
```

#### 3. Simulate and Verify Mock Payment Result
- **Endpoint**: `POST /api/mock-payments/:paymentAttemptId/simulate`
- **Authentication**: Attempt owner or Admin
- **Request Body** (Simulate Success):
```json
{
  "outcome": "success"
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Mock payment succeeded and verified successfully",
  "paymentAttempt": {
    "paymentAttemptId": "pay_att_83df82aa-0bb2-411a-9ee0-d2b512ea2c15",
    "planId": "pro",
    "planName": "CAD Pro",
    "amount": 4900,
    "currency": "USD",
    "status": "succeeded",
    "verifiedAt": "2026-10-12T12:00:05.000Z"
  },
  "event": {
    "eventId": "pay_evt_pay_att_83df82aa-0bb2-411a-9ee0-d2b512ea2c15",
    "type": "payment_completed",
    "canonicalRoute": "/pricing",
    "canonicalLabel": "Plans"
  }
}
```

- **Request Body** (Simulate Failure):
```json
{
  "outcome": "failure",
  "reason": "insufficient_funds"
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Mock payment simulation completed with failure",
  "paymentAttempt": {
    "paymentAttemptId": "pay_att_83df82aa-0bb2-411a-9ee0-d2b512ea2c15",
    "status": "failed",
    "failureReason": "insufficient_funds"
  }
}
```

#### 4. Read Payment Attempt Status
- **Endpoint**: `GET /api/mock-payments/:paymentAttemptId`
- **Authentication**: Attempt owner or Admin
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Payment attempt fetched successfully",
  "paymentAttempt": {
    "paymentAttemptId": "pay_att_83df82aa-0bb2-411a-9ee0-d2b512ea2c15",
    "planId": "pro",
    "planName": "CAD Pro",
    "amount": 4900,
    "currency": "USD",
    "status": "succeeded",
    "verifiedAt": "2026-10-12T12:00:05.000Z"
  }
}
```

---

## Setup & Running

### 1. Install & Configure Environment
```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Ensure MongoDB is reachable at `mongodb://127.0.0.1:27017` or update `MONGODB_URI` in `server/.env`.
Set a local `JWT_SECRET` and `ADMIN_PASSWORD` in `server/.env` before starting the server. On Windows, if MongoDB is installed as a service but stopped, run `Start-Service MongoDB` in an elevated PowerShell window.

### 2. Seeding an Initial Admin User & Dataset
```powershell
# Seed administrator account
npm run seed:admin -w server

# Seed full dataset (>= 200 journeys, >= 10,000 events)
npm run seed

# Reset and reseed test collections safely (guarded against production)
npm run seed:reset
```
*Note: Admin configured via `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `server/.env`.*

To keep your working data separate from assessment fixtures, set `MONGODB_URI=mongodb://127.0.0.1:27017/cadin360_assignment_demo` in a separate shell before running `npm run seed` and `npm run explain`. The database connection uses the database name in the URI. The latest demo run had 10,950 events and 250 journeys.

### 3. Inspecting MongoDB Query Plans
```powershell
# Run real explain("executionStats") on the current seeded dataset
npm run explain
```

### 4. Start Development Servers
```powershell
npm run dev
```
- Client runs at: `http://localhost:5173`
- Server API runs at: `http://localhost:5000`

---

## Module 8: Testing, Seed Data & Query Performance

### 1. Deterministic Seed Dataset Breakdown
Generated and verified using `npm run seed:reset` against live MongoDB:

| Metric | Database Count | Assessment Requirement | Status |
| :--- | :---: | :---: | :---: |
| **Total Events in Database** | **10,713** | &gt;= 10,000 events | **Met (+713)** |
| **Total Registered Users** | **140** | — | **Met** |
| **Total Guest Sessions** | **300** | — | **Met** |
| **Associated Guest Sessions** | **190** | — | **Met** |
| **Unassociated Guest Sessions** | **110** | — | **Met** |
| **Total Logical Journeys** | **250** | &gt;= 200 journeys | **Met (+50)** |
| **Mock Payment Attempts** | **103** | — | **Met** |
| **Stage: Arrived** | **172** | Realistic distribution | **Met** |
| **Stage: Explored** | **250** | Realistic distribution | **Met** |
| **Stage: Signed Up** | **140** | Realistic distribution | **Met** |
| **Stage: Paid** | **82** | Realistic distribution | **Met** |

---

### 2. Database Indexes & Measured Query Plans (`explain("executionStats")`)

All indexes are justified by query patterns and verified on live MongoDB collection containing **10,713 events**:

| Query Pattern & Purpose | Index Used | Docs Examined | Docs Returned | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| **1. User Journey Timeline**<br>`{ userId: ObjectId }`<br>`SORT { occurredAt: 1, eventId: 1 }` | `userId_1_occurredAt_1_eventId_1` | 36 | 36 | **1 ms** |
| **2. Guest Journey Timeline**<br>`{ guestSessionId: ObjectId }`<br>`SORT { occurredAt: 1, eventId: 1 }` | `guestSessionId_1_occurredAt_1_eventId_1` | 25 | 25 | **0 ms** |
| **3. Dashboard Date Range & Sort**<br>`{ occurredAt: { $gte, $lte } }`<br>`SORT { occurredAt: 1, eventId: 1 } LIMIT 50` | `occurredAt_1_eventId_1` | 50 | 50 | **0 ms** |
| **4. Mock Payment Attempt Lookup**<br>`{ paymentAttemptId: String }` | `paymentAttemptId_1` | 1 | 1 | **0 ms** |

---

### 3. API Collection & Request Examples

The production API collection is provided at [`cadin360.postman_collection.json`](./cadin360.postman_collection.json) containing pre-configured requests and environments for:
- Guest Session Creation (`POST /api/guest-sessions`)
- User Registration (`POST /api/auth/signup`)
- User Login (`POST /api/auth/login`)
- Guest Session Association (`POST /api/guest-sessions/associate`)
- Event Ingestion (`POST /api/events`)
- Idempotent Event Retry (`POST /api/events` duplicate)
- Conflicting Event ID (`POST /api/events` 409 Conflict)
- Browser Payment Rejection (`POST /api/events` rejection)
- Mock Plan Listing (`GET /api/mock-payments/plans`)
- Mock Payment Attempt Creation (`POST /api/mock-payments`)
- Mock Payment Success & Failure Simulation (`POST /api/mock-payments/:id/simulate`)
- Read Payment Status (`GET /api/mock-payments/:id`)
- Admin Journey Dashboard (`GET /api/admin/journeys`)
- Admin Journey Details & Timeline (`GET /api/admin/journeys/:id`)

---

## Automated Test Coverage

The test suite provides complete automated test coverage across server and client:

```powershell
# Run full suite (server + client)
npm test

# Run server tests only (124 tests across unit and Modules 1–7)
npm run test -w server

# Run unit tests only (7 pure unit tests for journey attribution & normalization)
npm run test:unit -w server

# Run server integration tests only (117 tests across Modules 1–7)
npm run test:integration -w server

# Run client tests only (14 tests across Auth, Home, AdminDashboard, JourneyDetails, and Plans)
npm run test -w client
```

### Verified Test Specs:

#### Unit Tests: Journey Attribution & Stage Rules (7 Tests)
1. **Route normalization**: Validates canonical alias mappings (`2D Exercises`, `3D Exercises`, `Plans`), cleans query parameters and hashes, safely handles unknown routes.
2. **Stage independence & payment verification**: Ensures Arrived, Explored, Signed Up, and Paid are calculated independently; verifies that unverified payments never mark Paid.
3. **Stage details timestamps**: Provides accurate `reachedAt` ISO timestamps for each qualifying stage.
4. **Activity bounds & duplicate protection**: First and last timestamps derived accurately; duplicate event deliveries sharing `eventId` do not inflate unique count.
5. **First source attribution policy**: Uses earliest `short_link_opened`; if source is null, never substitutes later event.
6. **Deterministic sorting & tie-breaking**: Events with identical `occurredAt` timestamps strictly tie-break on `eventId` ascending.
7. **Module 4 / Section 10 regression scenario**: Verifies 09:00 YouTube delayed, 09:01 duplicated 2D, 09:03 signup, and 09:04 user 2D resolves to 1 journey, 4 unique events, first source YouTube, and Paid false.

#### Authentication and guest sessions (14 server tests)
1. **Guest session creation**: Returns raw 64-character unguessable credential, verifies SHA-256 hash in database, ensures hashes are never exposed in API output.
2. **Successful signup & password hashing**: Email normalization, bcrypt hashing verification, safe user profile returned.
3. **Duplicate email rejection**: Rejects duplicate emails with HTTP 409 Conflict.
4. **Successful & unsuccessful login**: Generic error message (`Invalid email or password`) to prevent email enumeration.
5. **Access to `/api/auth/me`**: HTTP 401 for unauthenticated/tampered requests, HTTP 200 with safe profile for valid tokens.
6. **Public signup cannot create admin**: Ignores arbitrary `role: 'admin'` submitted in signup body, forcing `user` role.
7. **Guest history association during signup**: Atomic association attaching guest session to newly registered user ID.
8. **Repeated association with the same user**: Safe and idempotent.
9. **A second user cannot claim an already-owned guest session**: Rejects with HTTP 409 Conflict.
10. **Zero hash exposure**: Ensures `passwordHash` and `credentialHash` are never leaked across any endpoint.

#### Event tracking and ingestion (14 server tests)
1. **Valid guest event saved**: Ingests `page_viewed` with canonical route mapping (`/guest-dashboard/cad-practice/2d` &rarr; `2D Exercises`).
2. **Valid authenticated-user event saved**: Automatically associates event with authenticated `userId`.
3. **Unsupported event types rejected**: Rejects unknown event types with HTTP 400.
4. **Missing or invalid timestamps rejected**: Rejects malformed strings and excessive future timestamps (> 5 min skew).
5. **Invalid routes and excessive lengths rejected**: Enforces route format rules and field length bounds (`maxlength: 256`).
6. **Identical retry duplicate handling**: Returns `200 OK` with `duplicate: true` without duplicating database records.
7. **Conflicting event ID retry rejected**: Rejects altered content for an existing `eventId` with HTTP 409 Conflict.
8. **Concurrent identical requests**: Guarantees atomic insertion where multiple parallel requests produce exactly one stored record.
9. **Guest session cross-user protection**: Forbids authenticated users from writing events to another user's guest session (HTTP 403 Forbidden).
10. **Browser payment rejection**: Rejects browser `payment_completed` requests with HTTP 403 Forbidden even with `verified: true`.
11. **Trusted mock payment verification**: Validates and records trusted `payment_completed` event with deterministic ID (`pay_evt_${paymentId}`).
12. **Mock payment duplicate idempotency**: Repeated verification returns HTTP 200 with `duplicate: true`.
13. **Chronological sorting tie-breaker**: Verifies deterministic query ordering by `occurredAt ASC, eventId ASC`.
14. **Client-supplied identity stripping**: Ignores forged client-submitted `userId` and `role` fields.

#### Guest-to-user journey association (15 server tests)
1. **Valid unowned guest session associated**: Authenticated user claims unowned session via `POST /api/guest-sessions/associate`.
2. **Guest historical events preserved**: Original `eventId`, `occurredAt`, `receivedAt`, type, source, and routes remain unchanged.
3. **Repeated association by same user**: Idempotent success returning `alreadyAssociated: true` without creating duplicate events.
4. **One user can own multiple guest sessions**: User associates multiple distinct guest sessions; all are linked to that user.
5. **Cross-user claim rejected**: Second user attempting to claim first user's session receives HTTP 409 Conflict.
6. **Concurrent claims by two users**: Simultaneous atomic claim attempts ensure exactly one user succeeds and the other receives 409 Conflict.
7. **Invalid guest credential rejected**: Rejects missing or non-existent credentials with appropriate 400 / 404 status codes.
8. **Unauthenticated caller rejected**: Unauthenticated request to `/api/guest-sessions/associate` rejected with HTTP 401.
9. **Request body user forging prevented**: Client cannot forge target user by passing `userId` in request body.
10. **Signup with guest credential**: Validates and links guest session during user registration.
11. **Login with guest credential**: Authenticates user first, then associates guest session.
12. **Signup/login without guest credential**: Default authentication continues to work normally.
13. **Failed association never falsely reports success**: Failed claim rolls back user creation and propagates 409 Conflict.
14. **Unified journey event retrieval**: `GET /api/events/journey` retrieves guest history and user events chronologically.
15. **Event preservation under repeated calls**: Repeated associations never delete or duplicate historical events.

#### Journey processing and attribution (21 server tests)
1. **Guest without account**: Resolves to exactly one guest journey with all guest events.
2. **Registered user with single guest session**: Resolves to one combined user journey.
3. **Registered user with multiple guest sessions**: Resolves to one combined journey containing all sessions' events.
4. **Associated guest session redirection**: Claimed guest session never appears as a separate journey; redirects to owner.
5. **Historical events inclusion**: Both guest and user historical events are fully included.
6. **Chronological sorting**: Strict ordering by `occurredAt ASC, eventId ASC`.
7. **Activity bounds with delayed events**: Delayed events update `firstActivityAt` and `lastActivityAt` dynamically.
8. **Earliest short link source attribution**: Earliest `short_link_opened` determines `firstSource`.
9. **Delayed earlier source event**: Dynamically changes attribution to earlier qualifying source.
10. **Later direct visit**: Never overwrites initial short link attribution.
11. **Missing link opening event**: Evaluates safely to `firstSource: null`.
12. **Missing source on earliest event**: Returns `null` without silently substituting a later event's source.
13. **Route normalization**: 2D, 3D, and pricing route aliases correctly map to canonical labels.
14. **Original route preservation**: Original path is preserved in `originalRoute`.
15. **Distinct navigation events**: Preserved individually even when canonical labels match.
16. **Independent stage calculation**: Arrived, Explored, Signed up, and Paid evaluated independently.
17. **Payment verification protection**: Unverified payment events cannot trigger `Paid` stage.
18. **Unique event count**: Duplicate/retried events do not inflate count.
19. **Safe empty journeys**: Returns safe default bounds (`null` timestamps, 0 count, all stages `false`).
20. **Sensitive data protection**: Credentials, hashes, and internal tokens are never exposed in summaries or timelines.
21. **Section 10 End-to-End Scenario**: Complete flow (delayed YouTube event, 2D exploration, signup, user 2D visit, retried navigation) resolves to exactly 1 user journey, 4 unique events, first source YouTube, distinct 2D visits, Arrived/Explored/Signed up reached, and Paid false.

#### Admin journey dashboard (15 server tests)
1. **Anonymous rejection**: Anonymous requests rejected with HTTP 401 Unauthorized.
2. **Non-admin rejection**: Non-admin users rejected with HTTP 403 Forbidden.
3. **Admin authorization**: Valid admin JWT granted access with HTTP 200 OK.
4. **Search by user name**: Case-insensitive search on synthetic user names.
5. **Search by guest ID**: Fast lookup matching guest session identifiers.
6. **UTC date boundary inclusivity**: Strict UTC start and end-of-day boundary evaluation.
7. **Date range journey qualification**: Journeys qualify if at least one event falls within the date window.
8. **Complete history retention**: Qualified journeys calculate metrics using their complete event history.
9. **First-source attribution filtering**: Filters strictly by initial marketing source according to Module 4 attribution logic.
10. **Duplicate delivery idempotency**: Duplicate/retried events do not inflate journey event counts.
11. **Associated session deduplication**: Associated guest sessions never appear as duplicate or orphaned journeys.
12. **Global summary metrics**: Summary cards computed across the full filtered dataset, not just the visible page.
13. **Server-side pagination**: Correct page, limit, total pages, and navigation boolean metadata.
14. **Safe filter and bound handling**: Inverted dates return 400; negative pages or limits safely bounded.
15. **Safe empty results**: Clean empty results and total metrics when no records match.

#### Journey details and timeline (17 server tests)
1. **Admin journey access**: Admin can access journey details (`200 OK`) with complete summary and timeline.
2. **Anonymous rejection**: Anonymous callers rejected (`401 Unauthorized`).
3. **Non-admin rejection**: Authenticated regular users rejected (`403 Forbidden`).
4. **Invalid journey ID handling**: Safely handles empty/malformed IDs with HTTP 400 Bad Request.
5. **Unknown journey 404**: Safely returns HTTP 404 Not Found for non-existent users/sessions.
6. **Guest-only journey timeline**: Accurately retrieves events for an unassociated guest session.
7. **Registered user journey unification**: Unifies user events and historical associated guest sessions into one logical journey.
8. **Multiple associated guest sessions**: Accurately aggregates events across multiple linked guest sessions for one registered user.
9. **Duplicate event prevention**: Duplicate event deliveries sharing `eventId` appear only once on the timeline.
10. **Deterministic ordering**: Sorted strictly by `occurredAt ASC, eventId ASC`.
11. **Delayed event positioning**: Delayed events are positioned at their exact chronological spot based on `occurredAt`.
12. **Canonical route labels**: Correctly displays aliases (`2D Exercises`, `3D Exercises`, `Plans`) alongside original routes.
13. **Full history summary counts**: Summary metrics (`uniqueEventCount`) represent the complete logical journey even when paginated.
14. **Full history stage status**: Stages are derived from complete history independent of the current timeline page.
15. **Unverified payment rejection**: Browser events without server verification cannot trigger the `Paid` stage.
16. **Timeline pagination accuracy**: Correct pagination metadata (`page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPrevPage`).
17. **Zero secret exposure**: Passwords, credential hashes, and internal tokens are never leaked in API output.

#### Mock payment verification (17 server tests)
1. **Valid plan creates pending attempt**: Returns safe attempt details with `pending` status.
2. **Invalid plan rejection**: Rejects unknown plan identifier with HTTP 400 Bad Request.
3. **Authoritative pricing**: Server ignores client-supplied `amount` and `currency` overrides.
4. **Unauthorized access rejection**: Anonymous callers receive HTTP 401 Unauthorized.
5. **Ownership enforcement**: One visitor cannot access or simulate another visitor's payment attempt (HTTP 403 Forbidden).
6. **Verified mock success produces event**: Transition to `succeeded` ingests exactly one `payment_completed` event.
7. **Verified mock failure produces NO event**: Transition to `failed` records reason and leaves event log untouched.
8. **Browser ingestion boundary**: Browser `POST /api/events` strictly rejects `payment_completed` directly (HTTP 400).
9. **Client `success: true` bypass rejected**: Passing `success: true` in request body without valid outcome cannot force success.
10. **Client `verified: true` bypass rejected**: Passing `verified: true` in request body without valid outcome cannot force success.
11. **Repeated successful requests idempotency**: Duplicate success simulation calls return 200 OK without creating duplicate events.
12. **Concurrent success requests safety**: Parallel concurrent simulation calls produce at most one `payment_completed` event.
13. **Finalized attempt conflict rejection**: Conflicting transitions against finalized attempts return HTTP 409 Conflict.
14. **Failed payment keeps Paid false**: Failed attempt does not mark journey stages as Paid.
15. **Verified payment marks Paid true**: Journey processing service correctly updates visitor journey stage to `paid: true`.
16. **Admin dashboard & timeline integration**: Verified payment events render correctly in admin journey views and timelines.
17. **Zero sensitive data exposure**: Responses exclude verification secrets, internal tokens, and credentials.

#### Client Tests (14 Tests across 5 suites)
- Interactive event triggers, guest credential generation, auth modal toggling, backend message toasts, journey overview card, admin dashboard access control, summary cards, live journey stream rendering, Journey Details timeline inspection, and Plans page mock payment simulation.

---

### Final Submission Checklist Reference
See [`SUBMISSION.md`](./SUBMISSION.md) for the complete assessment submission checklist, verified query plans, and disclosures.

---

### Assumptions & Known Limitations

- **Event Immutability**: Historical events are immutable once ingested. Editing or deleting past events is unsupported by design.
- **Client Clock Skew**: Timestamps with a forward clock skew exceeding 5 minutes are rejected during ingestion (`MAX_FUTURE_TOLERANCE_MS`).
- **Payment Verification**: Only server-verified payment events created through internal webhooks or trusted verification endpoints are recognized for the `Paid` milestone.
- **Mock Simulator Scope**: The payment verification service is designed for testing and assessment; it does not implement third-party webhook signature verification (e.g., Stripe Webhook Secrets or PayPal IPN) nor does it interact with real banking networks.





