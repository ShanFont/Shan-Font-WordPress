import { z } from 'zod';

export const taskTypeSchema = z.enum(['sentence', 'page']);
export const roleSchema = z.enum(['contributor', 'admin']);
export const accountStatusSchema = z.enum(['active', 'suspended', 'disabled']);
export const contactMethodSchema = z.enum(['phone', 'line', 'facebook', 'email', 'other']);

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(2).max(40),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(200),
});

export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  contactMethod: contactMethodSchema.optional(),
  contactValue: z.string().max(200).optional(),
  leaderboardOptIn: z.boolean().optional(),
});

export const claimSchema = z.object({
  taskType: taskTypeSchema,
});

export const draftSchema = z.object({
  shanText: z.string().max(100_000),
  expectedVersion: z.number().int().positive(),
});

export const submitSchema = z.object({
  expectedDraftVersion: z.number().int().positive(),
});

export const reportSchema = z.object({
  taskId: z.string().uuid(),
  reason: z.string().trim().min(3).max(2000),
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(2000).default(''),
});

export const categoryPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

export const importCreateSchema = z.object({
  categoryId: z.string().uuid(),
  taskType: taskTypeSchema,
  provenance: z.string().trim().min(3).max(2000),
  permissionRef: z.string().trim().min(3).max(2000),
});

export const columnMappingSchema = z.object({
  externalId: z.string().min(1),
  sourceText: z.string().min(1),
  context: z.string().optional(),
  documentId: z.string().optional(),
  topic: z.string().optional(),
  sourceReference: z.string().optional(),
});

export const importValidateSchema = z.object({
  sheet: z.string().min(1),
  mapping: columnMappingSchema,
});

export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('return'), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('pause'), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('archive'), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('release'), reason: z.string().trim().min(3).max(2000) }),
  z.object({
    action: z.literal('replace'),
    reason: z.string().trim().min(3).max(2000),
    englishText: z.string().trim().min(1).max(100_000),
  }),
  z.object({ action: z.literal('exclude'), reason: z.string().trim().min(3).max(2000) }),
]);

export const userPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  role: roleSchema.optional(),
  status: accountStatusSchema.optional(),
  contactMethod: contactMethodSchema.optional(),
  contactValue: z.string().max(200).optional(),
  leaderboardOptIn: z.boolean().optional(),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'deny', 'needs_edit']),
  reason: z.string().trim().max(2000).optional(),
  disposition: z.enum(['return', 'archive']).optional(),
});

export const bulkItemSchema = z.object({
  revisionId: z.string().uuid(),
  decision: z.enum(['approve', 'deny', 'needs_edit']),
  reason: z.string().trim().max(2000).optional(),
  disposition: z.enum(['return', 'archive']).optional(),
});

export const bulkPreviewSchema = z.object({
  revisionIds: z.array(z.string().uuid()).min(1).max(200),
});

export const bulkConfirmSchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(200),
});

export const rateCreateSchema = z.object({
  taskType: taskTypeSchema,
  amountSatang: z.number().int().positive(),
  effectiveAt: z.string().datetime(),
});

export const payoutConfirmSchema = z.object({
  method: z.enum(['thai_bank_transfer', 'thai_qr']),
  paidAt: z.string().datetime(),
  reference: z.string().trim().min(2).max(200),
});

export const adjustmentSchema = z.object({
  amountSatang: z
    .number()
    .int()
    .refine((value) => value !== 0, 'Amount cannot be zero'),
  reason: z.string().trim().min(3).max(2000),
});

export const exportCreateSchema = z.object({
  format: z.enum(['jsonl', 'csv', 'tsv', 'xlsx']),
  categoryId: z.string().uuid().optional(),
  taskType: taskTypeSchema.optional(),
  approvedFrom: z.string().datetime().optional(),
  approvedTo: z.string().datetime().optional(),
  split: z.boolean().default(true),
});

export const guideCreateSchema = z.object({
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(100_000),
});

export const termsCreateSchema = guideCreateSchema;

export const reportResolveSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolution: z.string().trim().min(3).max(2000),
});

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
