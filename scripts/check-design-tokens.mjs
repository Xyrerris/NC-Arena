#!/usr/bin/env node
/**
 * Proves the ARCHITECTURE.md §2.4 token rules actually reject a raw colour or a raw
 * spacing value outside core/design-system — and that the §2.2 `toFixed` ban survived
 * being composed with them.
 *
 * That last case is not padding. `no-restricted-syntax` is replaced wholesale by the last
 * config block matching a file, so adding the token rules in a second block would have
 * silently deleted the toFixed ban for all of core/common. Nothing would have failed; the
 * rounding contract would simply have stopped being enforced, which is precisely how
 * ADR-0006 happened.
 */

import { report, runProbes } from './lint-probe.mjs';

const RULES = ['no-restricted-syntax'];

const CASES = [
  {
    name: 'a hex colour in a feature is rejected',
    file: 'src/features/roster/__token_probe.ts',
    source: "export const probe = { color: '#5fd6a2' };\n",
    expect: 'reject',
  },
  {
    name: 'an rgba() colour in a feature is rejected',
    file: 'src/features/roster/__token_probe.ts',
    source: "export const probe = { color: 'rgba(232,239,236,0.3)' };\n",
    expect: 'reject',
  },
  {
    name: 'raw padding in a feature is rejected',
    file: 'src/features/roster/__token_probe.ts',
    source: 'export const probe = { paddingHorizontal: 24 };\n',
    expect: 'reject',
  },
  {
    name: 'a raw border radius in a feature is rejected',
    file: 'src/features/roster/__token_probe.ts',
    source: 'export const probe = { borderRadius: 12 };\n',
    expect: 'reject',
  },
  {
    name: 'a raw gap in a route is rejected',
    file: 'src/app/__token_probe.ts',
    source: 'export const probe = { gap: 12 };\n',
    expect: 'reject',
  },
  {
    name: 'toFixed in core/common is still rejected alongside the token rules',
    file: 'src/core/common/__token_probe.ts',
    source: 'export const probe = (n: number) => n.toFixed(2);\n',
    expect: 'reject',
  },
  {
    name: '0 and 1 stay legal, for hairlines and resets',
    file: 'src/features/roster/__token_probe.ts',
    source: 'export const probe = { padding: 0, borderRadius: 0, gap: 1 };\n',
    expect: 'allow',
  },
  {
    name: 'token values are legal',
    file: 'src/features/roster/__token_probe.ts',
    source:
      "import { color, radius, space } from '@/core/design-system';\n" +
      'export const probe = {\n' +
      '  padding: space[16],\n' +
      '  borderRadius: radius.md,\n' +
      '  backgroundColor: color.surface,\n' +
      '};\n',
    expect: 'allow',
  },
  {
    name: 'the design system itself may write raw values',
    file: 'src/core/design-system/__token_probe.ts',
    source: "export const probe = { padding: 24, color: '#5fd6a2' };\n",
    expect: 'allow',
  },

  // Phase 6: words live in a strings module. Four ways one reaches the screen, each rejected.
  {
    name: 'bare text in a feature component is rejected',
    file: 'src/features/roster/__token_probe.tsx',
    source: 'export const Probe = () => <Text>Hello there</Text>;\n',
    expect: 'reject',
  },
  {
    name: 'a string literal child in a feature component is rejected',
    file: 'src/features/roster/__token_probe.tsx',
    source: "export const Probe = () => <Text>{'Hello there'}</Text>;\n",
    expect: 'reject',
  },
  {
    name: 'a template literal child in a feature component is rejected',
    file: 'src/features/roster/__token_probe.tsx',
    source: 'export const Probe = ({ n }: { n: number }) => <Text>{`Score ${n}`}</Text>;\n',
    expect: 'reject',
  },
  {
    name: 'a literal accessibilityLabel in a feature component is rejected',
    file: 'src/features/roster/__token_probe.tsx',
    source: 'export const Probe = () => <Pressable accessibilityLabel="Go back" />;\n',
    expect: 'reject',
  },
  {
    name: 'bare text in a route is rejected',
    file: 'src/app/__token_probe.tsx',
    source: 'export default () => <Text>Hello there</Text>;\n',
    expect: 'reject',
  },
  {
    name: 'bare text in a shared component is rejected',
    file: 'src/core/design-system/__token_probe.tsx',
    source: 'export const Probe = () => <Text>Hello there</Text>;\n',
    expect: 'reject',
  },
  {
    name: 'a value from a strings module is legal',
    file: 'src/features/roster/__token_probe.tsx',
    source:
      "import { rosterStrings } from './strings';\n" +
      'export const Probe = () => <Text accessibilityLabel={rosterStrings.title}>{rosterStrings.title}</Text>;\n',
    expect: 'allow',
  },
  {
    name: 'a template-literal testID is not a word',
    file: 'src/features/roster/__token_probe.tsx',
    source: 'export const Probe = ({ id }: { id: string }) => <View testID={`row-${id}`} />;\n',
    expect: 'allow',
  },
  {
    name: 'a test may write text',
    file: 'src/features/roster/__token_probe.test.tsx',
    source: 'export const Probe = () => <Text>Hello there</Text>;\n',
    expect: 'allow',
  },
  {
    name: 'a test is still held to the token rules',
    file: 'src/features/roster/__token_probe.test.tsx',
    source: "export const probe = { color: '#5fd6a2' };\n",
    expect: 'reject',
  },
];

const failures = await runProbes('Design tokens (ARCHITECTURE.md §2.4, §2.2)', RULES, CASES);
report(failures, CASES.length, 'ARCHITECTURE.md §2.4 and core/design-system/tokens.ts');
