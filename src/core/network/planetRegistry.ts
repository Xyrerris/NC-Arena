/**
 * The planet registry (ADR-0045): the list Planetarium keeps, at
 * `https://planets.nine-chronicles.com/planets/`, of which services each planet runs. It is what
 * the official client's node selector starts from.
 *
 * Three of its `rpcEndpoints` keys are read — `headless.gql` (nodes), `mimir.gql` and `market.rest`
 * — and everything else is ignored. A URL is kept only if it is `https`: the registry also lists
 * plain `http` services (the world boss), and nothing here may fall back to one by accident.
 *
 * **Which planets are served is decided here, not by the registry.** Thor is in `PLANETS` but has
 * no node, Mimir or market this app has verified, so it is left out even if the registry grows an
 * entry for it (ADR-0044, ADR-0045). Add it to `SERVED_PLANETS` when it has been probed.
 *
 * A planet whose answer is unusable is dropped on its own; one bad entry never costs the others.
 * A planet with no node is dropped too: a registry that names Mimir and no node is not a registry
 * the nodes can be read from.
 */

import { z } from 'zod';

import { err, ok, type Result } from '../common';
import type { Planet } from '../model';
import type { NetworkError } from './errors';
import { HttpClient } from './httpClient';

export const PLANET_REGISTRY_URL = 'https://planets.nine-chronicles.com/planets/';

/** The planets this app reads from the registry. Thor is deliberately absent. */
export const SERVED_PLANETS: readonly Planet[] = ['odin', 'heimdall'];

export interface PlanetEndpoints {
  readonly nodes: readonly string[];
  readonly mimir: readonly string[];
  readonly market: readonly string[];
}

export type PlanetRegistry = Partial<Record<Planet, PlanetEndpoints>>;

const httpsUrl = z.string().regex(/^https:\/\/\S+$/);

const planetEndpointsSchema = z.object({
  nodes: z.array(httpsUrl).min(1),
  mimir: z.array(httpsUrl),
  market: z.array(httpsUrl),
});

const normalisedSchema = z.object({
  odin: planetEndpointsSchema.optional(),
  heimdall: planetEndpointsSchema.optional(),
});

const entrySchema = z.object({
  name: z.string(),
  rpcEndpoints: z.record(z.string(), z.array(z.string())),
});

const onlyHttps = (urls: readonly string[] | undefined): string[] => [
  ...new Set((urls ?? []).filter((url) => httpsUrl.safeParse(url).success)),
];

/** The registry's JSON body as a `PlanetRegistry`: served planets only, usable entries only. */
export function parsePlanetRegistry(body: unknown): PlanetRegistry {
  if (!Array.isArray(body)) return {};

  const registry: Partial<Record<Planet, PlanetEndpoints>> = {};
  for (const raw of body as unknown[]) {
    const entry = entrySchema.safeParse(raw);
    if (!entry.success) continue;

    const planet = SERVED_PLANETS.find((served) => served === entry.data.name);
    if (planet === undefined) continue;

    const endpoints = {
      nodes: onlyHttps(entry.data.rpcEndpoints['headless.gql']),
      mimir: onlyHttps(entry.data.rpcEndpoints['mimir.gql']),
      market: onlyHttps(entry.data.rpcEndpoints['market.rest']),
    };
    if (endpoints.nodes.length > 0) registry[planet] = endpoints;
  }
  return registry;
}

/** What the data layer reads the registry through, so a test can hand it any answer. */
export interface RegistryReader {
  read(): Promise<Result<PlanetRegistry, NetworkError>>;
}

export class PlanetRegistrySource implements RegistryReader {
  constructor(
    private readonly url: string = PLANET_REGISTRY_URL,
    private readonly timeoutMs: number = 8_000,
  ) {}

  async read(): Promise<Result<PlanetRegistry, NetworkError>> {
    const response = await new HttpClient(this.url, null, {
      timeoutMs: this.timeoutMs,
    }).request<unknown>('', { method: 'GET' });
    if (!response.ok) return err(response.error);

    const registry = parsePlanetRegistry(response.value);
    if (Object.keys(registry).length === 0) {
      return err({ code: 'MALFORMED_RESPONSE', message: 'the registry named no usable planet' });
    }
    return ok(registry);
  }
}

const cacheSchema = z.object({
  version: z.literal(1),
  readAt: z.number().finite(),
  registry: normalisedSchema,
});

export interface CachedRegistry {
  readonly readAt: number;
  readonly registry: PlanetRegistry;
}

export const encodeRegistryCache = (registry: PlanetRegistry, readAt: number): string =>
  JSON.stringify({ version: 1, readAt, registry });

/** `null` for anything that is not a cache this code wrote: a changed shape is a cache miss. */
export function decodeRegistryCache(text: string | null): CachedRegistry | null {
  if (text === null) return null;
  try {
    const parsed = cacheSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const { readAt, registry } = parsed.data;
    return Object.keys(registry).length === 0 ? null : { readAt, registry };
  } catch {
    return null;
  }
}
