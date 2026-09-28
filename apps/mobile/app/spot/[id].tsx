import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

type Taco = { id: string; name: string; score: number | null; reviewCount: number };
type Spot = {
  id: string;
  name: string;
  neighborhood: string;
  lastVerifiedAt: string | null;
  tacos: Taco[];
};
const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/spots/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<Spot>;
      })
      .then((data) => {
        if (alive) setSpot(data);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: spot?.name ?? "Puesto" }} />
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Volver</Text>
      </Pressable>
      {!spot && !error ? (
        <ActivityIndicator color="#E95032" style={{ marginTop: 50 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Puesto no disponible</Text>
          <Text style={styles.body}>
            No pudimos encontrar este puesto. Puede que ya no esté publicado.
          </Text>
        </View>
      ) : (
        spot && (
          <>
            <Text style={styles.kicker}>PUESTO EN MONTERREY</Text>
            <Text style={styles.title}>{spot.name}</Text>
            <Text style={styles.neighborhood}>{spot.neighborhood}</Text>
            <View style={styles.notice}>
              <Text style={styles.body}>
                {spot.lastVerifiedAt
                  ? `Dato verificado el ${new Date(spot.lastVerifiedAt).toLocaleDateString("es-MX")}.`
                  : "Fecha de verificación no confirmada."}
              </Text>
            </View>
            <Text style={styles.section}>Tacos que puedes encontrar</Text>
            {spot.tacos.map((taco) => (
              <View key={taco.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tacoName}>{taco.name}</Text>
                  <Text style={styles.body}>
                    {taco.reviewCount ? `${taco.reviewCount} reseñas` : "Sin reseñas todavía"}
                  </Text>
                </View>
                <Text style={styles.score}>
                  {taco.score === null ? "—" : `${taco.score.toFixed(1)} ★`}
                </Text>
              </View>
            ))}
            {spot.tacos.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.body}>
                  Aún no hay tipos de taco confirmados para este puesto.
                </Text>
              </View>
            )}
          </>
        )
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FBF3E6" },
  content: { padding: 22, paddingTop: 58, paddingBottom: 40 },
  back: { minHeight: 44, justifyContent: "center", marginBottom: 26 },
  backText: { color: "#276C4F", fontWeight: "800", fontSize: 15 },
  kicker: { color: "#276C4F", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: "#302723", fontSize: 32, lineHeight: 38, fontWeight: "900", marginTop: 10 },
  neighborhood: { color: "#6C5D53", fontSize: 16, marginTop: 5 },
  notice: { marginTop: 23, padding: 15, backgroundColor: "#FFFAF1", borderRadius: 14 },
  body: { color: "#6C5D53", fontSize: 14, lineHeight: 21 },
  section: { color: "#302723", fontSize: 18, fontWeight: "800", marginTop: 32, marginBottom: 12 },
  card: {
    backgroundColor: "#FFFAF1",
    borderWidth: 1,
    borderColor: "#E8DCCB",
    borderRadius: 16,
    padding: 17,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  tacoName: { color: "#302723", fontWeight: "800", fontSize: 16 },
  score: { color: "#E95032", fontWeight: "900", fontSize: 16 },
  empty: { padding: 18, marginTop: 20, borderRadius: 16, backgroundColor: "#FFFAF1" },
});
