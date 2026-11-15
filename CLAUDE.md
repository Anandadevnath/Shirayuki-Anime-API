# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The canonical agent guide for this repo is `AGENTS.md`. It covers commands, provider architecture, the response envelope, caching, the reanime/flixcloud stream pipeline, the Scrapling Python bridge, and known gotchas. It is imported here so it always loads:

@AGENTS.md

When this file and `AGENTS.md` overlap, keep `AGENTS.md` as the single source and update it rather than duplicating it here.

## Verifying changes

There is no test suite. Verify changes against a running server:

```bash
npm run dev                                   # serves on http://localhost:4000
curl -s "localhost:4000/api/v2/hianime" | head -c 500     # hianime home
curl -s "localhost:4000/api/v2/hianime/search?q=naruto" | head -c 500
curl -s "localhost:4000/api/v2/reanime/episode/sources?animeId=<id>&ep=1"
```

- To check a stream end to end, follow the sources → `proxyM3u8` → variant playlist → key/segment chain.
- A failing endpoint usually means the upstream site changed or anti-bot kicked in, not a local bug (see the Gotchas section in `AGENTS.md`). Before you edit a scraper, check the live upstream response.

## Downstream consumer

The sibling directory `../Shirayuki` (a separate git repo: Next.js frontend) consumes this API. Its `API_BASE_URL` env var points at this server's origin, and `lib/providers/hianime/client.ts` there prefixes every call with `/api/v2/hianime`. It currently uses **only the hianime provider**. Raw responses are validated by zod in `lib/providers/hianime/schemas.ts` and normalized in `mappers.ts`. If you change the shape of a hianime controller response (field names, nesting, the `{ success, data }` envelope), the frontend may break. Check those two files when you do. The other providers (`anikoto`, `animex`, `reanime`) are not wired into the frontend.
