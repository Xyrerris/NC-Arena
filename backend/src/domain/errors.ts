/**
 * The closed error taxonomy every route answers with (ADR-0035, decision 4). A route handler
 * throws one of these; `server.ts`'s error handler is the only place that turns it into an
 * HTTP status and the `{ error: { code, message } }` envelope. `core/network`'s client-side
 * mapper reads `code`, never the HTTP status, for exactly the reason this file exists: the
 * status is transport, the code is the contract.
 */

export type ApiErrorCode =
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export const unauthorized = (message = 'Missing or invalid API key.'): ApiError =>
  new ApiError('UNAUTHORIZED', message);

export const notFound = (message: string): ApiError => new ApiError('NOT_FOUND', message);

export const validationError = (message: string): ApiError =>
  new ApiError('VALIDATION_ERROR', message);
