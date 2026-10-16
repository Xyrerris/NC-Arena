/**
 * Cross-cutting utilities.
 *
 * `toFixed` is banned in this directory by an ESLint rule that errors with a pointer to
 * ARCHITECTURE.md §2.2. The short version: (9.995).toFixed(2) === "9.99", and 9,995 B is
 * one of the three boundaries the formatting contract is tested at.
 */

export type {
  AccountCredentials,
  AccountError,
  AccountFailure,
  AccountGateway,
  LinkedAccount,
} from './accountGateway';
export type { AvatarError, AvatarIdentity, AvatarSource } from './avatarSource';
export type { BalanceError, BalanceSource } from './balanceSource';
export type {
  CollectionError,
  CollectionFailure,
  CollectionSource,
  UnlockedCollections,
} from './collectionSource';
export type {
  MarketError,
  MarketFailure,
  MarketListing,
  MarketSource,
  ScanOptions,
} from './marketSource';
export type { GameSheets, SheetError, SheetFailure, SheetSource } from './sheetSource';
export type {
  StageError,
  TransactionResult,
  TransactionSender,
  TransactionStatus,
} from './transactionSender';
export type {
  GoldCurrency,
  TransactionSource,
  TransactionSourceError,
  UnsignedRequest,
} from './transactionSource';
export { err, isOk, ok, type Result } from './result';
export type {
  RosterPush,
  RosterPushResult,
  RosterSink,
  RosterSnapshot,
  RosterSource,
} from './rosterSource';
export { nextChangeIn, timeSince } from './relativeTime';
export { assertSafeInteger, divideHalfUp, pow10, rescaleHalfUp } from './rounding';
export {
  DOT_SEPARATORS,
  createStatFormatter,
  isShortUnit,
  statFormatter,
  type Separators,
  type ShortUnit,
  type StatFormatter,
} from './statFormatter';
