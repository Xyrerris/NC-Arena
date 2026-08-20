/**
 * The three decisions ArenaText centralises (ARCHITECTURE.md §2.5, §6). Each is asserted
 * here rather than in each component, because that is the whole reason the primitive exists.
 *
 * `render` is **awaited**: React Native Testing Library 14 returns a promise, and without
 * the await `screen` reports "render has not been called" for a component that rendered
 * perfectly well. Phase 0 configured the jest-expo project and never ran a test through it,
 * so this was found the first time it mattered — see ADR-0007.
 */

import { render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { ArenaText } from './ArenaText';
import { color } from './tokens';

const styleOf = (testID: string): Record<string, unknown> => {
  const style = screen.getByTestId(testID).props.style as unknown;
  const parts = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean);
  return Object.assign({}, ...parts) as Record<string, unknown>;
};

describe('ArenaText', () => {
  it('renders its children', async () => {
    await render(<ArenaText>2,418,904,113</ArenaText>);
    expect(screen.getByText('2,418,904,113')).toBeTruthy();
  });

  it('gives numeric variants tabular figures, so the column cannot jitter', async () => {
    await render(
      <ArenaText testID="numeric" variant="numericSmall">
        2,418,904,113
      </ArenaText>,
    );
    expect(styleOf('numeric').fontVariant).toEqual(['tabular-nums']);
  });

  it('leaves prose alone', async () => {
    await render(
      <ArenaText testID="prose" variant="body">
        Arena
      </ArenaText>,
    );
    expect(styleOf('prose').fontVariant).toBeUndefined();
  });

  it('resolves a tone to a token, never to a raw colour', async () => {
    await render(
      <ArenaText testID="subtle" tone="subtle">
        label
      </ArenaText>,
    );
    expect(styleOf('subtle').color).toBe(color.text.subtle);
  });

  it('does not cap font scaling by default (ARCHITECTURE.md §2.5)', async () => {
    await render(<ArenaText testID="uncapped">Arena</ArenaText>);
    expect(screen.getByTestId('uncapped').props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('passes a cap through when a call site opts in', async () => {
    await render(
      <ArenaText testID="capped" maxFontSizeMultiplier={1.4}>
        Arena
      </ArenaText>,
    );
    expect(screen.getByTestId('capped').props.maxFontSizeMultiplier).toBe(1.4);
  });

  it('sets a line height only where the scale asks for one', async () => {
    await render(
      <>
        <ArenaText testID="leaded" variant="body">
          copy
        </ArenaText>
        <ArenaText testID="unleaded" variant="titleSmall">
          title
        </ArenaText>
      </>,
    );
    // `body` is 13.5 px at 1.65 leading. The scale is read from the environment rather
    // than assumed: jest-expo runs at fontScale 2, which means every one of these tests is
    // already a 200 % check — the case ROADMAP.md Phase 1 cares about most.
    const { fontScale } = Dimensions.get('window');
    expect(styleOf('leaded').lineHeight).toBe(Math.round(13.5 * 1.65 * fontScale));
    expect(styleOf('unleaded').lineHeight).toBeUndefined();
  });
});
