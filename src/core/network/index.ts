/**
 * Network boundary. Gated on open decision 1 — there may not be a backend at all yet.
 *
 * Filled in Phase 5: Zod DTO schemas, the fetch client, domain mappers, error taxonomy.
 *
 * Every stat field's schema carries `.int().refine(Number.isSafeInteger)`. That refinement
 * is the whole §2.1 defence on this platform: TypeScript's `number` cannot express
 * "integral and below 2^53", so the check has to be executable. Above that ceiling
 * JSON.parse loses precision silently — 9007199254740993 parses as ...992.
 */

export {};
