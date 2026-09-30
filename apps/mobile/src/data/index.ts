/**
 * Fixture adapters for Phase A (UI) tasks.
 *
 * Phase A tasks use fixture adapters to provide mock data without touching the API.
 * Each adapter exposes typed functions that match the real API's response shapes,
 * but return hardcoded fixture data instead of making network calls.
 *
 * When Phase B (API) tasks implement their endpoints, they swap the fixture import
 * for the real API call (e.g., replacing `import { getSpots } from "@/data/spots"`
 * with `import { getSpots } from "@/api/spots"`), and both expose the same interface.
 *
 * Each Phase A task PR should list its Data needs (fields, states, endpoints) to
 * inform the Phase B contract consolidation (T51).
 *
 * Fixture modules:
 * - auth: user session, profile, display name, avatar preset
 * - spots: stand list, detail, viewport pins, search suggest
 * - reviews: rating states, favorite states
 * - proposals: spot proposal states, taco type proposals
 * - progress: challenge/badge progress
 * - media: photo upload states, moderation queues
 * - importCandidates: admin review queue for CSV-staged import candidates
 */

export * as authFixtures from "./auth";
export * as spotsFixtures from "./spots";
export * as reviewsFixtures from "./reviews";
export * as proposalsFixtures from "./proposals";
export * as progressFixtures from "./progress";
export * as mediaFixtures from "./media";
export * as importCandidatesFixtures from "./importCandidates";
