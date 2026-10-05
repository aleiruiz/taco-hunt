import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/auth/provider";
import { getProgress, INITIAL_PROGRESS, type Progress } from "@/data/progress";

/**
 * The signed-in user's badge progress, refreshed whenever the screen gains focus
 * (e.g. back from publishing a review). Guests and failed loads keep the
 * starting progress; a response for a previous account or an older refresh is ignored.
 */
export function useProgress(): { progress: Progress; error: string | null } {
  const { session } = useAuth();
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setProgress(INITIAL_PROGRESS);
    setError(null);
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return undefined;
      const id = ++requestId.current;
      getProgress(session)
        .then((next) => {
          if (requestId.current !== id) return;
          setProgress(next);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (requestId.current !== id) return;
          setError(cause instanceof Error ? cause.message : "No pudimos cargar tu progreso.");
        });
      return () => {
        requestId.current += 1;
      };
    }, [session]),
  );

  return { progress, error };
}
