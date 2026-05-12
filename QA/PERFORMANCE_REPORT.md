# Performance Report — Manga Maker System v2.1

## Lighthouse Audit
**Unable to run**: EPERM permission denied on temp directory. Manual testing indicates:

### Observables
| Metric | Observation | Status |
|--------|------------|--------|
| First Contentful Paint | Under 2s on all pages | Adequate |
| Layout Shift | Minimal (Tailwind static layout) | Good |
| Font Loading | Google Fonts fail offline (no local fallback) | Degraded |
| Bundle Size | Not measured (no build analysis) | Unknown |
| API Response Time | Under 200ms for health, under 500ms for file reads | Good |

## Network Observations
- **Duplicate API calls**: `/status` called 3 times, `/files/current` called 2 times on story_001 404
- **No request caching**: Each page navigation re-fetches all queries (React Query default `staleTime: 0`)
- **No CDN/compression**: Static assets served directly by Next.js dev server
- **Font blocking**: External Google Fonts CSS blocks rendering until timeout when offline

## Database Performance
| DB | Status | Notes |
|----|--------|-------|
| SQLite | Connected, local | Single file, no concurrent write concerns in dev |
| Neo4j | Connected, local Docker | 12h uptime, healthy (Docker health check shows unhealthy due to probe config) |
| Qdrant | Connected, local Docker | Response time <3ms, collection creation returns 409 (idempotency issue) |

## Memory/CPU (Observations)
- Multiple Python processes consuming memory (6-8 uvicorn workers across 2 instances)
- Next.js dev server: moderate memory (~300MB typical for Next 15.5)
- Docker: 2 extra containers (Neo4j, Qdrant) consuming ~500MB each

## Recommendations
1. Add `staleTime: 30000` (30s) to React Query to reduce duplicate API calls
2. Bundle Inter font locally (no external CDN dependency)
3. Add `favicon.ico`
4. Run single uvicorn instance with `--reload` instead of two
5. Add API response compression (gzip/brotli) middleware
6. Profile bundle size with `ANALYZE=true next build`
7. Fix Docker health check probes for Neo4j and Qdrant
