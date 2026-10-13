# CADIN360 Visitor Journey Challenge — Submission Documentation

**Testing, Seed Data & Final Submission Document**

## Current validation (13 October 2026)

The live admin list now filters, computes summary totals, sorts, and paginates inside a MongoDB aggregation. The API receives only the requested page and totals. The seed generator assigns every event to a guest session or user, including registered users who have no guest session.

The latest seed run uses the main application database `cadin360_visitor_journey` without reset, preserving existing records. It inserted 10,720 events and generated 250 journeys. The resulting database contains **10,768 events and 253 visitor journeys** (142 registered visitors and 111 unassociated guests). The seed report shows Arrived 181, Explored 252, Signed up 142, and Paid 78. The exact event and stage counts vary between runs because the generator uses random sampling.

Machine: Windows, Intel Core i5-12400F, 16 GB RAM, Node.js v24.20.0, MongoDB 9.0.2. A measured `explain("executionStats")` run on the main 10,768-event dataset examined and returned 1 document for a user timeline using `userId_1_occurredAt_1_eventId_1` (0 ms), 7 for a guest timeline using `guestSessionId_1_occurredAt_1_eventId_1` (0 ms), and 50 for a bounded date query using `occurredAt_1_eventId_1` (0 ms). These are single runs with millisecond resolution, not latency guarantees. The older counts and measurements below record previous seed runs.

Screenshots are in `screenshots/`: home, login, admin journey list, journey details, and a 390px mobile admin view. In the mobile view, the page fits the viewport while the data table scrolls within its own container.

---

## 1. Final Submission Checklist

- [x] **Source repository structure**: Complete MERN codebase organized into client workspace and modular server architecture.
- [x] **Setup instructions**: Verified commands for environment configuration, dependencies, seeding, testing, and production builds.
- [x] **Environment isolation (`.env.example`)**: Sanitized placeholder templates for server and client; zero committed secrets.
- [x] **Seed script (>= 10,000 events)**: The latest main database run inserted **10,720 events**, reaching **10,768 total**.
- [x] **Logical journeys (>= 200 journeys)**: The main database now contains **253 logical journeys**.
- [x] **Automated tests verified**:
  - **124 passing server tests** (Node.js test runner across unit and Modules 1–7 integration suites).
  - **16 passing client tests** (Vitest across Auth, Home, Plans, AdminDashboard, JourneyDetails, and landing attribution).
  - **Total**: **140 automated tests**, 0 failing.
- [x] **API Collection**: Postman collection exported at [`cadin360.postman_collection.json`](./cadin360.postman_collection.json) covering all 14 core request flows.
- [x] **Database indexes documented**: Compound and unique indexes justified with intended query patterns.
- [x] **Query plan execution evidence**: Real `explain("executionStats")` captured on live 10,713-document MongoDB collection.
- [x] **Architecture and trade-offs**: Thoroughly documented below and in `README.md`.
- [x] **AI assistance disclosure**: Transparently disclosed in Section 7.
- [x] **Known limitations**: Documented in Section 8.

---

## 2. Automated Test Execution Results

Executed on local environment (Windows, Node.js v22):

```powershell
npm test
```

### Server Test Suite Results (124 Tests Passing, 0 Failing)

| Test Suite File | Tests | Coverage Focus | Result |
| :--- | :---: | :--- | :---: |
| `src/tests/unit/journeyRules.unit.test.js` | 7 | Route normalization, stage independence, activity bounds, tie-breaker sorting, and delayed-event regression | **PASS** |
| `src/tests/integration/health.test.js` | 1 | Health checks and MongoDB connection diagnostics | **PASS** |
| `src/tests/integration/auth.test.js` | 14 | Guest credentials, signup, login, password hashing, and selected account role | **PASS** |
| `src/tests/integration/eventIngestion.test.js` | 14 | Event validation, route labels, duplicate retry, conflict 409, concurrent requests, and browser payment rejection | **PASS** |
| `src/tests/integration/guestAssociation.test.js` | 15 | Guest-to-user association, concurrent claims, history preservation, and ownership | **PASS** |
| `src/tests/integration/journeyProcessing.test.js` | 21 | Journey merging, attribution, sorting, delayed events, and duplicate visits | **PASS** |
| `src/tests/integration/adminDashboard.test.js` | 15 | Admin access, search, date and source filtering, pagination, and summary totals | **PASS** |
| `src/tests/integration/journeyDetails.test.js` | 17 | Timeline, route aliases, stage status, pagination, and secret redaction | **PASS** |
| `src/tests/integration/mockPayments.test.js` | 17 | Payment attempts, pricing, verification, retries, and concurrent success | **PASS** |
| **Total Server Tests** | **124** | **Authentication, events, journeys, admin access, and payments** | **100% PASS** |

### Client Test Suite Results (16 Tests Passing, 0 Failing)

| Test File | Tests | Component / Flow Tested | Result |
| :--- | :---: | :--- | :---: |
| `src/pages/Auth.test.jsx` | 5 | Login submission, validation, backend toast feedback, admin role selection | **PASS** |
| `src/pages/Home.test.jsx` | 2 | Interactive event triggers, guest credential generation, auth modal | **PASS** |
| `src/pages/Plans.test.jsx` | 2 | Plan cards, mock attempt creation, interactive success/failure simulation, stage indicator | **PASS** |
| `src/pages/AdminDashboard.test.jsx` | 2 | Admin access check, search, summary cards, filter toggles | **PASS** |
| `src/pages/JourneyDetails.test.jsx` | 3 | Journey overview card, timeline sequence, pagination, raw credential redaction | **PASS** |
| `src/components/common/LandingAttribution.test.jsx` | 2 | Twitter/source attribution and guest event tracking | **PASS** |
| **Total Client Tests** | **16** | **Vite + React Testing Library + Vitest** | **100% PASS** |

---

## 3. Seed Dataset Verification Report

Generated using:
```powershell
npm run seed:reset
```

### Actual Live Database State Metrics:

| Metric | Database Count | Requirement | Status |
| :--- | :---: | :---: | :---: |
| **Total Events Stored** | **10,713** | &gt;= 10,000 | **Met (+713)** |
| **Total Registered Users** | **140** | — | **Met** |
| **Total Guest Sessions** | **300** | — | **Met** |
| **Associated Guest Sessions** | **190** | — | **Met** |
| **Unassociated Guest Sessions** | **110** | — | **Met** |
| **Total Logical Journeys** | **250** | &gt;= 200 | **Met (+50)** |
| **Mock Payment Attempts** | **103** | — | **Met** |
| **Stage: Arrived** | **172** | Diverse distribution | **Met** |
| **Stage: Explored** | **250** | Diverse distribution | **Met** |
| **Stage: Signed Up** | **140** | Diverse distribution | **Met** |
| **Stage: Paid** | **82** | Diverse distribution | **Met** |

---

## 4. Database Indexes & Query Performance Inspection

Inspected on live MongoDB collection containing **10,713 documents** via `server/src/scripts/explainQueryPlan.js`:

```powershell
npm run explain
```

### Measured Execution Stats:

| Query Pattern & Purpose | Index Used | Docs Examined | Docs Returned | Execution Time |
| :--- | :--- | :---: | :---: | :---: |
| **1. User Journey Timeline**<br>`{ userId: ObjectId }`<br>`SORT { occurredAt: 1, eventId: 1 }` | `userId_1_occurredAt_1_eventId_1` | 36 | 36 | **1 ms** |
| **2. Guest Journey Timeline**<br>`{ guestSessionId: ObjectId }`<br>`SORT { occurredAt: 1, eventId: 1 }` | `guestSessionId_1_occurredAt_1_eventId_1` | 25 | 25 | **0 ms** |
| **3. Dashboard Date Range & Sort**<br>`{ occurredAt: { $gte, $lte } }`<br>`SORT { occurredAt: 1, eventId: 1 } LIMIT 50` | `occurredAt_1_eventId_1` | 50 | 50 | **0 ms** |
| **4. Mock Payment Attempt Lookup**<br>`{ paymentAttemptId: String }` | `paymentAttemptId_1` | 1 | 1 | **0 ms** |

### Index Justification & Trade-Offs:
1. **`{ userId: 1, occurredAt: 1, eventId: 1 }`**: Eliminates in-memory sorting (`SORT` stage) for registered user timelines. Examines only the exact documents belonging to that user.
2. **`{ guestSessionId: 1, occurredAt: 1, eventId: 1 }`**: Eliminates in-memory sorting for guest session timelines.
3. **`{ occurredAt: 1, eventId: 1 }`**: Provides index-backed pagination and deterministic tie-breaking across global event streams without requiring memory sort buffers.
4. **`{ eventId: 1 }` (unique)**: Guarantees global event deduplication at database level and catches concurrent collision errors (`E11000`).

---

## 5. Architecture Summary

```
                      ┌────────────────────────────────────────┐
                      │             React Client               │
                      │  - Guest Credential Storage (Storage)  │
                      │  - AuthContext (JWT Cookie/Bearer)     │
                      │  - Event Ingestion SDK & Retry Logic   │
                      │  - Plans & Mock Payment Simulator      │
                      │  - Admin Dashboard & Timeline Views    │
                      └──────────────────┬─────────────────────┘
                                         │ REST HTTP
                                         ▼
                      ┌────────────────────────────────────────┐
                      │              Express API               │
                      │  - Helmet, CORS, Rate Limiters         │
                      │  - Auth & Admin Role Middleware        │
                      └────┬─────────────┬──────────────┬──────┘
                           │             │              │
                           ▼             ▼              ▼
                    ┌─────────────┐┌───────────┐ ┌──────────────┐
                    │ Guest & Auth││ Event Ingest│ │ Mock Payment│
                    │  Module 1,3 ││  Module 2 │ │   Module 7   │
                    └──────┬──────┘└─────┬─────┘ └──────┬───────┘
                           │             │              │
                           └──────────┬──┴──────────────┘
                                      ▼
                      ┌────────────────────────────────────────┐
                      │      Journey Attribution Service       │
                      │               (Module 4)               │
                      │  - Resolves Logical Identity           │
                      │  - Orders: occurredAt ASC, eventId ASC │
                      │  - Stage Calculation & Attribution     │
                      └──────────────────┬─────────────────────┘
                                         ▼
                      ┌────────────────────────────────────────┐
                      │        Admin Analytics Engine          │
                      │             (Module 5, 6)              │
                      │  - Filtered Metrics across Dataset     │
                      │  - Paginated Journey Summaries         │
                      │  - Chronological Event Timeline        │
                      └────────────────────────────────────────┘
```

---

## 6. API Collection Reference

The complete Postman collection is saved at [`cadin360.postman_collection.json`](./cadin360.postman_collection.json).

### Core Endpoints:
- `POST /api/guest-sessions`: Create unauthenticated guest session.
- `POST /api/auth/signup`: User registration with guest credential association.
- `POST /api/auth/login`: User login returning JWT.
- `POST /api/guest-sessions/associate`: Associate guest session to authenticated user.
- `POST /api/events`: Browser event ingestion (rejects `payment_completed`).
- `GET /api/events/journey`: Retrieve unified journey events for caller.
- `GET /api/mock-payments/plans`: List available mock plans with authoritative pricing.
- `POST /api/mock-payments`: Create pending mock payment attempt.
- `POST /api/mock-payments/:id/simulate`: Simulate mock payment outcome (success / failure).
- `GET /api/mock-payments/:id`: Fetch payment attempt status.
- `GET /api/admin/journeys`: Admin dashboard with search, filter, and summary metrics.
- `GET /api/admin/journeys/:journeyId`: Admin journey details and chronological timeline.

---

## 7. AI Assistance Disclosure

In accordance with assessment disclosure policies:
- **Assistance received**: Architecture planning, test suite expansion, React component implementation, Postman collection generation, and automated documentation generation were assisted by **Antigravity (Google DeepMind)**.
- **Verification performed**: All code was inspected, linted, built, and verified by running the live automated test suite (`npm test`), live database seeding (`npm run seed:reset`), live MongoDB query plan execution (`npm run explain`), and production build (`npm run build`).

---

## 8. Known Limitations & Scope Boundaries

1. **Mock Payment Isolation**: The payment system is strictly a mock simulator for the visitor journey challenge. It does not integrate external webhooks or cryptographic signatures from production payment providers (e.g. Stripe Webhook Secrets or PayPal IPN) nor does it collect real credit card data.
2. **Clock Skew Threshold**: Forward clock skew is constrained to a 5-minute tolerance threshold (`MAX_FUTURE_TOLERANCE_MS`). Events with timestamps further in the future are rejected.
3. **Event Immutability**: Historical events are append-only. Editing or deleting past events is unsupported by design to preserve auditability.
