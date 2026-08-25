/**
 * The scan pipeline (ADR-0024), driven through its two ports.
 *
 * Nothing here touches a device, which is the payoff of splitting `ImageSource` from
 * `TextRecogniser`: the three outcomes the form has to tell apart — cancelled, failed,
 * read nothing useful — are ordinary function calls in the Node project.
 */

import { err, ok } from '../common';
import type { ImageSource, TextRecogniser } from './ports';
import { createStatScanner } from './statScanner';
import type { ScannedLine } from './statSheet';

const URI = 'file:///cache/scan.png';

const SHEET: ScannedLine[] = [
  { text: 'Lv.488 Deus #a984', frame: { left: 700, top: 58, right: 922, bottom: 92 } },
  { text: 'CP 11.724.329.467', frame: { left: 1378, top: 265, right: 1632, bottom: 299 } },
  { text: 'HP 1440085258', frame: { left: 1398, top: 366, right: 1610, bottom: 400 } },
];

const sourceThat = (result: Awaited<ReturnType<ImageSource['pick']>>): ImageSource => ({
  name: 'fake-source',
  pick: async () => result,
});

const recogniserThat = (
  result: Awaited<ReturnType<TextRecogniser['recognise']>>,
): TextRecogniser => ({
  name: 'fake-recogniser',
  recognise: async () => result,
});

const readingNothing = recogniserThat(ok([]));

describe('createStatScanner', () => {
  it('returns the fields a screenshot yielded', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(URI)),
      recogniser: recogniserThat(ok(SHEET)),
    });

    const result = await scanner.scan();
    if (!result.ok) throw new Error(`expected a scan, got: ${result.error.message}`);
    expect(result.value?.values).toMatchObject({
      name: 'Deus',
      level: 488,
      gameCode: 'a984',
      combatPower: 11_724_329_467,
      hp: 1_440_085_258,
    });
  });

  it('reports a cancelled picker as nothing rather than as a failure', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(null)),
      recogniser: readingNothing,
    });

    const result = await scanner.scan();
    // The most common thing that happens after opening a picker by accident. Surfacing it
    // as an error would put a red message on screen for a decision the user already made.
    expect(result).toEqual({ ok: true, value: null });
  });

  it('does not open the recogniser when the picker was cancelled', async () => {
    const recognise = jest.fn(async () => ok(SHEET));
    const scanner = createStatScanner({
      source: sourceThat(ok(null)),
      recogniser: { name: 'counting', recognise },
    });

    await scanner.scan();
    expect(recognise).not.toHaveBeenCalled();
  });

  it('passes a picker failure through with its own message', async () => {
    const scanner = createStatScanner({
      source: sourceThat(err(new Error('No access to your photos.'))),
      recogniser: readingNothing,
    });

    const result = await scanner.scan();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The permission problem, not "could not read the image": the two have different fixes
    // and the port keeps them apart.
    expect(result.error.message).toBe('No access to your photos.');
  });

  it('passes a recogniser failure through', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(URI)),
      recogniser: recogniserThat(err(new Error('That file is not an image.'))),
    });

    const result = await scanner.scan();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('That file is not an image.');
  });

  it('fails, rather than succeeding emptily, when the picture holds no stats', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(URI)),
      recogniser: recogniserThat(
        ok([{ text: 'Sunset over the harbour', frame: { left: 0, top: 0, right: 9, bottom: 9 } }]),
      ),
    });

    const result = await scanner.scan();
    // An empty success would leave the form untouched and the user unable to tell whether
    // the scan ran at all.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('No stats were found');
  });

  it('succeeds on a partial read, because a form the user finishes is still a win', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(URI)),
      recogniser: recogniserThat(
        ok([{ text: 'SPD 1014675713', frame: { left: 1398, top: 556, right: 1610, bottom: 590 } }]),
      ),
    });

    const result = await scanner.scan();
    if (!result.ok) throw new Error('expected a partial scan to succeed');
    expect(result.value?.found).toEqual(['spd']);
    expect(result.value?.missing).toContain('name');
  });
});
