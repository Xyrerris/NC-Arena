/**
 * Where each service of each planet is, now (ADR-0045): the built-in list, the planet registry's
 * answer on top of it, and the order latency gave them.
 *
 * The sources already read `this.endpoints[planet]` on **every call**, so the book hands them
 * tables whose entries are read live. Nothing in a source changes when the registry arrives
 * half-way through a session; the next call simply sees the new list.
 *
 * For one planet and one kind of service, the candidates are the registry's, in its order, **then
 * the built-in ones it did not mention** — so a registry that shrinks to one dead node does not
 * leave the app with nothing. The latency ranking then moves the ones that answered to the front;
 * a candidate it does not know (a node the registry added since) goes after them.
 */

import type { Planet } from '../model';
import type { GraphqlEndpoints } from './chainGraphql';
import { SERVED_PLANETS, type PlanetRegistry } from './planetRegistry';

export type EndpointKind = 'nodes' | 'mimir' | 'market';

export interface EndpointDefaults {
  readonly nodes: GraphqlEndpoints;
  readonly mimir: GraphqlEndpoints;
  readonly market: Partial<Record<Planet, string>>;
}

const asList = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? [value] : value;

/** An object whose planets are read from `read` each time they are asked for. */
function liveTable<T>(read: (planet: Planet) => T | undefined): Partial<Record<Planet, T>> {
  const table: Partial<Record<Planet, T>> = {};
  for (const planet of SERVED_PLANETS) {
    Object.defineProperty(table, planet, { enumerable: true, get: () => read(planet) });
  }
  return table;
}

export class EndpointBook {
  private registry: PlanetRegistry = {};
  private readonly ranking = new Map<string, readonly string[]>();

  constructor(private readonly defaults: EndpointDefaults) {}

  /** Nodes, in the order to try them. */
  readonly nodes: GraphqlEndpoints = liveTable((planet) => this.listOf('nodes', planet));
  /** Mimir services, in the order to try them. */
  readonly mimir: GraphqlEndpoints = liveTable((planet) => this.listOf('mimir', planet));
  /** The market service: one base URL, because a scan is paged against a single host. */
  readonly market: Partial<Record<Planet, string>> = liveTable(
    (planet) => this.listOf('market', planet)?.[0],
  );

  /** Replaces the registry layer. The latency ranking is kept: it still describes the same hosts. */
  apply(registry: PlanetRegistry): void {
    this.registry = registry;
  }

  /** Every URL that could serve `planet`, before latency: registry first, then the built-in ones. */
  candidates(kind: EndpointKind, planet: Planet): readonly string[] {
    const fromRegistry = this.registry[planet]?.[kind] ?? [];
    return [...new Set([...fromRegistry, ...asList(this.defaults[kind][planet])])];
  }

  /** Records the order latency gave `urls` for one planet's one kind of service. */
  rank(kind: EndpointKind, planet: Planet, urls: readonly string[]): void {
    this.ranking.set(`${kind}:${planet}`, urls);
  }

  private listOf(kind: EndpointKind, planet: Planet): readonly string[] | undefined {
    const candidates = this.candidates(kind, planet);
    if (candidates.length === 0) return undefined;

    const ranked = this.ranking.get(`${kind}:${planet}`) ?? [];
    const first = ranked.filter((url) => candidates.includes(url));
    return [...first, ...candidates.filter((url) => !first.includes(url))];
  }
}
