import { ViewerScreen } from '@/features/playerForm';
import { RosterBackupControls } from '@/features/rosterBackup';

/**
 * "You" route (ADR-0022), and the home of the roster backup controls (ADR-0033).
 *
 * Thin, like every other route — but not *only* a name any more: it composes two features,
 * which is the one thing a route may do that neither of them can. ARCHITECTURE.md §4 forbids
 * a feature importing another, and getting the roster off this device is not part of editing
 * a player, so the pair meets here rather than inside `playerForm`.
 *
 * `/me` is where they belong because it is the only settings-free screen the app has, and
 * because the backup is about *this device's* copy of the ladder — which is the same subject
 * as "which player on it is you".
 *
 * `/me` is a static segment at the root, so it cannot collide with `/player/[id]` — the two
 * live in different directories, and nothing here is a player id.
 */
export default function ViewerRoute() {
  return <ViewerScreen footer={<RosterBackupControls />} />;
}
