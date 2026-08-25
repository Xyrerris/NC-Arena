/**
 * `TextRecogniser` over ML Kit's on-device text recognition (ADR-0024).
 *
 * On-device rather than a cloud OCR service, and that is a product decision rather than a
 * performance one: a screenshot of a game profile carries a player's name and account
 * code, and there is no backend in this app to send it to (ARCHITECTURE.md §9, decision 1).
 * Nothing leaves the phone, so there is nothing to write a privacy policy about.
 *
 * ML Kit returns blocks of lines of elements. Lines are the right grain for
 * `parseStatSheet`: a block glues the whole stat panel into one string and loses the
 * per-row geometry the parser pairs labels with, and elements split `11.724.329.467` at
 * every dot.
 */

import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';

import { err, ok, type Result } from '../common';
import type { TextRecogniser } from './ports';
import type { ScannedLine } from './statSheet';

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

export const mlKitTextRecogniser: TextRecogniser = {
  name: 'mlkit-text-recognition',

  recognise: async (uri: string): Promise<Result<readonly ScannedLine[]>> => {
    try {
      const recognised = await recognizeText(uri);
      const lines: ScannedLine[] = recognised.blocks.flatMap((block) =>
        block.lines.map((line) => ({ text: line.text, frame: { ...line.frame } })),
      );
      return ok(lines);
    } catch (cause) {
      return err(toError(cause));
    }
  },
};
