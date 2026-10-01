import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export interface AvatarReviewResult {
  status: "approved" | "rejected";
  reason?: string;
}

/**
 * Minimal, pluggable automated review for profile photos (owner decision:
 * optional photo replaces the app avatar immediately, then goes through
 * automated review with no manual queue — plan-delegacion.md P2.7).
 *
 * No image-moderation integration exists elsewhere in this codebase, and this
 * task isn't authorized to invent credentials or wire a real paid vision API
 * (decision logged in docs/orchestration-log.md before this was written). This
 * stub only rejects clearly degenerate uploads — a near-blank or solid-color
 * image, as a proxy for a corrupt or placeholder file — and approves
 * everything else. It runs synchronously right after the photo is claimed
 * (there's no background job queue here), so "queued for review" resolves
 * within the same request. Swap the body of `review` for a real provider
 * later without touching callers; the interface is deliberately one method.
 */
@Injectable()
export class AvatarReviewService {
  private static readonly MIN_STDEV = 4;

  async review(photo: Buffer): Promise<AvatarReviewResult> {
    try {
      const { channels } = await sharp(photo).stats();
      const maxStdev = Math.max(0, ...channels.map((channel) => channel.stdev));
      if (maxStdev < AvatarReviewService.MIN_STDEV) {
        return { status: "rejected", reason: "La imagen parece estar en blanco o dañada" };
      }
      return { status: "approved" };
    } catch {
      return { status: "rejected", reason: "No se pudo analizar la imagen" };
    }
  }
}
