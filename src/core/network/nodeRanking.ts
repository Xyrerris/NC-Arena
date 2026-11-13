/**
 * Putting nodes in order of how fast they answer (ADR-0045), as the official client's node
 * selector does ("selected node: …, rtt: 170ms").
 *
 * The probe is `{ __typename }`: the smallest question a GraphQL service answers, so the time is
 * the round trip and not the work. A node that fails the probe is not dropped — it may be back in
 * a minute — it goes **last**, in the order it was given, behind every node that answered.
 */

import { postGraphqlTo } from './chainGraphql';

/** Milliseconds a service took to answer, or `null` if it did not answer properly. */
export type LatencyProbe = (url: string) => Promise<number | null>;

export const PROBE_TIMEOUT_MS = 4_000;

export const graphqlLatencyProbe =
  (now: () => number = Date.now, timeoutMs: number = PROBE_TIMEOUT_MS): LatencyProbe =>
  async (url) => {
    const started = now();
    const response = await postGraphqlTo(url, '{ __typename }', timeoutMs);
    return response.ok && response.value.errors.length === 0 ? now() - started : null;
  };

/**
 * `urls` fastest first, those that did not answer after them in their given order. All are probed
 * together, so the cost is the slowest answer (at most the probe's deadline), not their sum.
 * A tie keeps the given order.
 */
export async function rankByLatency(
  urls: readonly string[],
  probe: LatencyProbe,
): Promise<string[]> {
  const timed = await Promise.all(
    urls.map(async (url, position) => {
      let latency: number | null;
      try {
        latency = await probe(url);
      } catch {
        latency = null;
      }
      return { url, position, latency };
    }),
  );

  const answered = timed
    .filter((node) => node.latency !== null)
    .sort((a, b) => (a.latency as number) - (b.latency as number) || a.position - b.position);
  const silent = timed.filter((node) => node.latency === null);
  return [...answered, ...silent].map((node) => node.url);
}
