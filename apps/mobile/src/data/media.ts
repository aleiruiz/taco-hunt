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

export function getFixturePhotos(): Photo[] {
  return [];
}

export function getFixturePendingPhotos(): PendingPhoto[] {
  return [];
}
