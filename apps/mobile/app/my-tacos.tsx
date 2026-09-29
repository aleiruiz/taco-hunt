import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/provider";
import {
  deleteReview,
  listFavorites,
  listOwnReviews,
  type Favorite,
  type OwnReview,
} from "@/features/contributions/api";
import { colors } from "@/theme";

export default function MyTacosScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [reviews, setReviews] = useState<OwnReview[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [reviewPage, favoritePage] = await Promise.all([
        listOwnReviews(session),
        listFavorites(session),
      ]);
      setReviews(reviewPage.items);
      setFavorites(favoritePage.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tu pasaporte.");
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  async function remove(review: OwnReview) {
    Alert.alert("Eliminar reseña", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () =>
          void (async () => {
            if (!session) return;
            await deleteReview(session, review.id);
            setReviews((items) => items.filter((item) => item.id !== review.id));
          })().catch((cause) =>
            setError(cause instanceof Error ? cause.message : "No pudimos eliminar la reseña."),
          ),
      },
    ]);
  }
  if (!session)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Tu pasaporte empieza aquí</Text>
        <Text style={styles.body}>
          Inicia sesión para guardar favoritos y consultar tus reseñas.
        </Text>
        <Link href="/sign-in" style={styles.primaryText}>
          Iniciar sesión
        </Link>
      </View>
    );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Mis tacos", headerShown: true }} />
      <Text style={styles.kicker}>TU PASAPORTE</Text>
      <Text style={styles.title}>Mis tacos</Text>
      <Text style={styles.body}>Tus reseñas cuentan como visitas personales a los puestos.</Text>
      {error ? (
        <View style={styles.notice}>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={colors.red} style={{ marginTop: 28 }} /> : null}
      <Text style={styles.section}>Favoritos</Text>
      {!loading && favorites.length === 0 ? (
        <Text style={styles.empty}>Todavía no guardas puestos.</Text>
      ) : (
        favorites.map((favorite) => (
          <Pressable
            key={favorite.id}
            onPress={() => router.push({ pathname: "/spot/[id]", params: { id: favorite.id } })}
            style={styles.card}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{favorite.name}</Text>
              <Text style={styles.body}>{favorite.neighborhood}</Text>
            </View>
            <Ionicons name="heart" size={21} color={colors.red} />
          </Pressable>
        ))
      )}
      <Text style={styles.section}>Mis reseñas</Text>
      {!loading && reviews.length === 0 ? (
        <Text style={styles.empty}>Aún no has publicado una reseña.</Text>
      ) : (
        reviews.map((review) => (
          <View key={review.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{review.tacoName}</Text>
              <Text style={styles.body}>
                {review.spotName} · {review.score.toFixed(1)} ★
              </Text>
              {review.body ? <Text style={styles.comment}>{review.body}</Text> : null}
            </View>
            <View>
              <Pressable
                onPress={() => router.push({ pathname: "/review/edit", params: { id: review.id } })}
                style={styles.smallButton}
              >
                <Text style={styles.smallText}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => void remove(review)} style={styles.deleteButton}>
                <Text style={styles.deleteText}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingTop: 58, paddingBottom: 46 },
  center: { flex: 1, backgroundColor: colors.cream, padding: 28, justifyContent: "center" },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  section: { color: colors.ink, fontSize: 19, fontWeight: "900", marginTop: 30, marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    marginBottom: 10,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  comment: { color: colors.ink, marginTop: 7, lineHeight: 20 },
  empty: { color: colors.muted, padding: 16, backgroundColor: colors.paper, borderRadius: 14 },
  notice: { padding: 14, backgroundColor: colors.tacoTile, borderRadius: 14, marginTop: 18 },
  link: { color: colors.green, fontWeight: "900", marginTop: 8 },
  primaryText: {
    color: "white",
    backgroundColor: colors.red,
    borderRadius: 14,
    padding: 15,
    textAlign: "center",
    overflow: "hidden",
    fontWeight: "900",
    marginTop: 22,
  },
  smallButton: {
    minHeight: 40,
    minWidth: 68,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  smallText: { color: "white", fontWeight: "800", fontSize: 12 },
  deleteButton: { minHeight: 40, justifyContent: "center", alignItems: "center" },
  deleteText: { color: colors.red, fontWeight: "800", fontSize: 12 },
});
