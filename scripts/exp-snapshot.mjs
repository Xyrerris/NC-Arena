// Phase 6 of docs/PLAN-upgrade-materials.md: read-only snapshot of the equipment in a bag, to compare
// the stored Exp of a piece before and after a real upgrade.
//
//   node scripts/exp-snapshot.mjs <avatar> before.json          # save a snapshot
//   node scripts/exp-snapshot.mjs <avatar> after.json --diff before.json
//
// Prints what changed: pieces whose level or Exp moved (the raised piece), and pieces that are gone
// (the material), with the Exp each held. Heimdall only; nothing is written to the chain.

import { readFileSync, writeFileSync } from 'node:fs';

const ENDPOINT = 'https://heimdall6.9capi.com/graphql';
const [avatar, out, flag, beforePath] = process.argv.slice(2);

if (!/^0x[0-9a-fA-F]{40}$/.test(avatar ?? '') || out === undefined) {
  console.error('usage: node scripts/exp-snapshot.mjs <0x avatar> <out.json> [--diff before.json]');
  process.exit(1);
}

const query =
  `{ stateQuery { avatar(avatarAddress: "${avatar}") { inventory { ` +
  'equipments { id level exp itemId equipped } } } } }';
const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
});
const body = await response.json();
const equipments = body?.data?.stateQuery?.avatar?.inventory?.equipments;
if (!Array.isArray(equipments)) {
  console.error('unexpected answer:', JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

const now = Object.fromEntries(
  equipments.map((e) => [e.itemId, { id: e.id, level: e.level, exp: e.exp }]),
);
writeFileSync(out, JSON.stringify(now, null, 1));
console.log(`${equipments.length} pieces saved to ${out}`);

if (flag === '--diff' && beforePath !== undefined) {
  const before = JSON.parse(readFileSync(beforePath, 'utf8'));
  const gexp = (n) => (n / 1e9).toFixed(4);
  let gone = 0;
  let goneExp = 0;
  for (const [guid, was] of Object.entries(before)) {
    const is = now[guid];
    if (is === undefined) {
      gone += 1;
      goneExp += was.exp;
      console.log(`gone    ${guid} item ${was.id} +${was.level} ${gexp(was.exp)} Gexp`);
    } else if (is.level !== was.level || is.exp !== was.exp) {
      console.log(
        `changed ${guid} item ${was.id} +${was.level} -> +${is.level}, ` +
          `${gexp(was.exp)} -> ${gexp(is.exp)} Gexp (gained ${gexp(is.exp - was.exp)})`,
      );
    }
  }
  console.log(`material gone: ${gone} pieces, ${gexp(goneExp)} Gexp stored`);
}
