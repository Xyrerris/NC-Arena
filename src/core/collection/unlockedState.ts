/**
 * Reading the node's answer for "which collections has this avatar unlocked".
 *
 * The node returns the raw state as the hex of a Bencodex value. Observed against Heimdall on
 * 2026-10-01 (ADR-0044), it is a list holding one list of integer ids: `lli1ei2e…eee`.
 *
 * This is deliberately not a Bencodex library. It reads integers and lists, and **throws on
 * anything else, including a list of a different shape**: the caller treats a throw as "no
 * complete read" (ADR-0044, decision 4), and the alternative — returning the ids that happened
 * to parse — would turn a format change on the chain into a quietly wrong list of what is
 * unlocked.
 */

export class UnlockedStateError extends Error {}

type Value = number | readonly Value[];

const fromHex = (hex: string): string => {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new UnlockedStateError('the state is not hexadecimal');
  }
  let out = '';
  for (let i = 0; i < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
};

const parseValue = (text: string, from: number): { value: Value; next: number } => {
  const head = text[from];
  if (head === 'i') {
    const end = text.indexOf('e', from);
    const digits = end < 0 ? '' : text.slice(from + 1, end);
    if (!/^-?(0|[1-9]\d*)$/.test(digits) || digits === '-0') {
      throw new UnlockedStateError(`malformed integer at ${from}`);
    }
    const value = Number(digits);
    if (!Number.isSafeInteger(value))
      throw new UnlockedStateError(`integer out of range at ${from}`);
    return { value, next: end + 1 };
  }
  if (head === 'l') {
    const items: Value[] = [];
    let at = from + 1;
    while (text[at] !== 'e') {
      if (at >= text.length) throw new UnlockedStateError('a list is never closed');
      const item = parseValue(text, at);
      items.push(item.value);
      at = item.next;
    }
    return { value: items, next: at + 1 };
  }
  throw new UnlockedStateError(`unsupported Bencodex value at ${from}`);
};

/** The unlocked collection ids in a node's raw state (hex of Bencodex). */
export function parseUnlockedCollectionIds(hex: string): ReadonlySet<number> {
  const text = fromHex(hex);
  const { value, next } = parseValue(text, 0);
  if (next !== text.length) throw new UnlockedStateError('trailing bytes after the value');
  const inner = Array.isArray(value) && value.length === 1 ? value[0] : undefined;
  if (!Array.isArray(inner) || !inner.every((id): id is number => typeof id === 'number')) {
    throw new UnlockedStateError('the state is not a list holding one list of integers');
  }
  return new Set(inner);
}
