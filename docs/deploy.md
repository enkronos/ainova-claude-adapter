# Deploy Runbook

This adapter is production-ready from a code and CI perspective, but it is intentionally small and stateless.

Today the recommended publication path is:

1. run CI on every PR and `main`
2. deploy manually to the chosen runtime
3. run a short `/authorize` smoke against the live Ainova contract

This keeps the first production rollout simple and easy to reason about.

## Runtime assumptions

- Node.js 20
- outbound network access to Ainova Core
- environment-variable based configuration
- no local persistence required

## Required environment

- `PORT`
- `HOST`
- `AINOVA_BASE_URL`
- `AINOVA_AUTHORIZE_PATH`
- `AINOVA_BEARER_TOKEN` if Ainova requires bearer auth for the adapter caller

Optional:

- `AINOVA_AUDIT_PATH`
- `CAPABILITY_TOKEN_SECRET`
- `AINOVA_TIMEOUT_MS`
- `AINOVA_MAX_RETRIES`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_WINDOW_MS`

## Manual deploy

### Option A — Node.js process

```bash
npm ci
npm run build

export PORT=8080
export HOST=0.0.0.0
export AINOVA_BASE_URL='https://api.ainova.io'
export AINOVA_AUTHORIZE_PATH='/v1/authorize'
export AINOVA_BEARER_TOKEN='...'
export CAPABILITY_TOKEN_SECRET='...'

npm start
```

### Option B — Docker

```bash
docker build -t ainova-claude-adapter .

docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e HOST=0.0.0.0 \
  -e AINOVA_BASE_URL='https://api.ainova.io' \
  -e AINOVA_AUTHORIZE_PATH='/v1/authorize' \
  -e AINOVA_BEARER_TOKEN='...' \
  -e CAPABILITY_TOKEN_SECRET='...' \
  ainova-claude-adapter
```

## Post-deploy smoke

### 1. Unknown action -> denied

```bash
curl -i \
  -X POST http://<adapter-host>:8080/authorize \
  -H 'content-type: application/json' \
  -d '{
    "agent_id":"claude-agent-1",
    "holding_id":"cmaaaaa000000ainovaholding",
    "action":"claude:internet:browse",
    "resource":"external:web"
  }'
```

Expected:

- `200`
- body contains `{"status":"denied","reason":"unknown_policy_action"}`

### 2. Allowed action -> authorized

```bash
curl -i \
  -X POST http://<adapter-host>:8080/authorize \
  -H 'content-type: application/json' \
  -d '{
    "agent_id":"claude-agent-1",
    "holding_id":"cmaaaaa000000ainovaholding",
    "action":"assignments:list",
    "resource":"holding:cmaaaaa000000ainovaholding"
  }'
```

Expected:

- `200`
- body contains `{"status":"authorized", ...}`

### 3. Capability-constrained action -> modified

Use a valid `x-capability-token` signed with `CAPABILITY_TOKEN_SECRET` and constrained with `max_tokens`.

```bash
curl -i \
  -X POST http://<adapter-host>:8080/authorize \
  -H 'content-type: application/json' \
  -H 'x-capability-token: <jwt>' \
  -d '{
    "agent_id":"claude-agent-1",
    "holding_id":"cmaaaaa000000ainovaholding",
    "action":"assignments:list",
    "resource":"holding:cmaaaaa000000ainovaholding"
  }'
```

Expected:

- `200`
- body contains `{"status":"modified", ...}`
- `constraints.max_tokens` is present

## Truth boundary

- the adapter validates and forwards
- Ainova decides
- the adapter does not execute the Claude action
- if Ainova is unavailable, the adapter must return `denied_safe_mode`
