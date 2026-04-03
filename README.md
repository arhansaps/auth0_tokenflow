# TokenFlow OS

TokenFlow OS is a capability-based execution runtime for AI agents that turns every decision into an auditable, pauseable, revocable token step. Instead of letting an agent jump from input to outcome as a black box, the runtime mints a scoped token for each action, burns it after use, records the event in an immutable audit log, and pauses the chain the moment policy or fairness signals suggest a human should intervene.

## Architecture

```text
+-----------------------------------------------------------------------------------------------+
|                  Mission Control UI (React + Tailwind)                                        |
|  live token chain | review queue | audit feed | vault status | kill switch                    |
+-----------------------------------------------+-----------------------------------------------+
                                                |
                                                | REST + WebSocket
                                                v
+-----------------------------------------------------------------------------------------------+
|                        TokenFlow API (Node + Express)                                          |
|  /api/tokens     mint / consume / revoke / audit / chain                                      |
|  /api/workflows  start / resume / revoke / kill / review queue                                |
|  /api/dashboard  operational overview for the frontend                                         |
|  /api/vault      Auth0 Token Vault status and credential registry                              |
+--------------------------+----------------------------+-----------------------------+-----------+
                           |                            |                             |
                           v                            v                             v
                +--------------------+      +--------------------+         +-------------------+
                | Policy Engine      |      | Workflow Runner    |         | SQLite Audit DB   |
                | mint checks        |      | loan demo steps    |         | tokens / audits   |
                | bias checks        |      | pause / resume     |         | workflows         |
                +----------+---------+      +----------+---------+         +-------------------+
                           |                            |
                           | brokered service calls     |
                           v                            v
                +--------------------------------------------------------------------------------+
                |                         Auth0 Token Vault + Auth0 API                           |
                | OpenAI / SendGrid / external credentials live here, never in the agent runtime |
                +--------------------------------------------------------------------------------+
```

## How Auth0 Token Vault Is Used

Auth0 Token Vault is the credential boundary of the system. TokenFlow never gives the agent raw third-party secrets. Instead:

1. The workflow asks for a capability token for a single action.
2. The backend policy engine decides whether that token can exist.
3. When an action needs an external service, the backend requests the credential through the Auth0-backed vault service in [`server/src/services/vaultService.js`](./server/src/services/vaultService.js).
4. The backend executes the action on behalf of the agent and only returns the result payload.

For the demo, the vault broker is used for:

- identity verification lookups during `READ_APPLICANT_DATA`
- credit bureau access during `RUN_CREDIT_SCORE`
- SendGrid access during `SEND_DECISION_EMAIL`

The frontend exposes only vault metadata from `/api/vault/credentials`: service names, connection type, status, and last access time. Secret material is never returned to the browser or to the workflow runner.

## Token Engine First

Core backend surfaces:

- Token schema: [`server/src/db/schema.sql`](./server/src/db/schema.sql)
- Mint route: [`server/src/routes/tokenRoutes.js`](./server/src/routes/tokenRoutes.js)
- Consume route: [`server/src/routes/tokenRoutes.js`](./server/src/routes/tokenRoutes.js)
- Revoke route: [`server/src/routes/tokenRoutes.js`](./server/src/routes/tokenRoutes.js)
- Policy checks: [`server/src/engine/policyEngine.js`](./server/src/engine/policyEngine.js)
- Token-gating middleware: [`server/src/middleware/tokenMiddleware.js`](./server/src/middleware/tokenMiddleware.js)

The token record includes:

```json
{
  "id": "tok_xxx",
  "workflow_id": "wf_xxx",
  "action_type": "RUN_CREDIT_SCORE",
  "resource_id": "APP-001",
  "agent_id": "agent-loan-processor",
  "minted_at": "2026-04-03T13:09:06.565Z",
  "expires_at": "2026-04-03T13:14:06.565Z",
  "status": "pending | active | burned | revoked | flagged",
  "context": {},
  "parent_token_id": "tok_previous",
  "step_index": 1
}
```

`POST /api/tokens/consume/:id` requires the `x-capability-token` header to match the token being consumed, so execution is impossible without a live capability token.

## Demo Workflow

The loan walkthrough in the UI follows this chain:

1. `READ_APPLICANT_DATA`
2. `RUN_CREDIT_SCORE`
3. Human review when confidence is low or ZIP is on the flagged list
4. `APPROVE_OR_DENY`
5. `SEND_DECISION_EMAIL`

Applicant `APP-001` is intentionally configured to trigger the bias-review path.

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

The repo already includes a local `.env` and a matching `.env.example`. Update the Auth0 values as needed.

### 3. Run the full local stack

```bash
npm run dev
```

This starts:

- API on `http://localhost:8000`
- Vite frontend on `http://localhost:5173`

### 4. Run the production-style build locally

```bash
npm run build
npm run start
```

This serves the built frontend and API together from `http://localhost:8000`.

## Trigger The Demo Scenario

1. Open the Mission Control dashboard.
2. Select applicant `Jordan Williams (APP-001)`.
3. Click `Start Loan Chain`.
4. Watch the chain mint and burn the first token.
5. The workflow pauses on `RUN_CREDIT_SCORE` and raises a bias anomaly for ZIP `48201`.
6. Use `Resume Chain` or `Revoke Chain` from the Human Review Panel.
7. Inspect the live audit feed and token chain colors as the workflow finishes.

## Security Properties

If the agent is compromised, it still cannot:

- execute arbitrary actions without a valid capability token
- reuse a token after it has been burned
- mint future-step tokens out of order
- access third-party credentials directly
- hide or rewrite the audit history
- continue execution after a human reviewer revokes or kills the chain

## Deployment Notes

- Frontend: Vite build output in `client/dist`
- Backend: Express serves the built frontend when present
- Good fit for Railway or Render: build with `npm install && npm run build`, start with `npm run start`
