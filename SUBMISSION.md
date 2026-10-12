# CADIN360 Visitor Journey Challenge — Submission Documentation

**Module 8: Testing, Seed Data & Final Submission Document**

---

## 1. Final Submission Checklist

- [x] **Source repository structure**: Complete MERN codebase organized into client workspace and modular server architecture.
- [x] **Setup instructions**: Verified commands for environment configuration, dependencies, seeding, testing, and production builds.
- [x] **Environment isolation (`.env.example`)**: Sanitized placeholder templates for server and client; zero committed secrets.
- [x] **Seed script (>= 10,000 events)**: Deterministic seed generator inserts **10,713 events**.
- [x] **Logical journeys (>= 200 journeys)**: Deterministic seed generator creates **250 logical journeys** (140 registered user journeys + 110 unassociated guest journeys).
- [x] **Automated tests verified**:
  - **124 passing server tests** (Node.js test runner across unit and Modules 1–7 integration suites).
  - **14 passing client tests** (Vitest across Auth, Home, Plans, AdminDashboard, and JourneyDetails).
  - **Total**: **138 automated tests**, 0 failing.
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
| `src/tests/unit/journeyRules.unit.test.js` | 7 | Pure unit tests for route normalization, stage independence, bounds, tie-breaker sorting, and Section 10 regression | **PASS** |
| `src/tests/integration/health.test.js` | 1 | Health checks and MongoDB connection diagnostics | **PASS** |
| `src/tests/integration/auth.test.js` | 14 | Module 1: Guest sessions, SHA-256 credentials, signup, login, password hashing, admin role guarding | **PASS** |
| `src/tests/integration/module2.test.js` | 14 | Module 2: Event tracking, route labels, immutable duplicate retry, conflict 409, concurrency safety, browser payment rejection | **PASS** |
| `src/tests/integration/module3.test.js` | 15 | Module 3: Guest-to-user journey association, atomic claims, history preservation, multi-session ownership | **PASS** |
| `src/tests/integration/module4.test.js` | 21 | Module 4: Journey processing, attribution, chronological sorting, delayed events, Section 10 end-to-end regression flow | **PASS** |
| `src/tests/integration/module5.test.js` | 15 | Module 5: Admin dashboard, name/guest ID search, UTC date range filtering, pagination, summary cards | **PASS** |
| `src/tests/integration/module6.test.js` | 17 | Module 6: Journey details, unified timeline, route aliases, unverified payment rejection, zero secret exposure | **PASS** |
| `src/tests/integration/module7.test.js` | 17 | Module 7: Mock payment attempt creation, authoritative pricing, simulation outcomes, idempotency, concurrent success safety | **PASS** |
| **Total Server Tests** | **124** | **Modules 1–8 Full Server Integration & Unit Suite** | **100% PASS** |

### Client Test Suite Results (14 Tests Passing, 0 Failing)

| Test File | Tests | Component / Flow Tested | Result |
| :--- | :---: | :--- | :---: |
| `src/pages/Auth.test.jsx` | 5 | Login submission, validation, backend toast feedback, admin security key toggle | **PASS** |
| `src/pages/Home.test.jsx` | 2 | Interactive event triggers, guest credential generation, auth modal | **PASS** |
| `src/pages/Plans.test.jsx` | 2 | Plan cards, mock attempt creation, interactive success/failure simulation, stage indicator | **PASS** |
| `src/pages/AdminDashboard.test.jsx` | 2 | Admin access check, search, summary cards, filter toggles | **PASS** |
| `src/pages/JourneyDetails.test.jsx` | 3 | Journey overview card, timeline sequence, pagination, raw credential redaction | **PASS** |
| **Total Client Tests** | **14** | **Vite + React Testing Library + Vitest** | **100% PASS** |

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
