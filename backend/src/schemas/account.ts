import { z } from 'zod';

/** `POST /v1/accounts`'s response. Both secrets are shown exactly once (ADR-0035, decision 2). */
export const createAccountResponseSchema = z.object({
  accountId: z.uuid(),
  apiKey: z.string(),
  recoveryCode: z.string(),
});
export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;

export const linkAccountRequestSchema = z.object({
  recoveryCode: z.string().min(1),
});
export type LinkAccountRequest = z.infer<typeof linkAccountRequestSchema>;

export const linkAccountResponseSchema = z.object({
  accountId: z.uuid(),
  apiKey: z.string(),
});
export type LinkAccountResponse = z.infer<typeof linkAccountResponseSchema>;
