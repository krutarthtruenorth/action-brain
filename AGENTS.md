# Action Brain Agent Notes

This project is a Next.js 16 App Router app.

## Boundaries

- Keep API keys server-side in `lib/*`.
- Route Handlers validate input with Zod and call library modules.
- HydraDB is the durable memory store.
- Do not add auth, a separate database, queues, or background workers for the MVP without a specific product reason.
- Do not commit or push without manual approval.

## Main Files

- `app/api/agent/route.ts` is the primary action-agent endpoint.
- `lib/agent/orchestrator.ts` coordinates retrieval, planning, tools, recovery, and memory writeback.
- `lib/memory-store.ts` owns HydraDB integration.
- `lib/agent/tools.ts` owns explicit tool implementations.
- `components/action-workspace.tsx` is the primary UI.
