# CADIN360 Visitor Journey

Module 1 sets up a MERN application with a health API and a responsive connection status page. Business features are reserved for later modules.

## Stack and architecture

- Client: React, Vite, React Router, Axios, Tailwind CSS.
- Server: Node.js ES modules, Express, Mongoose, MongoDB, dotenv, cors, helmet, morgan.
- npm workspaces install and run both packages from the root. The backend keeps configuration in `server/src/config`, shared HTTP utilities in `server/src/shared`, and each feature in `server/src/modules`. Health has routes, controller, and service; it needs no repository or model because it performs no data operations.
- `app.js` constructs the Express app for testing; `server.js` validates configuration, connects to MongoDB, then starts listening. Credentials are never logged.

## Structure

```text
client/           Vite app, homepage, route, Axios service, frontend tests
server/src/config/   environment, CORS, MongoDB connection
server/src/modules/health/   health route, controller, service
server/src/shared/   errors, middleware, response helpers
server/src/tests/integration/   mocked HTTP integration tests
```

## Setup

Install Node.js 20.19+ and MongoDB. From this directory:

```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm run dev
```

By default MongoDB must be reachable at `mongodb://127.0.0.1:27017`. Mongoose uses the `cadin360_visitor_journey` database. Set `MONGODB_URI` in `server/.env` for a different server. Set `CLIENT_URL` to the frontend origin allowed by CORS; `VITE_API_BASE_URL` points the frontend to the server's `/api` prefix. Keep all real `.env` files private.

Open `http://localhost:5173`. The API is at `http://localhost:5000/api/health`. A successful response is `{"success":true,"message":"CADIN360 API is running","database":"connected"}`. If a running server loses its database connection, the health endpoint responds with HTTP 503. Initial connection failure prevents the HTTP server from starting.

## Commands

```text
npm run dev          start both development servers
npm run dev:client   start Vite only
npm run dev:server   start nodemon only
npm run build        build the client
npm test             run server and client automated tests
```

The server tests mock Mongoose connection readiness and exercise HTTP through Supertest. Client tests mock Axios health requests and check success, failure, and retry. These tests do not prove a live MongoDB connection. For a live check, start MongoDB, run `npm run dev`, then request `/api/health` and inspect the homepage.

## Troubleshooting

- Startup says `Database connection failed`: verify MongoDB is running and the URI is correct. The message deliberately omits the URI.
- Startup reports missing or invalid configuration: copy the server environment example and check `MONGODB_URI`, `CLIENT_URL`, and `PORT`.
- Homepage says the API is unavailable: ensure both servers are running and `VITE_API_BASE_URL` matches the backend port.
- Browser reports CORS errors: set `CLIENT_URL` to the exact Vite origin and restart the server.

## Completion and roadmap

Module 1 includes the application foundation, database connection lifecycle, health API, connection status page, and automated tests. No authentication, guest sessions, events, dashboards, or payment features are implemented. Planned modules: 2 authentication; 3 guest sessions; 4 event tracking; 5 event deduplication; 6 guest to user association; 7 admin journeys; 8 attribution and summaries; 9 mock payment verification; 10 seed data, acceptance tests, and performance evidence. All will remain in this backend application.
