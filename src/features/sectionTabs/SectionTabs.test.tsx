/**
 * The Arena | Collection switcher: it says which section is current, goes to the other with
 * `replace` (the two are siblings, so no history is built), and does nothing when the current
 * one is pressed again.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import { SectionTabs } from './SectionTabs';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const press = async (label: string): Promise<void> => {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
  });
};

describe('SectionTabs', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockReplace.mockClear();
  });
  afterEach(async () => {
    await cleanup();
  });

  it('marks the current section as selected', async () => {
    await render(<SectionTabs current="collection" />);

    const [arena, collection] = screen.getAllByRole('tab');

    expect(arena?.props.accessibilityState).toMatchObject({ selected: false });
    expect(collection?.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('goes to the collection from the arena by replacing the route', async () => {
    await render(<SectionTabs current="arena" />);

    await press('COLLECTION');

    expect(mockReplace).toHaveBeenCalledWith('/collection');
  });

  it('goes back to the arena from the collection', async () => {
    await render(<SectionTabs current="collection" />);

    await press('ARENA');

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('does nothing when the current section is pressed again', async () => {
    await render(<SectionTabs current="arena" />);

    await press('ARENA');

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
