/**
 * The two device capabilities a backup needs, as one port (ADR-0033).
 *
 * One rather than two, unlike `core/ocr`'s `ImageSource` and `TextRecogniser`: those are
 * separate because they fail for different reasons the user has to be told apart. These
 * two are the same capability in both directions — a file leaving the app and a file
 * arriving — and nothing branches on which half failed.
 *
 * Both return `Result` rather than throwing, for the reason `core/common/result.ts` gives:
 * a share sheet the user dismissed and a file that could not be read are expected outcomes
 * the screen has a sentence for, not programmer errors.
 */

import type { Result } from '../common';

export interface BackupFile {
  /** Identifies the implementation in the failure the user is shown. */
  readonly name: string;
  /**
   * Writes `contents` to a file called `fileName` and hands it to the system share sheet,
   * so the user decides where their copy lives — Drive, a mail draft, the Downloads folder.
   *
   * The app deliberately does not choose a destination for them. The whole point of the
   * export is that the data leaves this device; a file written to app-private storage would
   * be taken by exactly the uninstall this feature exists to survive.
   */
  write(fileName: string, contents: string): Promise<Result<void>>;
  /**
   * The text of a document the user picked, or **null when they backed out of the picker**.
   *
   * Cancelling is a value rather than an error for the same reason it is in `ImageSource`:
   * it is the most common thing that happens after opening a picker by accident, and
   * reporting it as a failure would put "That file could not be read" on screen every time
   * somebody changed their mind.
   */
  read(): Promise<Result<string | null>>;
}
