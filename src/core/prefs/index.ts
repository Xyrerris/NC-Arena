/**
 * User preferences, MMKV-backed.
 *
 * Filled in Phase 2: `shortUnit`, last-used sort, viewer id.
 *
 * MMKV rather than AsyncStorage specifically because reads are synchronous: the active
 * sort is needed before the first roster query runs, and an async read there means a
 * frame of unsorted content on every cold start.
 */

export {};
