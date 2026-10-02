import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const cursorTokenSchema = z.string().min(1).max(512);

// A Google place ID is the only Google-owned value that may be retained as a
// durable Taco Hunt relationship. Google display fields remain transient.
export const googlePlaceIdSchema = z.string().trim().min(1).max(300);
export type GooglePlaceId = z.infer<typeof googlePlaceIdSchema>;

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
  // Durable relationship only; Google display data is never stored here.
  googlePlaceId: googlePlaceIdSchema.optional(),
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
  // Durable relationship only; hydrate Google details separately on demand.
  googlePlaceId: googlePlaceIdSchema.optional(),
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

// --- T51: contract consolidation from Phase A's Data needs ---
// These schemas are additive and unimplemented until their Phase B task
// (noted per group) builds the endpoint and swaps the matching Phase A
// fixture adapter. Nothing here changes an existing shape.

// T33/T34 — GET /v1/spots/map viewport pins with server-side clustering.
export const mapPinSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bestTaco: z.string().nullable(),
});
export type MapPin = z.infer<typeof mapPinSchema>;

export const mapClusterSchema = z.object({
  count: z.number().int().positive(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bounds: z.object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  }),
});
export type MapCluster = z.infer<typeof mapClusterSchema>;

export const mapPinsQuerySchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
  tacoType: z.string().trim().max(80).optional(),
});
export type MapPinsQuery = z.infer<typeof mapPinsQuerySchema>;

export const mapPinsResponseSchema = z.object({
  pins: z.array(mapPinSchema),
  clusters: z.array(mapClusterSchema),
});
export type MapPinsResponse = z.infer<typeof mapPinsResponseSchema>;

// T52 — GET /v1/search/suggest, swaps T35's search fixture adapter.
export const searchColoniaSuggestionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  municipality: z.string(),
  spotCount: z.number().int().nonnegative(),
});
export type SearchColoniaSuggestion = z.infer<typeof searchColoniaSuggestionSchema>;

export const searchPuestoSuggestionSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  neighborhood: z.string(),
  bestTaco: z.string().nullable(),
  reviewCount: z.number().int().nonnegative(),
});
export type SearchPuestoSuggestion = z.infer<typeof searchPuestoSuggestionSchema>;

export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "near debe ser 'latitud,longitud'")
    .optional(),
});
export type SearchSuggestQuery = z.infer<typeof searchSuggestQuerySchema>;

export const searchSuggestResponseSchema = z.object({
  colonias: z.array(searchColoniaSuggestionSchema),
  puestos: z.array(searchPuestoSuggestionSchema),
});
export type SearchSuggestResponse = z.infer<typeof searchSuggestResponseSchema>;

// T37 — spot photo gallery, swaps T39's and T38's fixture adapters.
export const spotPhotoStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type SpotPhotoStatus = z.infer<typeof spotPhotoStatusSchema>;

export const spotPhotoKindSchema = z.enum(["tacos", "puesto", "menu"]);
export type SpotPhotoKind = z.infer<typeof spotPhotoKindSchema>;

export const spotPhotoSchema = z.object({
  id: uuidSchema,
  url: z.string().url(),
  uploaderId: uuidSchema,
  uploaderName: z.string(),
  kind: spotPhotoKindSchema,
  status: spotPhotoStatusSchema,
  rejectionReason: z.string().max(500).nullable(),
  createdAt: isoTimestampSchema,
});
export type SpotPhoto = z.infer<typeof spotPhotoSchema>;

// GET /v1/spots/:id/photos is public (no auth) and only ever lists approved
// photos, so it must not expose uploaderId, status, or rejectionReason.
// SpotPhoto (with those fields) is for the uploader's own view and the admin
// moderation queue (AdminSpotPhoto below), not this public list.
export const publicSpotPhotoSchema = spotPhotoSchema.pick({
  id: true,
  url: true,
  uploaderName: true,
  kind: true,
  createdAt: true,
});
export type PublicSpotPhoto = z.infer<typeof publicSpotPhotoSchema>;

export const spotPhotoListResponseSchema = z.object({ items: z.array(publicSpotPhotoSchema) });
export type SpotPhotoListResponse = z.infer<typeof spotPhotoListResponseSchema>;

export const spotPhotoCreateSchema = z
  .object({
    photoUploadId: uuidSchema,
    kind: spotPhotoKindSchema.default("tacos"),
  })
  .strict();
export type SpotPhotoCreate = z.infer<typeof spotPhotoCreateSchema>;

// Admin moderation queue item for pending spot photos (extends SpotPhoto
// with which stand it belongs to, since the admin queue spans all spots).
export const adminSpotPhotoSchema = spotPhotoSchema.extend({
  spotId: uuidSchema,
  spotName: z.string(),
});
export type AdminSpotPhoto = z.infer<typeof adminSpotPhotoSchema>;

// T40 — GET/PATCH /v1/me, swaps T41's and T32's fixture adapters.
export const avatarPresetSchema = z.enum([
  "pastor",
  "masa",
  "cilantro",
  "tortilla",
  "salsa",
  "comal",
  "aguacate",
  "horchata",
]);
export type AvatarPreset = z.infer<typeof avatarPresetSchema>;

export const profileSchema = z.object({
  id: uuidSchema,
  displayName: z.string().max(60).nullable(),
  role: z.enum(["user", "admin"]),
  avatarPreset: avatarPresetSchema,
  avatarPhotoUrl: z.string().url().nullable(),
  avatarPhotoStatus: spotPhotoStatusSchema.nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60).nullable().optional(),
    avatarPreset: avatarPresetSchema.optional(),
    avatarPhotoUploadId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "Incluye al menos un campo para actualizar");
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

// T49 — GET /v1/me/progress, swaps T48's progress fixture.
export const badgeIdSchema = z.enum([
  "recien-llegado",
  "primera-mordida",
  "pionero",
  "explorador",
  "cazador",
  "fotografo",
]);
export type BadgeId = z.infer<typeof badgeIdSchema>;

export const progressBadgeSchema = z.object({
  id: badgeIdSchema,
  earned: z.boolean(),
  current: z.number().int().nonnegative(),
  target: z.number().int().positive(),
});
export type ProgressBadge = z.infer<typeof progressBadgeSchema>;

export const progressResponseSchema = z.object({
  badges: z.array(progressBadgeSchema),
  nextChallenge: z
    .object({
      badgeId: badgeIdSchema,
      label: z.string(),
      current: z.number().int().nonnegative(),
      target: z.number().int().positive(),
    })
    .nullable(),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

// T42 — import-candidate approval API, swaps T50's fixture adapter.
export const importCandidateStateSchema = z.enum(["pending", "approved", "rejected"]);
export type ImportCandidateState = z.infer<typeof importCandidateStateSchema>;

export const importCandidateMatchSchema = z.object({
  spotId: uuidSchema,
  spotName: z.string(),
  distanceMeters: z.number().nonnegative(),
});
export type ImportCandidateMatch = z.infer<typeof importCandidateMatchSchema>;

export const importCandidateSchema = z.object({
  id: uuidSchema,
  normalizedName: z.string(),
  originalName: z.string(),
  address: z.string(),
  latitude: z.number().min(25).max(27),
  longitude: z.number().min(-101.5).max(-99),
  source: z.string(),
  sourceRef: z.string(),
  licenseRef: z.string(),
  importBatchId: uuidSchema,
  matches: z.array(importCandidateMatchSchema),
  state: importCandidateStateSchema,
  reviewNotes: z.string().max(1000).nullable(),
  createdAt: isoTimestampSchema,
});
export type ImportCandidate = z.infer<typeof importCandidateSchema>;

export const importCandidateListResponseSchema = z.object({
  items: z.array(importCandidateSchema),
});
export type ImportCandidateListResponse = z.infer<typeof importCandidateListResponseSchema>;

export const importCandidateApproveSchema = z
  .object({
    latitude: z.number().min(25).max(27),
    longitude: z.number().min(-101.5).max(-99),
  })
  .strict();
export type ImportCandidateApprove = z.infer<typeof importCandidateApproveSchema>;

export const importCandidateRejectSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export type ImportCandidateReject = z.infer<typeof importCandidateRejectSchema>;

export const importCandidateMergeSchema = z
  .object({
    canonicalSpotId: uuidSchema,
    reason: z.string().max(500).optional(),
  })
  .strict();
export type ImportCandidateMerge = z.infer<typeof importCandidateMergeSchema>;

// T47 follow-up — opening-time chips on spot-proposals have no backing
// field yet (flagged as UI-only local state in that PR's Data needs).
// Adding it here, additive, so T51's consumers can adopt it once a
// migration lands; not yet required by spotProposalSchema.
export const openingTimeSchema = z.enum(["manana", "tarde", "noche"]);
export type OpeningTime = z.infer<typeof openingTimeSchema>;

// --- T64: Google Places contract gate ---
// Google-owned display fields below are transient API response data. They are
// intentionally kept separate from Taco Hunt-owned records and must not be
// persisted by the API. A Google place ID is the only Google-owned value that
// may be retained as a durable relationship (T65).
export const googleAttributionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url(),
});
export type GoogleAttribution = z.infer<typeof googleAttributionSchema>;

export const durablePlaceLinkSchema = z.object({
  googlePlaceId: googlePlaceIdSchema,
});
export type DurablePlaceLink = z.infer<typeof durablePlaceLinkSchema>;

// Rating an undiscovered Google place creates its Taco Hunt record as part of
// starting the review. The user still chooses the taco type before creation.
export const googleReviewTargetCreateSchema = z
  .object({
    placeId: googlePlaceIdSchema,
    tacoTypeId: uuidSchema,
  })
  .strict();
export type GoogleReviewTargetCreate = z.infer<typeof googleReviewTargetCreateSchema>;

export const googleReviewTargetSchema = z.object({
  spotTacoId: uuidSchema,
  spotId: uuidSchema,
  spotName: z.string().min(1),
  tacoName: z.string().min(1),
});
export type GoogleReviewTarget = z.infer<typeof googleReviewTargetSchema>;

// Google viewport results are hydrated for the current map request only.
export const googleViewportResultSchema = z.object({
  source: z.literal("google"),
  placeId: googlePlaceIdSchema,
  name: z.string(),
  neighborhood: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // The API proxies this transient Google photo resource so the API key never
  // reaches the mobile client.
  photoName: z.string().trim().min(1).optional(),
  googleMapsUrl: z.string().url(),
  attribution: googleAttributionSchema,
});
export type GoogleViewportResult = z.infer<typeof googleViewportResultSchema>;

// Only Taco Hunt-owned proposal pins may carry a durable local ID. Pending
// pins are returned only where the API has established the viewer may see
// them; Google results are never mixed into this shape.
export const localProposalPinSchema = z.object({
  source: z.literal("taco-hunt"),
  id: uuidSchema,
  name: z.string().nullable(),
  neighborhood: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status: z.enum(["pending", "approved"]),
  photoUrl: z.string().url().nullable(),
});
export type LocalProposalPin = z.infer<typeof localProposalPinSchema>;

export const placesViewportQuerySchema = z
  .object({
    north: z.coerce.number().min(-90).max(90),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    west: z.coerce.number().min(-180).max(180),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((query, context) => {
    if (query.south > query.north) {
      context.addIssue({
        code: "custom",
        path: ["south"],
        message: "south debe ser menor o igual a north",
      });
    }
    if (query.west > query.east) {
      context.addIssue({
        code: "custom",
        path: ["west"],
        message: "west debe ser menor o igual a east",
      });
    }
  });
export type PlacesViewportQuery = z.infer<typeof placesViewportQuerySchema>;

export const placesViewportStateSchema = z.enum(["ready", "empty", "unavailable"]);
export type PlacesViewportState = z.infer<typeof placesViewportStateSchema>;

export const placesViewportResponseSchema = z.object({
  state: placesViewportStateSchema,
  googleResults: z.array(googleViewportResultSchema),
  localProposals: z.array(localProposalPinSchema),
  attribution: googleAttributionSchema,
  message: z.string().optional(),
});
export type PlacesViewportResponse = z.infer<typeof placesViewportResponseSchema>;

export const googlePlaceDetailsSchema = z.object({
  source: z.literal("google"),
  placeId: googlePlaceIdSchema,
  name: z.string(),
  formattedAddress: z.string().nullable(),
  photoName: z.string().trim().min(1).optional(),
  googleMapsUrl: z.string().url(),
  attribution: googleAttributionSchema,
});
export type GooglePlaceDetails = z.infer<typeof googlePlaceDetailsSchema>;

export const googlePlaceDetailsStateSchema = z.enum(["ready", "unavailable", "error"]);
export type GooglePlaceDetailsState = z.infer<typeof googlePlaceDetailsStateSchema>;

export const googlePlaceDetailsResponseSchema = z.object({
  state: googlePlaceDetailsStateSchema,
  details: googlePlaceDetailsSchema.optional(),
  message: z.string().optional(),
});
export type GooglePlaceDetailsResponse = z.infer<typeof googlePlaceDetailsResponseSchema>;

export const registeredPlaceMatchSchema = z.object({
  spotId: uuidSchema,
  displayName: z.string(),
  neighborhood: z.string(),
});
export type RegisteredPlaceMatch = z.infer<typeof registeredPlaceMatchSchema>;

// The autocomplete response is transient Google data plus an optional
// Taco Hunt-owned redirect when the selected place is already registered.
export const placeAutocompleteResponseV2Schema = placeAutocompleteResponseSchema.extend({
  registeredMatch: registeredPlaceMatchSchema.optional(),
});
export type PlaceAutocompleteResponseV2 = z.infer<typeof placeAutocompleteResponseV2Schema>;

export const placeProposalCreateSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("google"),
      placeId: googlePlaceIdSchema,
    })
    .strict(),
  z
    .object({
      source: z.literal("local"),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      name: z.string().trim().min(2).max(120).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
]);
export type PlaceProposalCreate = z.infer<typeof placeProposalCreateSchema>;

export const placeProposalResultSchema = z.object({
  id: uuidSchema,
  source: z.enum(["google", "local"]),
  status: z.literal("pending"),
  createdAt: isoTimestampSchema,
});
export type PlaceProposalResult = z.infer<typeof placeProposalResultSchema>;

export const placeDuplicateRedirectSchema = z.object({
  spotId: uuidSchema,
  path: z.string().regex(/^\/spot\/[0-9a-f-]+$/i),
});
export type PlaceDuplicateRedirect = z.infer<typeof placeDuplicateRedirectSchema>;

export const placeProposalConflictSchema = z.object({
  error: z.object({
    code: z.literal("CONFLICT"),
    message: z.string(),
    requestId: z.string().min(1),
    details: z.object({
      reason: z.literal("already_registered"),
      existingSpotId: uuidSchema,
      redirect: placeDuplicateRedirectSchema,
      displayName: z.string(),
      neighborhood: z.string(),
    }),
  }),
});
export type PlaceProposalConflict = z.infer<typeof placeProposalConflictSchema>;
