import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ReviewForm } from "@/features/contributions/ReviewForm";
import { useAuth } from "@/auth/provider";
import { ReviewSignInPrompt } from "@/auth/ReviewSignInPrompt";
import { reviewReturnTo } from "@/auth/navigation";

export default function NewReviewScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    spotTacoId?: string;
    spotName?: string;
    tacoName?: string;
  }>();
  if (!session) {
    return (
      <ReviewSignInPrompt loading={loading} returnTo={reviewReturnTo("/review/new", params)} />
    );
  }
  return (
    <>
      <Stack.Screen
        options={{ title: "Nueva reseña", headerShown: true, headerBackTitle: "Volver" }}
      />
      <ReviewForm
        session={session}
        spotTacoId={params.spotTacoId}
        spotName={params.spotName}
        tacoName={params.tacoName}
        onSaved={() => router.replace("/my-tacos")}
      />
    </>
  );
}
