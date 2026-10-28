/** What the account behind the viewer's avatar holds, as the purchase sheets need to know it. */

export type BalanceState =
  | { readonly kind: 'known'; readonly ncg: number }
  /** `no-avatar`: no account to ask about. `offline` / `failed`: the node did not answer. */
  | { readonly kind: 'unknown'; readonly why: 'no-avatar' | 'offline' | 'failed' };
