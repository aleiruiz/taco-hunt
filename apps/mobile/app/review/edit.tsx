import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ReviewForm } from "@/features/contributions/ReviewForm";
import { listOwnReviews, type OwnReview } from "@/features/contributions/api";
import { useAuth } from "@/auth/provider";

export default function EditReviewScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [review, setReview] = useState<OwnReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session || !id) return;
    void listOwnReviews(session)
      .then(({ items }) => setReview(items.find((item) => item.id === id) ?? null))
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "No pudimos cargar tu reseña."),
      );
  }, [id, session]);
  if (!session)
    return (
      <View>
        <Text>Inicia sesión para editar tu reseña.</Text>
      </View>
    );
  if (error)
    return (
      <View>
        <Text>{error}</Text>
      </View>
    );
  if (!review) return <ActivityIndicator />;
  return (
    <>
      <Stack.Screen
        options={{ title: "Editar reseña", headerShown: true, headerBackTitle: "Volver" }}
      />
      <ReviewForm session={session} existing={review} onSaved={() => router.replace("/my-tacos")} />
    </>
  );
}
