# Pawline

AI route planner for pet waste removal businesses. Turn a customer list into an optimized weekly schedule in 30 seconds.

**Live:** https://pawline.majorsolutions.studio
**Demo:** https://pawline.majorsolutions.studio/tool.html

## Stack

- Vanilla HTML + CSS + JS (zero build)
- Netlify Functions (serverless Node.js, fetch-based, zero npm deps)
- Turso (SQLite cloud) via HTTP API
- Gemini 2.0 Flash for route optimization
- Resend for transactional email
- PostHog for analytics

## Local dev

```
netlify dev
```

Env vars required: `GEMINI_API_KEY`, `TURSO_DB_URL`, `TURSO_DB_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`, `IDEA_SLUG`.

## About

A daily product from [Major Solutions Studio](https://majorsolutions.studio) — generated, validated, built, deployed, and promoted by AI agents in a single day.
