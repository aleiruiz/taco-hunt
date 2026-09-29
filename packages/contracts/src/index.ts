import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const cursorTokenSchema = z.string().min(1).max(512);

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
  score: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
});
export type TacoSummary = z.infer<typeof tacoSummarySchema>;

export const publicReviewSchema = z.object({
  id: uuidSchema,
  tacoTypeId: uuidSchema,
  tacoName: z.string(),
  displayName: z.string().nullable(),
  tortilla: z.number().int().min(1).max(5),
  filling: z.number().int().min(1).max(5),
  salsa: z.number().int().min(1).max(5),
  value: z.number().int().min(1).max(5),
  score: z.number().min(1).max(5),
  pricePaidMxn: z.number().nonnegative().nullable(),
  body: z.string().max(500).nullable(),
  createdAt: isoTimestampSchema,
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

export const publicReviewPageSchema = z.object({
  items: z.array(publicReviewSchema),
  nextCursor: cursorTokenSchema.nullable(),
});
export type PublicReviewPage = z.infer<typeof publicReviewPageSchema>;

export const spotSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photoUrl: z.string().url().nullable(),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  reviewCount: z.number().int().nonnegative(),
  bestTaco: tacoSummarySchema.nullable(),
});
export type SpotSummary = z.infer<typeof spotSummarySchema>;

export const spotListResponseSchema = z.object({
  items: z.array(spotSummarySchema),
  nextCursor: cursorTokenSchema.nullable(),
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
  photoUrl: z.string().url().nullable(),
  reviewCount: z.number().int().nonnegative(),
  tacos: z.array(tacoSummarySchema),
  reviews: z.array(publicReviewSchema).max(5),
});
export type SpotDetail = z.infer<typeof spotDetailSchema>;

export const spotListQuerySchema = z
  .object({
    north: z.coerce.number().min(25).max(27).optional(),
    south: z.coerce.number().min(25).max(27).optional(),
    east: z.coerce.number().min(-101.5).max(-99).optional(),
    west: z.coerce.number().min(-101.5).max(-99).optional(),
    q: z.string().trim().max(100).optional(),
    tacoType: z.string().trim().max(80).optional(),
    cursor: cursorTokenSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .superRefine((query, context) => {
    if (query.north !== undefined && query.south !== undefined && query.south > query.north) {
      context.addIssue({
        code: "custom",
        path: ["south"],
        message: "south debe ser menor o igual a north",
      });
    }
    if (query.east !== undefined && query.west !== undefined && query.west > query.east) {
      context.addIssue({
        code: "custom",
        path: ["west"],
        message: "west debe ser menor o igual a east",
      });
    }
  });
export type SpotListQuery = z.infer<typeof spotListQuerySchema>;

export const reviewListQuerySchema = z.object({
  tacoType: z.string().trim().max(80).optional(),
  cursor: cursorTokenSchema.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const ratingSchema = z.number().int().min(1).max(5);
export const reviewCreateSchema = z
  .object({
    spotTacoId: uuidSchema,
    tortilla: ratingSchema,
    filling: ratingSchema,
    salsa: ratingSchema,
    value: ratingSchema,
    pricePaidMxn: z.number().nonnegative().max(10000).optional(),
    body: z.string().max(500).optional(),
    photoUploadId: uuidSchema.optional(),
  })
  .strict();
export const reviewPatchSchema = z
  .object({
    tortilla: ratingSchema.optional(),
    filling: ratingSchema.optional(),
    salsa: ratingSchema.optional(),
    value: ratingSchema.optional(),
    pricePaidMxn: z.number().nonnegative().max(10000).nullable().optional(),
    body: z.string().max(500).nullable().optional(),
    photoUploadId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "Incluye al menos un campo para actualizar");
export type ReviewPatch = z.infer<typeof reviewPatchSchema>;

export const personalPageQuerySchema = z.object({
  cursor: cursorTokenSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PersonalPageQuery = z.infer<typeof personalPageQuerySchema>;

export const reviewWriteResultSchema = z.object({
  id: uuidSchema,
  spotTacoId: uuidSchema,
  tortilla: ratingSchema,
  filling: ratingSchema,
  salsa: ratingSchema,
  value: ratingSchema,
  score: z.number().min(1).max(5),
  pricePaidMxn: z.number().nonnegative().nullable(),
  body: z.string().max(500).nullable(),
  status: z.enum(["visible", "hidden"]),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type ReviewWriteResult = z.infer<typeof reviewWriteResultSchema>;

export const ownReviewSchema = z.object({
  id: uuidSchema,
  spotTacoId: uuidSchema,
  spotId: uuidSchema.nullable(),
  spotName: z.string(),
  neighborhood: z.string(),
  tacoTypeId: uuidSchema.nullable(),
  tacoName: z.string(),
  tortilla: ratingSchema,
  filling: ratingSchema,
  salsa: ratingSchema,
  value: ratingSchema,
  score: z.number().min(1).max(5),
  pricePaidMxn: z.number().nonnegative().nullable(),
  body: z.string().max(500).nullable(),
  status: z.enum(["visible", "hidden"]),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type OwnReview = z.infer<typeof ownReviewSchema>;

export const ownReviewPageSchema = z.object({
  items: z.array(ownReviewSchema),
  nextCursor: cursorTokenSchema.nullable(),
});
export type OwnReviewPage = z.infer<typeof ownReviewPageSchema>;

export const favoriteSchema = spotSummarySchema.extend({ favoritedAt: isoTimestampSchema });
export type Favorite = z.infer<typeof favoriteSchema>;

export const favoritePageSchema = z.object({
  items: z.array(favoriteSchema),
  nextCursor: cursorTokenSchema.nullable(),
});
export type FavoritePage = z.infer<typeof favoritePageSchema>;
export const spotProposalSourceSchema = z.enum(["manual", "autocomplete"]);
export type SpotProposalSource = z.infer<typeof spotProposalSourceSchema>;

export const spotProposalSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    neighborhood: z.string().trim().min(2).max(120),
    latitude: z.number().min(25).max(27),
    longitude: z.number().min(-101.5).max(-99),
    note: z.string().max(500).optional(),
    source: spotProposalSourceSchema.default("manual"),
    sourceRef: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
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

export const placeAutocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});
export type PlaceAutocompleteQuery = z.infer<typeof placeAutocompleteQuerySchema>;

export const placeSuggestionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("spot"),
    id: uuidSchema,
    name: z.string(),
    neighborhood: z.string(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  z.object({
    kind: z.literal("google"),
    placeId: z.string().min(1).max(300),
    text: z.string(),
    secondaryText: z.string().nullable(),
  }),
]);
export type PlaceSuggestion = z.infer<typeof placeSuggestionSchema>;

export const placeAutocompleteResponseSchema = z.object({
  items: z.array(placeSuggestionSchema),
  attribution: z.string().nullable(),
});
export type PlaceAutocompleteResponse = z.infer<typeof placeAutocompleteResponseSchema>;

export const placeResolveResponseSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  neighborhood: z.string(),
  formattedAddress: z.string().nullable(),
  latitude: z.number().min(25).max(27),
  longitude: z.number().min(-101.5).max(-99),
  attribution: z.string().nullable(),
});
export type PlaceResolveResponse = z.infer<typeof placeResolveResponseSchema>;
