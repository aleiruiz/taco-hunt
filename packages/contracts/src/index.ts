import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });

export const apiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const tacoSummarySchema = z.object({
  id: uuidSchema,
  tacoTypeId: uuidSchema,
  name: z.string(),
  name: z.string(),
  score: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
});
export type TacoSummary = z.infer<typeof tacoSummarySchema>;

export const spotSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  reviewCount: z.number().int().nonnegative(),
  bestTaco: tacoSummarySchema.nullable(),
});
export type SpotSummary = z.infer<typeof spotSummarySchema>;

export const spotListResponseSchema = z.object({
  items: z.array(spotSummarySchema),
  nextCursor: uuidSchema.nullable(),
});
export type SpotListResponse = z.infer<typeof spotListResponseSchema>;

export const tacoTypeSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  nameEs: z.string(),
});
export const tacoTypesResponseSchema = z.object({ items: z.array(tacoTypeSchema) });

export const spotDetailSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  tacos: z.array(tacoSummarySchema),
});
export type SpotDetail = z.infer<typeof spotDetailSchema>;

export const spotListQuerySchema = z.object({
  north: z.coerce.number().min(25).max(27).optional(),
  south: z.coerce.number().min(25).max(27).optional(),
  east: z.coerce.number().min(-101.5).max(-99).optional(),
  west: z.coerce.number().min(-101.5).max(-99).optional(),
  q: z.string().trim().max(100).optional(),
  tacoType: z.string().trim().max(80).optional(),
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).superRefine((query, context) => {
  if (query.north !== undefined && query.south !== undefined && query.south > query.north) {
    context.addIssue({ code: "custom", path: ["south"], message: "south debe ser menor o igual a north" });
  }
  if (query.east !== undefined && query.west !== undefined && query.west > query.east) {
    context.addIssue({ code: "custom", path: ["west"], message: "west debe ser menor o igual a east" });
  }
});
export type SpotListQuery = z.infer<typeof spotListQuerySchema>;

export const ratingSchema = z.number().int().min(1).max(5);
export const reviewCreateSchema = z.object({
  spotTacoId: uuidSchema,
  tortilla: ratingSchema,
  filling: ratingSchema,
  salsa: ratingSchema,
  value: ratingSchema,
  pricePaidMxn: z.number().nonnegative().max(10000).optional(),
  body: z.string().max(500).optional(),
  photoUploadId: uuidSchema.optional(),
});
export const spotProposalSchema = z.object({
  name: z.string().trim().min(2).max(120),
  neighborhood: z.string().trim().min(2).max(120),
  latitude: z.number().min(25).max(27),
  longitude: z.number().min(-101.5).max(-99),
  note: z.string().max(500).optional(),
});
export const tacoProposalSchema = z.object({
  spotId: uuidSchema,
  tacoTypeId: uuidSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});
export const reportSchema = z.object({
  targetType: z.enum(["spot", "review"]),
  targetId: uuidSchema,
  reason: z.enum(["inaccurate", "abusive", "spam", "closed", "other"]),
  note: z.string().max(500).optional(),
});
