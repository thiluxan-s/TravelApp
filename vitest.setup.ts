// lib/env.server.ts runs `envSchema.parse(process.env)` at import and throws
// when anything is missing. Vitest loads no .env files, so a test that reaches
// any env.server importer dies at import time with a twelve-field ZodError
// naming none of the actual cause.
//
// The action tests do not strictly need this — they mock the only two importers
// they can reach. It is here for the next batch: lib/ai/client.ts and
// lib/mapbox/client.ts are reachable from the Inngest job and the route
// handlers, and both parse env the same way.
//
// `??=` so a real environment is never clobbered. These are syntactically valid
// dummies, never credentials.
process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/wayfare_test';
process.env.CLERK_SECRET_KEY ??= 'sk_test_dummy';
process.env.CLERK_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.R2_ACCOUNT_ID ??= 'dummy-account';
process.env.R2_ACCESS_KEY_ID ??= 'dummy-key-id';
process.env.R2_SECRET_ACCESS_KEY ??= 'dummy-secret';
process.env.R2_BUCKET_NAME ??= 'dummy-bucket';
process.env.R2_PUBLIC_URL ??= 'https://r2.example.test';
process.env.ANTHROPIC_API_KEY ??= 'sk-ant-dummy';
process.env.MAPBOX_SECRET_TOKEN ??= 'dummy-mapbox-token';
process.env.INNGEST_EVENT_KEY ??= 'dummy-inngest-key';
process.env.DEMO_TRIP_ID ??= '00000000-0000-4000-8000-000000000000';
