import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/provider";
import { listFavorites, setFavorite } from "@/features/contributions/api";
import { createReport, ReportConflictError, type ReportReason } from "@/features/reports/api";
import { openDirections as openMapDirections } from "@/lib/directions";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { PhotoTile } from "@/components/PhotoTile";
import { colors, radii, spacing, typography } from "@/theme";

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "inaccurate", label: "Datos incorrectos" },
  { value: "closed", label: "Ya cerró" },
  { value: "spam", label: "Spam o falso" },
  { value: "abusive", label: "Contenido abusivo" },
  { value: "other", label: "Otro" },
];

type Taco = {
  id: string;
  tacoTypeId?: string;
  name: string;
  score: number | null;
  reviewCount: number;
};
type Spot = {
  id: string;
  name: string;
  neighborhood: string;
  latitude?: number;
  longitude?: number;
  lastVerifiedAt: string | null;
  tacos: Taco[];
};
const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
export default function SpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [favorite, setFavoriteState] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"offline" | "missing" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const reportSubmissionId = useRef(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/spots/${encodeURIComponent(id)}`);
      if (response.status === 404) {
        setError("missing");
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setSpot((await response.json()) as Spot);
    } catch {
      setError("offline");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      if (!session || !id) return undefined;
      void listFavorites(session)
        .then(({ items }) => setFavoriteState(items.some((item) => item.id === id)))
        .catch(() => undefined);
      return undefined;
    }, [id, session]),
  );
  async function toggleFavorite() {
    if (!session) {
      router.push("/sign-in");
      return;
    }
    setFavoriteBusy(true);
    try {
      await setFavorite(session, id, !favorite);
      setFavoriteState((current) => !current);
    } finally {
      setFavoriteBusy(false);
    }
  }
  function openReport() {
    if (!session) {
      router.push("/sign-in");
      return;
    }
    setReportReason(null);
    setReportNote("");
    setReportError("");
    setReportOpen(true);
  }
  function closeReport() {
    reportSubmissionId.current += 1;
    setReportSubmitting(false);
    setReportOpen(false);
  }
  async function submitReport() {
    if (!session || !reportReason) return;
    const submissionId = ++reportSubmissionId.current;
    setReportSubmitting(true);
    setReportError("");
    try {
      await createReport(session, {
        targetType: "spot",
        targetId: id,
        reason: reportReason,
        note: reportNote.trim() || undefined,
      });
      if (reportSubmissionId.current !== submissionId) return;
      setReportOpen(false);
      Alert.alert("Gracias", "Tu reporte fue enviado. Nuestro equipo lo revisará.");
    } catch (submitError) {
      if (reportSubmissionId.current !== submissionId) return;
      setReportError(
        submitError instanceof ReportConflictError
          ? "Ya tienes un reporte abierto para este puesto."
          : "No pudimos enviar el reporte. Inténtalo de nuevo.",
      );
    } finally {
      if (reportSubmissionId.current === submissionId) setReportSubmitting(false);
    }
  }
  const hasPin = typeof spot?.latitude === "number" && typeof spot.longitude === "number";
  const hasAnyReviews = spot?.tacos.some((taco) => taco.reviewCount > 0) ?? false;
  const openDirections = () => {
    if (!hasPin || !spot) return;
    void openMapDirections({ latitude: spot.latitude!, longitude: spot.longitude! }).then(
      (opened) => {
        if (!opened) {
          Alert.alert(
            "No se pudo abrir el mapa",
            "No encontramos una aplicación de mapas disponible. Intenta de nuevo más tarde.",
          );
        }
      },
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: spot?.name ?? "Puesto" }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={16} color={colors.green} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator color={colors.red} style={{ marginTop: 50 }} />
      ) : error === "offline" ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Sin conexión</Text>
          <Text style={styles.body}>
            No pudimos cargar este puesto. Revisa tu conexión e inténtalo de nuevo.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : error === "missing" ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Puesto no disponible</Text>
          <Text style={styles.body}>
            No pudimos encontrar este puesto. Puede que ya no esté publicado.
          </Text>
        </View>
      ) : (
        spot && (
          <>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>PUESTO EN MONTERREY</Text>
                <Text style={styles.title}>{spot.name}</Text>
                <Text style={styles.neighborhood}>{spot.neighborhood}</Text>
              </View>
              <View style={styles.headerActions}>
                <IconButton
                  icon={favorite ? "heart" : "heart-outline"}
                  label={favorite ? "Guardado en favoritos" : "Guardar en favoritos"}
                  color={colors.red}
                  disabled={favoriteBusy}
                  onPress={() => void toggleFavorite()}
                />
                <IconButton icon="flag-outline" label="Reportar este puesto" onPress={openReport} />
              </View>
            </View>
            {spot.lastVerifiedAt ? (
              <View style={styles.notice}>
                <Text style={styles.body}>
                  Dato verificado el {new Date(spot.lastVerifiedAt).toLocaleDateString("es-MX")}.
                </Text>
              </View>
            ) : null}
            {hasPin && (
              <View style={styles.pinCard}>
                <View style={styles.pinIcon}>
                  <Ionicons name="location" size={23} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinTitle}>{spot.neighborhood}</Text>
                  <Text style={styles.body}>Monterrey y área metropolitana</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Cómo llegar a ${spot.name}`}
                  accessibilityHint="Abre una aplicación de mapas para mostrar la ruta"
                  onPress={openDirections}
                  style={styles.directions}
                >
                  <Text style={styles.directionText}>Cómo llegar</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.section}>Fotos</Text>
            <PhotoTile
              dashed
              size={96}
              accessibilityLabel="Subir la primera foto. Próximamente."
              onPress={() =>
                Alert.alert(
                  "Próximamente",
                  "La galería de fotos de este puesto llega en una próxima actualización.",
                )
              }
            />
            <Text style={styles.body}>Subir la primera foto</Text>

            {spot.tacos.length > 0 && !hasAnyReviews && (
              <View style={styles.pioneerCard}>
                <Text style={styles.pioneerTitle}>
                  Nadie lo ha calificado todavía… te da la insignia Pionero
                </Text>
                <Button
                  label="Calificar el primer taco"
                  variant="accent"
                  onPress={() =>
                    router.push(
                      session
                        ? {
                            pathname: "/review/new",
                            params: {
                              spotTacoId: spot.tacos[0].id,
                              spotName: spot.name,
                              tacoName: spot.tacos[0].name,
                            },
                          }
                        : "/sign-in",
                    )
                  }
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            )}

            <Text style={styles.section}>Tacos que puedes encontrar</Text>
            {spot.tacos.map((taco) => (
              <View key={taco.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tacoName}>{taco.name}</Text>
                  <Text style={styles.body}>
                    {taco.reviewCount
                      ? `${taco.reviewCount} reseñas`
                      : "Sin calificaciones todavía"}
                  </Text>
                </View>
                <Text style={styles.score}>
                  {taco.score === null ? "—" : `${taco.score.toFixed(1)} ★`}
                </Text>
                <Button
                  label={session ? "Calificar" : "Inicia sesión"}
                  variant="secondary"
                  icon="star-outline"
                  onPress={() =>
                    router.push(
                      session
                        ? {
                            pathname: "/review/new",
                            params: {
                              spotTacoId: taco.id,
                              spotName: spot.name,
                              tacoName: taco.name,
                            },
                          }
                        : "/sign-in",
                    )
                  }
                />
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
      <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={closeReport}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Reportar este puesto</Text>
            <Text style={styles.body}>
              Cuéntanos qué está mal. Un reporte no oculta el puesto de inmediato; nuestro equipo lo
              revisa.
            </Text>
            <View style={styles.reasonRow}>
              {REPORT_REASONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={reportReason === option.value}
                  onPress={() => setReportReason(option.value)}
                />
              ))}
            </View>
            <TextInput
              value={reportNote}
              onChangeText={setReportNote}
              placeholder="Detalles opcionales (máx. 500 caracteres)"
              placeholderTextColor="#8A7A6E"
              multiline
              maxLength={500}
              style={styles.reportNoteInput}
              accessibilityLabel="Detalles del reporte"
            />
            {reportError ? <Text style={styles.reportError}>{reportError}</Text> : null}
            <View style={styles.modalActions}>
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={closeReport}
                style={{ flex: 1 }}
              />
              <Button
                label="Enviar reporte"
                variant="danger"
                disabled={!reportReason}
                loading={reportSubmitting}
                onPress={() => void submitReport()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingTop: 58, paddingBottom: 40 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    justifyContent: "flex-start",
    marginBottom: 26,
  },
  backText: { color: colors.green, fontWeight: "800", fontSize: 15 },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: "900", marginTop: 10 },
  neighborhood: { color: colors.muted, fontSize: 16, marginTop: 5 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headerActions: { flexDirection: "row", gap: spacing.xs },
  pioneerCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.goldSoft,
  },
  pioneerTitle: { ...typography.sectionTitle, fontSize: 15, color: colors.ink },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(48,39,35,0.45)",
  },
  modalSheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  modalTitle: { ...typography.sectionTitle, color: colors.ink },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  reportNoteInput: {
    marginTop: spacing.md,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
    padding: spacing.md,
    color: colors.ink,
    fontSize: 14,
    textAlignVertical: "top",
  },
  reportError: { color: colors.dangerText, fontSize: 13, fontWeight: "700", marginTop: spacing.sm },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  notice: { marginTop: 23, padding: 15, backgroundColor: colors.paper, borderRadius: 14 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "800", marginTop: 32, marginBottom: 12 },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 17,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  tacoName: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  score: { color: colors.red, fontWeight: "900", fontSize: 16 },
  empty: { padding: 20, marginTop: 20, borderRadius: 16, backgroundColor: colors.paper },
  pinCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pinIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.tacoTile,
    alignItems: "center",
    justifyContent: "center",
  },
  pinTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 1 },
  directions: {
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  directionText: { color: "white", fontSize: 11, fontWeight: "800" },
  retry: {
    alignSelf: "flex-start",
    marginTop: 17,
    borderRadius: 12,
    backgroundColor: colors.green,
    paddingHorizontal: 17,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: "white", fontWeight: "800" },
});
