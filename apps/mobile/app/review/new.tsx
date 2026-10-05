import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ReviewForm } from "@/features/contributions/ReviewForm";
import {
  createGoogleReviewTarget,
  listTacoTypes,
  type GoogleReviewTarget,
  type TacoType,
} from "@/features/proposals/api";
import { useAuth } from "@/auth/provider";
import { ReviewSignInPrompt } from "@/auth/ReviewSignInPrompt";
import { reviewReturnTo } from "@/auth/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { colors, spacing, typography } from "@/theme";

export default function NewReviewScreen() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    spotTacoId?: string;
    spotName?: string;
    tacoName?: string;
    googlePlaceId?: string;
  }>();
  const [tacoTypes, setTacoTypes] = useState<TacoType[]>([]);
  const [selectedTacoTypeId, setSelectedTacoTypeId] = useState<string>();
  const [target, setTarget] = useState<GoogleReviewTarget | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const googleReview = !params.spotTacoId && Boolean(params.googlePlaceId);

  useEffect(() => {
    if (!session || !googleReview) return;
    let cancelled = false;
    setTargetLoading(true);
    setTargetError(null);
    void listTacoTypes()
      .then((items) => {
        if (cancelled) return;
        setTacoTypes(items);
        setSelectedTacoTypeId((current) => current ?? items[0]?.id);
      })
      .catch((cause) => {
        if (!cancelled) {
          setTargetError(
            cause instanceof Error ? cause.message : "No pudimos cargar los tipos de taco.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTargetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [googleReview, session]);

  async function prepareGoogleReview() {
    if (!session || !params.googlePlaceId || !selectedTacoTypeId) return;
    setTargetLoading(true);
    setTargetError(null);
    try {
      const nextTarget = await createGoogleReviewTarget(session, {
        placeId: params.googlePlaceId,
        tacoTypeId: selectedTacoTypeId,
      });
      setTarget(nextTarget);
    } catch (cause) {
      setTargetError(cause instanceof Error ? cause.message : "No pudimos preparar la reseña.");
    } finally {
      setTargetLoading(false);
    }
  }

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
      {googleReview && !target ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>CALIFICAR TACOS</Text>
          <Text style={styles.title}>{params.spotName ?? "Este lugar"}</Text>
          <Text style={styles.subtitle}>
            Elige qué tipo de taco quieres calificar. Registraremos el lugar automáticamente al
            continuar.
          </Text>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>¿Qué taco probaste?</Text>
            {targetLoading && tacoTypes.length === 0 ? (
              <ActivityIndicator color={colors.redStrong} style={styles.loader} />
            ) : (
              <View style={styles.chips}>
                {tacoTypes.map((type) => (
                  <Chip
                    key={type.id}
                    label={type.nameEs}
                    selected={selectedTacoTypeId === type.id}
                    onPress={() => setSelectedTacoTypeId(type.id)}
                  />
                ))}
              </View>
            )}
            {targetError ? <Text style={styles.error}>{targetError}</Text> : null}
            <Button
              label="Continuar a calificar"
              icon="star-outline"
              loading={targetLoading}
              disabled={!selectedTacoTypeId || tacoTypes.length === 0}
              onPress={() => void prepareGoogleReview()}
              style={styles.action}
            />
          </Card>
        </ScrollView>
      ) : (
        <ReviewForm
          session={session}
          spotTacoId={params.spotTacoId ?? target?.spotTacoId}
          spotName={params.spotName ?? target?.spotName}
          tacoName={params.tacoName ?? target?.tacoName}
          onSaved={() => router.replace({ pathname: "/my-tacos", params: { tab: "resenas" } })}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.md },
  kicker: { ...typography.kicker, color: colors.redStrong },
  title: { ...typography.title, color: colors.ink, fontSize: 28 },
  subtitle: { ...typography.body, color: colors.muted, lineHeight: 21 },
  card: { marginTop: spacing.md },
  sectionTitle: { ...typography.sectionTitle, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  loader: { marginVertical: spacing.xl },
  error: { color: colors.dangerText, marginTop: spacing.md, lineHeight: 18 },
  action: { marginTop: spacing.lg },
});
