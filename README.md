# Ainova Claude Adapter

Govern Claude agents. Before they act.

This adapter enables Claude Managed Agents to operate under deterministic governance constraints enforced by Ainova OS.

It introduces:
- policy enforcement at runtime
- budget-aware execution
- auditability by design

Claude builds agents.
Ainova governs them.

## What it does

- validates incoming `/authorize` requests
- optionally validates an `x-capability-token` JWT
- forwards the request to Ainova Core
- returns Ainova's decision unchanged when Ainova is reachable
- falls back to a safe deny when Ainova is unavailable or times out
- emits structured decision logs for auditability

## Boundary

- this service is stateless
- this service does not embed business logic
- Ainova remains the single source of truth for policy, RBAC, and budget decisions
- this service does not send or execute the Claude action itself

## Runtime

- Node.js 20
- Fastify
- TypeScript
- Zod

## Environment variables

- `PORT`: HTTP port. Default `8080`
- `HOST`: bind host. Default `0.0.0.0`
- `AINOVA_BASE_URL`: base URL for Ainova Core, for example `https://ainova.example.com`
- `AINOVA_AUTHORIZE_PATH`: authorize path. Default `/v1/authorize`
- `AINOVA_AUDIT_PATH`: optional audit endpoint path for best-effort audit forwarding
- `AINOVA_BEARER_TOKEN`: optional bearer token used when calling Ainova
- `AINOVA_TIMEOUT_MS`: request timeout in milliseconds. Default `2000`
- `AINOVA_MAX_RETRIES`: max retries when Ainova is unavailable. Default `2`
- `CAPABILITY_TOKEN_SECRET`: optional HMAC secret used to validate `x-capability-token`
- `RATE_LIMIT_MAX`: max requests per window per client+route. Default `60`
- `RATE_LIMIT_WINDOW_MS`: rate-limit window in milliseconds. Default `60000`

## Local setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

CI is defined in:

- `.github/workflows/ci.yml`

Manual publication and smoke guidance lives in:

- `docs/deploy.md`

Run locally:

```bash
export AINOVA_BASE_URL='http://localhost:3000'
export CAPABILITY_TOKEN_SECRET='replace-me'
npm run dev
```

## API

### `POST /authorize`

Request body:

```json
{
  "agent_id": "claude-agent-1",
  "holding_id": "holding_123",
  "action": "tool.call",
  "resource": "crm.contact.read",
  "estimated_cost": 0.02,
  "context": {
    "session_id": "sess_001",
    "step_id": "step_004"
  }
}
```

Optional header:

```text
x-capability-token: <jwt>
```

Response:

```json
{
  "status": "authorized",
  "constraints": {
    "max_tokens": 1200,
    "budget_remaining": 42
  }
}
```

Fail-safe response when Ainova is unavailable:

```json
{
  "status": "denied",
  "reason": "denied_safe_mode"
}
```

## curl example

```bash
curl -i \
  -X POST http://localhost:8080/authorize \
  -H 'content-type: application/json' \
  -d '{
    "agent_id":"claude-agent-1",
    "holding_id":"holding_123",
    "action":"tool.call",
    "resource":"crm.contact.read",
    "estimated_cost":0.02,
    "context":{"session_id":"sess_001","step_id":"step_004"}
  }'
```

With capability token:

```bash
curl -i \
  -X POST http://localhost:8080/authorize \
  -H 'content-type: application/json' \
  -H 'x-capability-token: <jwt>' \
  -d '{
    "agent_id":"claude-agent-1",
    "holding_id":"holding_123",
    "action":"tool.call",
    "resource":"crm.contact.read"
  }'
```

## Logging

Each authorization request emits a structured log entry with:

- `timestamp`
- `agent_id`
- `action`
- `decision`
- `latency_ms`
- `reason` when present

If `AINOVA_AUDIT_PATH` is configured, the same event is forwarded best-effort to Ainova.

## Tests

- unit validation coverage through schema-driven request tests
- integration-style app tests with mocked Ainova responses:
  - allow
  - modify
  - fail-safe deny
  - capability-token validation

## Docker

Build:

```bash
docker build -t ainova-claude-adapter .
```

Run:

```bash
docker run --rm -p 8080:8080 \
  -e AINOVA_BASE_URL='https://ainova.example.com' \
  -e CAPABILITY_TOKEN_SECRET='replace-me' \
  ainova-claude-adapter
```

## Deployment status

This repository now has a real CI path.

The recommended first production rollout is:

1. merge to `main`
2. let CI validate install/test/build
3. deploy manually using `docs/deploy.md`
4. run the three-case `/authorize` smoke

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Anthropic.

Claude is a trademark of Anthropic.
