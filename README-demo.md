# Local demo — Components module

End-to-end demo of `PATCH /v1/profiles/me/components/:id` and
`PUT /v1/profiles/me/components/order` against a real Postgres.

## Prerequisites

- Node 18+
- Docker (for Postgres)
- `curl` (Windows users: PowerShell's built-in curl alias points at
  Invoke-WebRequest, which has different flags — use `curl.exe` explicitly,
  or use the PowerShell snippets at the bottom of this doc.)

## Setup

```bash
# 1. From the project root
cp .env.example .env

# 2. Start Postgres in the background
docker compose up -d

# 3. Wait ~3 seconds for Postgres to be ready, then seed
npm run seed
```

The seed command prints the IDs you'll use:

```
=== SEEDED ===
User ID (for x-user-id header): 11111111-1111-1111-1111-111111111111
Profile ID:                     aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
Component IDs:
  About:       c0000000-0000-0000-0000-000000000001
  Links:       c0000000-0000-0000-0000-000000000002
  Experience:  c0000000-0000-0000-0000-000000000003
==============
```

## Run the API

```bash
npm run start:dev
```

You should see:
```
API listening on http://localhost:3000
```

## Auth note

In this demo the `JwtAuthGuard` is swapped for a header-based stub that reads
`x-user-id` — no JWT issuer needed. The downstream service contract is
identical to production. **Do not deploy this guard.**

## Demo flow

### 1. Toggle a component off

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000002 \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

Response: the updated component with `is_enabled: false` and a fresh
`updated_at`.

### 2. Toggle it back on

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000002 \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": true}'
```

### 3. Edit a title

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000001 \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"title": "About me (updated)"}'
```

### 4. Reorder — reverse the components

```bash
curl -X PUT http://localhost:3000/v1/profiles/me/components/order \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "component_ids": [
      "c0000000-0000-0000-0000-000000000003",
      "c0000000-0000-0000-0000-000000000002",
      "c0000000-0000-0000-0000-000000000001"
    ]
  }'
```

Response: the three components in their new order with `display_order` 0, 1, 2.

## Error cases worth demoing

### A. Try to PATCH `display_order` — 400

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000001 \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{"display_order": 5}'
```

Returns 400: `property display_order should not exist`. This is the
`forbidNonWhitelisted` ValidationPipe enforcing RFC §5.1 — display_order
can only change via the reorder endpoint.

### B. Reorder with a missing ID — 409 with diff

```bash
curl -X PUT http://localhost:3000/v1/profiles/me/components/order \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -H "Content-Type: application/json" \
  -d '{
    "component_ids": [
      "c0000000-0000-0000-0000-000000000001",
      "c0000000-0000-0000-0000-000000000002"
    ]
  }'
```

Returns 409 with the diff:
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Submitted component IDs do not match the profile current set.",
  "missing": ["c0000000-0000-0000-0000-000000000003"],
  "extra": []
}
```

### C. PATCH another user's component — 403

Pretend to be a different user and try to touch component 1:

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000001 \
  -H "x-user-id: 22222222-2222-2222-2222-222222222222" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

Returns 403: `Component does not belong to the authenticated user.`

### D. No auth header — 401

```bash
curl -X PATCH http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000001 \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

Returns 401: `Missing x-user-id header (demo mode).`

## Tearing down

```bash
# Stop the API: Ctrl+C
# Stop and remove Postgres + its volume:
docker compose down -v
```

## PowerShell equivalents (Windows)

If `curl` confuses you on Windows, here's case 1 in PowerShell:

```powershell
$headers = @{
  "x-user-id"    = "11111111-1111-1111-1111-111111111111"
  "Content-Type" = "application/json"
}
$body = '{"is_enabled": false}'

Invoke-RestMethod -Method Patch `
  -Uri "http://localhost:3000/v1/profiles/me/components/c0000000-0000-0000-0000-000000000002" `
  -Headers $headers `
  -Body $body
```

## Troubleshooting

- **`ECONNREFUSED 127.0.0.1:5432`** — Postgres isn't up. `docker compose ps`
  to check; `docker compose logs db` for details.
- **`relation "components" does not exist`** — you skipped the seed. Run
  `npm run seed` (it auto-creates tables in dev via TypeORM `synchronize`).
- **`x-user-id must be a UUID`** — typo in the header value. Copy-paste from
  the seed output.
- **Port 3000 already in use** — set `PORT=3001` in `.env` and restart.
