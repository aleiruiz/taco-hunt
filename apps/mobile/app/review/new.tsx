import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { ReviewForm } from "@/features/contributions/ReviewForm";
import { useAuth } from "@/auth/provider";

export default function NewReviewScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ spotTacoId?: string; spotName?: string; tacoName?: string }>();
  if (!session) {
    return <View><Text>Inicia sesión para escribir una reseña.</Text></View>;
  }
  return (
    <>
      <Stack.Screen options={{ title: "Nueva reseña", headerShown: true, headerBackTitle: "Volver" }} />
      <ReviewForm session={session} spotTacoId={params.spotTacoId} spotName={params.spotName} tacoName={params.tacoName} onSaved={() => router.replace("/my-tacos")} />
    </>
  );
}
