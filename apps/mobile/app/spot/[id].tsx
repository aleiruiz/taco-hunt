import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

type Taco = { id: string; tacoTypeId?: string; name: string; score: number | null; reviewCount: number };
type Spot = { id: string; name: string; neighborhood: string; latitude?: number; longitude?: number; lastVerifiedAt: string | null; tacos: Taco[] };
const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const colors = { ink: "#302723", muted: "#6C5D53", red: "#E95032", green: "#276C4F", paper: "#FFFAF1", cream: "#FBF3E6", line: "#E8DCCB" };

export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"offline" | "missing" | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${API}/spots/${encodeURIComponent(id)}`);
      if (response.status === 404) { setError("missing"); return; }
      if (!response.ok) throw new Error("Request failed");
      setSpot(await response.json() as Spot);
    } catch { setError("offline"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  const hasPin = typeof spot?.latitude === "number" && typeof spot.longitude === "number";
  const openDirections = () => {
    if (!hasPin || !spot) return;
    const label = encodeURIComponent(spot.name);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}(${label})`).catch(() => undefined);
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Stack.Screen options={{ title: spot?.name ?? "Puesto" }} />
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Volver</Text></Pressable>
    {loading ? <ActivityIndicator color={colors.red} style={{ marginTop: 50 }} /> : error === "offline" ? <View style={styles.empty}><Text style={styles.title}>Sin conexión</Text><Text style={styles.body}>No pudimos cargar este puesto. Revisa tu conexión e inténtalo de nuevo.</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable></View> : error === "missing" ? <View style={styles.empty}><Text style={styles.title}>Puesto no disponible</Text><Text style={styles.body}>No pudimos encontrar este puesto. Puede que ya no esté publicado.</Text></View> : spot && <>
      <Text style={styles.kicker}>PUESTO EN MONTERREY</Text><Text style={styles.title}>{spot.name}</Text><Text style={styles.neighborhood}>{spot.neighborhood}</Text>
      <View style={styles.notice}><Text style={styles.body}>{spot.lastVerifiedAt ? `Dato verificado el ${new Date(spot.lastVerifiedAt).toLocaleDateString("es-MX")}.` : "Fecha de verificación no confirmada."}</Text></View>
      {hasPin && <View style={styles.pinCard}><View style={styles.pinIcon}><Text style={{ fontSize: 23 }}>⌖</Text></View><View style={{ flex: 1 }}><Text style={styles.pinTitle}>Ubicación del puesto</Text><Text style={styles.body}>{spot.latitude!.toFixed(4)}, {spot.longitude!.toFixed(4)}</Text></View><Pressable accessibilityRole="button" onPress={openDirections} style={styles.directions}><Text style={styles.directionText}>Cómo llegar</Text></Pressable></View>}
      <Text style={styles.section}>Tacos que puedes encontrar</Text>
      {spot.tacos.map((taco) => <View key={taco.id} style={styles.card}><View style={{ flex: 1 }}><Text style={styles.tacoName}>{taco.name}</Text><Text style={styles.body}>{taco.reviewCount ? `${taco.reviewCount} reseñas` : "Sin reseñas todavía"}</Text></View><Text style={styles.score}>{taco.score === null ? "—" : `${taco.score.toFixed(1)} ★`}</Text></View>)}
      {spot.tacos.length === 0 && <View style={styles.empty}><Text style={styles.body}>Aún no hay tipos de taco confirmados para este puesto.</Text></View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.cream }, content: { padding: 22, paddingTop: 58, paddingBottom: 40 }, back: { minHeight: 44, justifyContent: "center", marginBottom: 26 }, backText: { color: colors.green, fontWeight: "800", fontSize: 15 }, kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: "900", marginTop: 10 }, neighborhood: { color: colors.muted, fontSize: 16, marginTop: 5 }, notice: { marginTop: 23, padding: 15, backgroundColor: colors.paper, borderRadius: 14 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 }, section: { color: colors.ink, fontSize: 18, fontWeight: "800", marginTop: 32, marginBottom: 12 }, card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 17, marginBottom: 10, flexDirection: "row", alignItems: "center" }, tacoName: { color: colors.ink, fontWeight: "800", fontSize: 16 }, score: { color: colors.red, fontWeight: "900", fontSize: 16 }, empty: { padding: 20, marginTop: 20, borderRadius: 16, backgroundColor: colors.paper }, pinCard: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: "row", alignItems: "center", gap: 10 }, pinIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#F9DEAE", alignItems: "center", justifyContent: "center" }, pinTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 1 }, directions: { paddingHorizontal: 12, minHeight: 38, borderRadius: 11, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }, directionText: { color: "white", fontSize: 11, fontWeight: "800" }, retry: { alignSelf: "flex-start", marginTop: 17, borderRadius: 12, backgroundColor: colors.green, paddingHorizontal: 17, minHeight: 43, justifyContent: "center" }, retryText: { color: "white", fontWeight: "800" } });
