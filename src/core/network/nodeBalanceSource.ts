/**
 * `BalanceSource` over a plain node: `goldBalance(address)` at the top of the query (ADR-0044).
 *
 * Observed on Heimdall 2026-10-15: `{ goldBalance(address: "0x…") }` answers `"5.52"`, NCG as a
 * decimal string. It is **not** under `stateQuery`: that type has a different `balance` field that
 * wants a currency, and asking `stateQuery { goldBalance }` is a validation error. The address is
 * the *agent's* — the account — not the avatar's.
 *
 * An address the node cannot parse is an error, not a zero balance; so is an answer that is not a
 * plain non-negative decimal. A card showing "0 NCG" for a broken read would say the person is
 * broke, which is the one thing it must not guess.
 */

import { z } from 'zod';

import { err, ok, type BalanceError, type BalanceSource, type Result } from '../common';
import type { Planet } from '../model';
import { networkFailure, postGraphql } from './chainGraphql';
import { NODE_ENDPOINTS } from './nodeCollectionSource';

const dataSchema = z.object({ goldBalance: z.string().regex(/^\d+(\.\d+)?$/) });

/** The account address as the node spells it: 40 hex digits behind `0x`. */
const AGENT_ADDRESS = /^(0x)?([0-9a-fA-F]{40})$/;

export class NodeBalanceSource implements BalanceSource {
  readonly name = 'node';

  constructor(private readonly endpoints: Partial<Record<Planet, string>> = NODE_ENDPOINTS) {}

  async readNcg(planet: Planet, agentAddress: string): Promise<Result<number, BalanceError>> {
    const endpoint = this.endpoints[planet];
    if (endpoint === undefined) return err(this.failed(`it does not serve ${planet}.`));

    const match = AGENT_ADDRESS.exec(agentAddress.trim());
    if (match === null) return err(this.failed('the account address is malformed.'));

    const response = await postGraphql(endpoint, `{ goldBalance(address: "0x${match[2]}") }`);
    if (!response.ok) return err(networkFailure(this.name, response.error));

    const parsed = dataSchema.safeParse(response.value.data);
    if (!parsed.success) {
      return err(
        this.failed(
          response.value.errors[0]?.message ?? 'the answer did not match the expected shape.',
        ),
      );
    }
    return ok(Number(parsed.data.goldBalance));
  }

  private failed(message: string): BalanceError {
    return { reason: 'FAILED', message: `${this.name}: ${message}` };
  }
}
