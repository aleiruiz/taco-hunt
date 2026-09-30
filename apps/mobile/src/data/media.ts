/**
 * Media fixtures: photo upload states, moderation queues
 *
 * Implements the shapes that Phase A tasks need:
 * - T36: review photo upload UI against T11 API
 * - T39: stand gallery and photo upload UI
 * - T38: admin stand-photo moderation UI
 * - T37 (Phase B): spot photos API and moderation
 * - T40 (Phase B): profile photo with automated review
 */

export interface Photo {
  id: string;
  url: string;
  uploaderId: string;
  uploaderName: string;
  spotId: string;
  spotName: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: string;
}

export interface PendingPhoto {
  id: string;
  uploaderId: string;
  localUri: string;
  status: "uploading" | "pending" | "rejected";
  rejectionReason?: string;
}

/**
 * Pending stand photos awaiting moderator approve/reject (T38). Only the
 * uploader sees a pending photo elsewhere in the app (design §6); this is the
 * moderator-side queue. T37 replaces this with GET /v1/admin/spot-photos.
 */
export function getFixturePhotos(): Photo[] {
  return [
    {
      id: "photo-1",
      url: "https://images.unsplash.com/photo-1613514785940-daed07799d9b?w=480",
      uploaderId: "user-1",
      uploaderName: "Karla R.",
      spotId: "spot-1",
      spotName: "Tacos El Trompo de Don Beto",
      status: "pending",
      createdAt: "2026-09-29T20:14:00Z",
    },
    {
      id: "photo-2",
      url: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=480",
      uploaderId: "user-2",
      uploaderName: "Iván M.",
      spotId: "spot-2",
      spotName: "Tacos Doña Chelo",
      status: "pending",
      createdAt: "2026-09-29T18:02:00Z",
    },
    {
      id: "photo-3",
      url: "https://images.unsplash.com/photo-1611250188496-e966043a0629?w=480",
      uploaderId: "user-3",
      uploaderName: "Sofía G.",
      spotId: "spot-3",
      spotName: "Taquería La Norteñita",
      status: "pending",
      createdAt: "2026-09-28T23:40:00Z",
    },
  ];
}

export function getFixturePendingPhotos(): PendingPhoto[] {
  return [];
}

// --- T39: stand gallery ---

const GALLERY_SAMPLE_URLS = [
  "https://images.unsplash.com/photo-1613514785940-daed07799d9b?w=480",
  "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=480",
  "https://images.unsplash.com/photo-1611250188496-e966043a0629?w=480",
  "https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=480",
];
const GALLERY_SAMPLE_NAMES = ["Karla R.", "Iván M.", "Sofía G.", "Marco T."];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A deterministic (but not real) set of already-approved photos for a stand,
 * so the gallery has something to show in the fixture-only Phase A UI. T37
 * replaces this with GET /v1/spots/:id/photos.
 */
export function getFixtureApprovedPhotos(spotId: string, spotName: string): Photo[] {
  const count = hashString(spotId) % (GALLERY_SAMPLE_URLS.length + 1);
  return Array.from({ length: count }, (_, index) => ({
    id: `${spotId}-approved-${index}`,
    url: GALLERY_SAMPLE_URLS[index % GALLERY_SAMPLE_URLS.length],
    uploaderId: `fixture-user-${index}`,
    uploaderName: GALLERY_SAMPLE_NAMES[index % GALLERY_SAMPLE_NAMES.length],
    spotId,
    spotName,
    status: "approved",
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
  }));
}
