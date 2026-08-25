/**
 * The scan pipeline (ADR-0024), driven through its two ports.
 *
 * Nothing here touches a device, which is the payoff of splitting `ImageSource` from
 * `TextRecogniser`: the three outcomes the form has to tell apart — cancelled, failed,
 * read nothing useful — are ordinary function calls in the Node project.
 */

import { err, ok, type Result } from '../common';
import type { ImageSource, PickedImage, TextRecogniser } from './ports';
import { createStatScanner } from './statScanner';
import type { ScannedLine } from './statSheet';

const URI = 'file:///cache/scan.png';
const ASSET_ID = 'content://media/external/images/media/12345';

const PICKED: PickedImage = { uri: URI, assetId: ASSET_ID };

const SHEET: ScannedLine[] = [
  { text: 'Lv.488 Deus #a984', frame: { left: 700, top: 58, right: 922, bottom: 92 } },
  { text: 'CP 11.724.329.467', frame: { left: 1378, top: 265, right: 1632, bottom: 299 } },
  { text: 'HP 1440085258', frame: { left: 1398, top: 366, right: 1610, bottom: 400 } },
];

/**
 * A photo library that records what it was asked to delete. The counters are the point of
 * most of this file: "the screenshot survives a failed read" is a claim about a call that
 * did *not* happen, and there is no other way to assert one.
 */
interface FakeSource extends ImageSource {
  readonly copiesDropped: string[];
  readonly originalsDeleted: string[];
}

const sourceThat = (
  result: Awaited<ReturnType<ImageSource['pick']>>,
  onDeleteOriginal: () => Result<void> = () => ok(undefined),
): FakeSource => {
  const copiesDropped: string[] = [];
  const originalsDeleted: string[] = [];
  return {
    name: 'fake-source',
    copiesDropped,
    originalsDeleted,
    pick: async () => result,
    discardCopy: async (uri) => {
      copiesDropped.push(uri);
      return ok(undefined);
    },
    discardOriginal: async (assetId) => {
      const outcome = onDeleteOriginal();
      if (outcome.ok) originalsDeleted.push(assetId);
      return outcome;
    },
  };
};

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
      source: sourceThat(ok(PICKED)),
      recogniser: recogniserThat(ok(SHEET)),
    });

    const result = await scanner.scan();
    if (!result.ok) throw new Error(`expected a scan, got: ${result.error.message}`);
    expect(result.value?.sheet.values).toMatchObject({
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
      source: sourceThat(ok(PICKED)),
      recogniser: recogniserThat(err(new Error('That file is not an image.'))),
    });

    const result = await scanner.scan();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('That file is not an image.');
  });

  it('fails, rather than succeeding emptily, when the picture holds no stats', async () => {
    const scanner = createStatScanner({
      source: sourceThat(ok(PICKED)),
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
      source: sourceThat(ok(PICKED)),
      recogniser: recogniserThat(
        ok([{ text: 'SPD 1014675713', frame: { left: 1398, top: 556, right: 1610, bottom: 590 } }]),
      ),
    });

    const result = await scanner.scan();
    if (!result.ok) throw new Error('expected a partial scan to succeed');
    expect(result.value?.sheet.found).toEqual(['spd']);
    expect(result.value?.sheet.missing).toContain('name');
  });
});

/**
 * ADR-0026. The rule underneath every case here is one sentence: the original goes only
 * after a read that produced stats. Everything else is the app tidying up after itself.
 */
describe('createStatScanner - what happens to the screenshot', () => {
  const reading = (source: FakeSource) =>
    createStatScanner({ source, recogniser: recogniserThat(ok(SHEET)) });

  it('deletes the screenshot once its stats are in hand, and says so', async () => {
    const source = sourceThat(ok(PICKED));

    const result = await reading(source).scan();

    expect(source.originalsDeleted).toEqual([ASSET_ID]);
    expect(source.copiesDropped).toEqual([URI]);
    expect(result.ok && result.value?.screenshot).toBe('DELETED');
  });

  it('keeps the screenshot when the picture could not be read', async () => {
    const source = sourceThat(ok(PICKED));
    const scanner = createStatScanner({
      source,
      recogniser: recogniserThat(err(new Error('That file is not an image.'))),
    });

    await scanner.scan();

    // A screenshot that failed to read is a screenshot the user still needs - to try
    // again, or to type from. The working copy still goes: that one is the app's litter.
    expect(source.originalsDeleted).toEqual([]);
    expect(source.copiesDropped).toEqual([URI]);
  });

  it('keeps the screenshot when it held no stats, because it is the evidence', async () => {
    const source = sourceThat(ok(PICKED));
    const scanner = createStatScanner({
      source,
      recogniser: recogniserThat(
        ok([{ text: 'Sunset over the harbour', frame: { left: 0, top: 0, right: 9, bottom: 9 } }]),
      ),
    });

    await scanner.scan();

    expect(source.originalsDeleted).toEqual([]);
  });

  it('deletes nothing at all when the picker was cancelled', async () => {
    const source = sourceThat(ok(null));

    await reading(source).scan();

    expect(source.originalsDeleted).toEqual([]);
    expect(source.copiesDropped).toEqual([]);
  });

  it('reports COPY_ONLY when the library never named the original', async () => {
    // The user browsed the filesystem directly, or granted access to selected photos only.
    // There is nothing to delete and the note has to say the picture is still there.
    const source = sourceThat(ok({ uri: URI, assetId: null }));

    const result = await reading(source).scan();

    expect(source.copiesDropped).toEqual([URI]);
    expect(result.ok && result.value?.screenshot).toBe('COPY_ONLY');
  });

  it('reports KEPT when the deletion was refused, rather than claiming success', async () => {
    // Android asks its own confirmation and the user may say no. The stats are still good;
    // the picture is still there; the note must not say otherwise.
    const source = sourceThat(ok(PICKED), () => err(new Error('The user said no.')));

    const result = await reading(source).scan();

    expect(result.ok).toBe(true);
    expect(source.originalsDeleted).toEqual([]);
    expect(result.ok && result.value?.screenshot).toBe('KEPT');
  });

  it('still returns the stats when the screenshot could not be removed', async () => {
    const source = sourceThat(ok(PICKED), () => err(new Error('The user said no.')));

    const result = await reading(source).scan();

    // Failing to tidy up is not a reason to throw away a read that worked.
    expect(result.ok && result.value?.sheet.values.name).toBe('Deus');
  });
});
