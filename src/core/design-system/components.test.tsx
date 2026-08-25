/**
 * The component contract (ROADMAP.md Phase 1 exit criteria).
 *
 * Queried by accessibility role and label rather than by test id wherever there is one, so
 * the Phase 6 TalkBack pass is exercised by these tests from the start instead of being
 * bolted on to components that were never built for it.
 *
 * jest-expo runs at fontScale 2, so every assertion below is also a 200 % font-scale
 * assertion.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ArenaButton } from './ArenaButton';
import { CompareBar } from './CompareBar';
import { FormField } from './FormField';
import { RecordBadge } from './RecordBadge';
import { SearchField } from './SearchField';
import { SegmentedTabs } from './SegmentedTabs';
import { SortChip } from './SortChip';
import { StatRow } from './StatRow';
import { ViewerCard } from './ViewerCard';
import { color, layout } from './tokens';

// ArenaText composes its style as `[resolved, style]`, so a `.props.style.color` read
// finds an array and returns undefined. Flatten first, always.
const flatten = (style: unknown): Record<string, unknown> => {
  const parts = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean);
  return Object.assign({}, ...parts) as Record<string, unknown>;
};

const flatStyle = (testID: string): Record<string, unknown> =>
  flatten(screen.getByTestId(testID).props.style);

const colorOfText = (text: string): unknown => flatten(screen.getByText(text).props.style).color;

describe('SortChip', () => {
  it('announces itself as a selectable button', async () => {
    await render(<SortChip label="Rank" selected onPress={jest.fn()} />);
    const chip = screen.getByRole('button', { name: 'Rank' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('reports the unselected state rather than omitting it', async () => {
    await render(<SortChip label="CP" selected={false} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'CP' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('calls back on press', async () => {
    const onPress = jest.fn();
    await render(<SortChip label="My wins" selected={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'My wins' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 48 dp touch minimum the prototype misses (defect 9)', async () => {
    await render(<SortChip testID="chip" label="Rank" selected onPress={jest.fn()} />);
    expect(flatStyle('chip').minHeight).toBe(layout.minTouchTarget);
  });
});

describe('StatRow', () => {
  it('shows the exact value and the rounded one — both, always', async () => {
    await render(<StatRow label="ATK" exact="2.418.904.113" short="2,42 B" />);
    expect(screen.getByText('2.418.904.113')).toBeTruthy();
    expect(screen.getByText('2,42 B')).toBeTruthy();
  });

  it('is one accessibility stop, not three', async () => {
    await render(<StatRow testID="row" label="ATK" exact="2.418.904.113" short="2,42 B" />);
    const row = screen.getByTestId('row');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe('ATK, 2.418.904.113');
  });
});

describe('RecordBadge', () => {
  it('spells the record out, so colour is never the only signal', async () => {
    await render(<RecordBadge testID="record" wins={8} losses={2} />);
    expect(screen.getByTestId('record').props.accessibilityLabel).toBe(
      'you won 8 of 10 matches against this player',
    );
  });

  it('says "never fought" instead of showing a zero record', async () => {
    await render(<RecordBadge testID="record" wins={0} losses={0} />);
    expect(screen.getByTestId('record').props.accessibilityLabel).toBe('never fought');
    expect(screen.getByText('0W · 0L')).toBeTruthy();
  });

  // One render per test. React Native Testing Library 14 wraps each render in `act`, and a
  // second one inside the same test overlaps the first — React logs "overlapping act()
  // calls" and the tree the queries see is not the one just rendered.
  it('colours a winning record with the accent', async () => {
    await render(<RecordBadge wins={8} losses={2} />);
    expect(colorOfText('8W · 2L')).toBe(color.accent);
  });

  it('colours a losing record with the negative', async () => {
    await render(<RecordBadge wins={2} losses={8} />);
    expect(colorOfText('2W · 8L')).toBe(color.negative);
  });

  it('leaves an even record neutral', async () => {
    await render(<RecordBadge wins={4} losses={4} />);
    expect(colorOfText('4W · 4L')).toBe(color.text.body);
  });
});

describe('SegmentedTabs', () => {
  const TABS = [
    { value: 'stats', label: 'Stats' },
    { value: 'vs', label: 'Vs You' },
  ] as const;

  it('is a tablist, so a screen reader knows the options are exclusive', async () => {
    await render(<SegmentedTabs testID="tabs" tabs={TABS} selected="stats" onSelect={jest.fn()} />);
    // Asserted through the prop rather than `getByRole('tablist')`: the container is not
    // itself an accessibility element — making it one would collapse the two tabs into a
    // single swipe stop — and RNTL's role query only matches elements that are. The role
    // still reaches the platform, which is what TalkBack reads.
    expect(screen.getByTestId('tabs').props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'Stats' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Vs You' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('reports the value that was picked', async () => {
    const onSelect = jest.fn();
    await render(<SegmentedTabs tabs={TABS} selected="stats" onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('tab', { name: 'Vs You' }));
    expect(onSelect).toHaveBeenCalledWith('vs');
  });
});

describe('SearchField', () => {
  it('carries a label that survives typing, unlike a placeholder', async () => {
    await render(<SearchField value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Search players by name')).toBeTruthy();
  });

  it('reports what was typed', async () => {
    const onChangeText = jest.fn();
    await render(<SearchField value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Search players by name'), 'skarn');
    expect(onChangeText).toHaveBeenCalledWith('skarn');
  });
});

describe('CompareBar', () => {
  const props = {
    label: 'ATK',
    mine: { exact: '1.184.530.912', short: '1,18 B', fraction: 0.49 },
    theirs: { exact: '2.418.904.113', short: '2,42 B', fraction: 1 },
    delta: '+104,2%',
    opponentAhead: true,
  };

  it('renders both representations of both sides', async () => {
    await render(<CompareBar {...props} />);
    for (const text of ['1.184.530.912', '1,18 B', '2.418.904.113', '2,42 B']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('says who leads in words, not only in colour', async () => {
    await render(<CompareBar {...props} testID="bar" />);
    expect(screen.getByTestId('bar').props.accessibilityLabel).toBe(
      'ATK. You 1.184.530.912, them 2.418.904.113. they lead, +104,2%.',
    );
    expect(screen.getByText('they lead')).toBeTruthy();
  });

  it('flips the verdict when you are ahead', async () => {
    await render(<CompareBar {...props} opponentAhead={false} delta="-51,0%" />);
    expect(screen.getByText('you lead')).toBeTruthy();
  });
});

describe('ViewerCard', () => {
  it('shows combat power twice and pads the rank as the design does', async () => {
    await render(
      <ViewerCard
        name="Krios"
        combatPowerExact="2.145.880"
        combatPowerShort="2,15 M"
        rank={9}
        score={1842}
      />,
    );
    expect(screen.getByText('Krios')).toBeTruthy();
    expect(screen.getByText('2.145.880')).toBeTruthy();
    expect(screen.getByText('2,15 M')).toBeTruthy();
    expect(screen.getByText('09')).toBeTruthy();
    expect(screen.getByText('Score 1842')).toBeTruthy();
  });
});

describe('ArenaButton', () => {
  it('announces itself as a button, by its label', async () => {
    await render(<ArenaButton label="Add player" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add player' })).toBeTruthy();
  });

  it('takes an explicit accessible name where the label is not a sentence', async () => {
    await render(
      <ArenaButton label="Edit" accessibilityLabel="Edit this player" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Edit this player' })).toBeTruthy();
  });

  it('clears the 48 dp touch minimum, as the sort chips had to (defect 9)', async () => {
    await render(<ArenaButton testID="btn" label="Add player" onPress={jest.fn()} />);
    expect(flatStyle('btn').minHeight).toBe(layout.minTouchTarget);
  });

  it('announces a disabled button as disabled rather than only dimming it', async () => {
    const onPress = jest.fn();
    await render(<ArenaButton label="Add player" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Add player' });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('blocks a second press while the first is still in flight', async () => {
    // Guards a double submit on a form whose write is synchronous today and will not be
    // once Phase 5 puts a network behind it.
    const onPress = jest.fn();
    await render(<ArenaButton label="Saving" onPress={onPress} busy />);

    fireEvent.press(screen.getByRole('button', { name: 'Saving' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Saving' }).props.accessibilityState).toMatchObject({
      busy: true,
    });
  });
});

describe('FormField', () => {
  it('carries a label that survives typing, unlike a placeholder', async () => {
    await render(<FormField label="Combat power" value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Combat power')).toBeTruthy();
  });

  it('reports what was typed', async () => {
    const onChangeText = jest.fn();
    await render(<FormField label="Name" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Name'), 'Skarn');
    expect(onChangeText).toHaveBeenCalledWith('Skarn');
  });

  it('states the rejection in words, not only in red', async () => {
    // ROADMAP.md Phase 6's non-colour-redundancy rule, applied where the error lives.
    await render(
      <FormField
        testID="field"
        label="Name"
        value=""
        onChangeText={jest.fn()}
        error="A player needs a name."
      />,
    );

    expect(screen.getByText('A player needs a name.')).toBeTruthy();
    expect(colorOfText('A player needs a name.')).toBe(color.negative);
    expect(screen.getByLabelText('Name').props['aria-invalid']).toBe(true);
  });

  it('replaces the hint with the error rather than stacking them', async () => {
    await render(
      <FormField
        label="Crit"
        value=""
        onChangeText={jest.fn()}
        hint="Percent x 10 000."
        error="Cannot be negative."
      />,
    );

    expect(screen.getByText('Cannot be negative.')).toBeTruthy();
    expect(screen.queryByText('Percent x 10 000.')).toBeNull();
  });

  it('reports itself as valid when there is nothing wrong with it', async () => {
    await render(<FormField label="Name" value="Skarn" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Name').props['aria-invalid']).toBe(false);
  });
});
