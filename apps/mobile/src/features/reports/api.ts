import type { Session } from "@supabase/supabase-js";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";

export type ReportReason = "inaccurate" | "abusive" | "spam" | "closed" | "other";
export type ReportTargetType = "spot" | "review";

export type ReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string;
};

export class ReportConflictError extends Error {}

function messageFromResponse(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error;
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }
  }
  return "No pudimos enviar el reporte.";
}

export async function createReport(session: Session, input: ReportInput) {
  const response = await fetch(`${API}/reports`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (response.status === 409) throw new ReportConflictError(messageFromResponse(payload));
    throw new Error(messageFromResponse(payload));
  }
  return (await response.json()) as { id: string; status: string; createdAt: string };
}
