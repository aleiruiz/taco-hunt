import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useAuth } from "@/auth/provider";
import { PlaceAutocomplete } from "@/features/discovery/PlaceAutocomplete";
import { colors, spacing, radii, typography } from "@/theme";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Stepper } from "@/components/Stepper";
import { PhotoTile } from "@/components/PhotoTile";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
type Source = "manual" | "autocomplete";
type Proposal = {
  id: string;
  name: string;
  neighborhood: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
type NearbyCandidate = { id: string; name: string; neighborhood: string; distanceMeters: number };
type OpeningTime = "manana" | "tarde" | "noche";
const OPENING_TIME_LABEL: Record<OpeningTime, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

export default function ProposeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitted, setSubmitted] = useState<{ name: string } | null>(null);
  const [source, setSource] = useState<Source>("autocomplete");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [latitude, setLatitude] = useState(25.6866);
  const [longitude, setLongitude] = useState(-100.3161);
  const [pinFromGoogle, setPinFromGoogle] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [openingTimes, setOpeningTimes] = useState<OpeningTime[]>([]);
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const loadMine = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${API}/me/proposals`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) return;
      const data = (await response.json()) as { spotProposals: Proposal[] };
      setProposals(data.spotProposals);
    } catch {
      // Submission remains available when the status list is temporarily unavailable.
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function useLocation() {
    setLocating(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Sin permiso de ubicación. Arrastra el mapa para ajustar el pin.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
      setPinFromGoogle(false);
      setLocationConfirmed(true);
    } catch {
      setError("No pudimos leer tu ubicación. Arrastra el mapa para ajustar el pin.");
    } finally {
      setLocating(false);
    }
  }

  function toggleOpeningTime(time: OpeningTime) {
    setOpeningTimes((current) =>
      current.includes(time) ? current.filter((item) => item !== time) : [...current, time],
    );
  }

  async function submit() {
    if (!session?.access_token) {
      router.push("/sign-in");
      return;
    }
    setBusy(true);
    setError("");
    setNearbyCandidates([]);
    try {
      const response = await fetch(`${API}/spot-proposals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name,
          neighborhood,
          latitude,
          longitude,
          note: note || undefined,
          source,
          sourceRef: sourceRef || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        nearbyCandidates?: NearbyCandidate[];
        error?: { message?: string; details?: { candidates?: NearbyCandidate[] } };
      } | null;
      setNearbyCandidates(data?.nearbyCandidates ?? data?.error?.details?.candidates ?? []);
      if (!response.ok) throw new Error(data?.error?.message ?? "No pudimos enviar la propuesta.");
      setSubmitted({ name });
      setName("");
      setNeighborhood("");
      setNote("");
      setSourceRef("");
      setOpeningTimes([]);
      setLatitude(25.6866);
      setLongitude(-100.3161);
      setPinFromGoogle(false);
      setLocationConfirmed(false);
      setStep(1);
      await loadMine();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos enviar la propuesta.");
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setSubmitted(null);
    setStep(1);
    setLocationConfirmed(false);
    setError("");
  }

  const mapRegion: Region = {
    latitude,
    longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  if (submitted) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, styles.reviewContent]}
      >
        <View style={styles.reviewCheck}>
          <Ionicons name="checkmark-circle" size={64} color={colors.green} />
        </View>
        <Text style={styles.reviewTitle}>{submitted.name} está en revisión</Text>
        <Text style={styles.body}>
          Un moderador revisará los datos antes de publicarla. Mientras tanto, solo tú la ves en el
          mapa con un pin punteado. Te avisamos cuando se publique y ganas la insignia Cazador.
        </Text>
        <Card style={styles.timelineCard}>
          <View style={styles.timelineRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.green} />
            <Text style={styles.timelineLabel}>Enviada</Text>
          </View>
          <View style={styles.timelineRow}>
            <Ionicons name="time" size={20} color={colors.gold} />
            <Text style={styles.timelineLabel}>En revisión</Text>
            <View style={styles.timelineBadge}>
              <Text style={styles.timelineBadgeText}>AHORA</Text>
            </View>
          </View>
          <View style={styles.timelineRow}>
            <Ionicons name="ellipse-outline" size={20} color={colors.muted} />
            <Text style={[styles.timelineLabel, styles.timelineLabelMuted]}>Publicada</Text>
          </View>
        </Card>
        <Button
          label="Volver al mapa"
          variant="primary"
          onPress={() => router.push("/")}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label="Mis propuestas"
          variant="secondary"
          onPress={() => {
            setSubmitted(null);
          }}
          style={{ marginTop: spacing.sm }}
        />
        <Button
          label="Proponer otra"
          variant="ghost"
          onPress={startOver}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Link href="/" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Volver a explorar"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={16} color={colors.green} />
          <Text style={styles.backText}>Volver a explorar</Text>
        </Pressable>
      </Link>
      <Text style={styles.kicker}>CONTRIBUYE A TACO HUNT</Text>
      <Text style={styles.title}>Propón una taquería</Text>
      <Stepper currentStep={step} totalSteps={3} />
      {!session ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={styles.cardTitle}>Necesitas una cuenta para proponer</Text>
          <Text style={styles.body}>
            Tu propuesta será privada para ti mientras está pendiente.
          </Text>
          <Button
            label="Iniciar sesión"
            variant="primary"
            onPress={() => router.push("/sign-in")}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : null}

      {step === 1 && (
        <Card>
          <Text style={styles.stepTitle}>¿Cuál taquería es?</Text>
          <View style={styles.segmented}>
            {(["autocomplete", "manual"] as Source[]).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  if (option === source) return;
                  setSource(option);
                  setName("");
                  setNeighborhood("");
                  setSourceRef("");
                  setPinFromGoogle(false);
                  setLocationConfirmed(false);
                }}
                style={[styles.segment, source === option && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, source === option && styles.segmentTextActive]}>
                  {option === "manual" ? "Escribirla a mano" : "Buscar en Google"}
                </Text>
              </Pressable>
            ))}
          </View>
          {source === "autocomplete" ? (
            session ? (
              <>
                <PlaceAutocomplete
                  session={session}
                  onSelectPlace={(place) => {
                    setName(place.name);
                    setNeighborhood(place.neighborhood);
                    setLatitude(place.latitude);
                    setLongitude(place.longitude);
                    setSourceRef(place.placeId);
                    setPinFromGoogle(true);
                    setLocationConfirmed(true);
                    setError("");
                  }}
                  onSelectExistingSpot={(spot) => router.push(`/spot/${spot.id}`)}
                />
                <Text style={styles.attribution}>Resultados de Google</Text>
              </>
            ) : (
              <Text style={styles.body}>Inicia sesión para buscar sugerencias de Google.</Text>
            )
          ) : (
            <>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ej. Tacos El Cometa"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                maxLength={120}
              />
            </>
          )}
          {name ? (
            <Card tone="highlight" style={{ marginTop: spacing.md }}>
              <Text style={styles.pickedName}>{name}</Text>
              {neighborhood ? <Text style={styles.muted}>{neighborhood}</Text> : null}
            </Card>
          ) : null}
          <View style={[styles.dashedRow, { marginTop: spacing.lg }]}>
            <Ionicons name="create-outline" size={16} color={colors.redStrong} />
            <Text style={styles.dashedRowText}>
              ¿No aparece? Escríbela a mano con el botón de arriba.
            </Text>
          </View>
          <Button
            label="Siguiente"
            variant="primary"
            disabled={name.trim().length < 2}
            onPress={() => setStep(2)}
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      )}

      {step === 2 && (
        <Card>
          <Text style={styles.stepTitle}>¿Dónde se pone?</Text>
          <View style={styles.mapWrap}>
            <MapView
              style={StyleSheet.absoluteFill}
              region={mapRegion}
              onRegionChangeComplete={(region) => {
                setLatitude(region.latitude);
                setLongitude(region.longitude);
                setPinFromGoogle(false);
              }}
            >
              <Marker coordinate={{ latitude, longitude }} />
            </MapView>
            <View style={styles.mapCenterPinHint} pointerEvents="none">
              <Ionicons name="location" size={32} color={colors.redStrong} />
            </View>
          </View>
          <Text style={styles.mapHint}>Arrastra el mapa para ajustar</Text>
          <Text style={styles.muted}>
            {pinFromGoogle
              ? "Pin tomado de Google · puedes corregirlo"
              : "Pin ajustado manualmente"}
          </Text>
          <Button
            label={locating ? "Buscando…" : "Estoy aquí"}
            variant="secondary"
            icon="navigate"
            loading={locating}
            onPress={() => void useLocation()}
            style={{ marginTop: spacing.md }}
          />
          <Button
            label={locationConfirmed ? "Ubicación confirmada" : "Confirmar ubicación"}
            variant="secondary"
            icon={locationConfirmed ? "checkmark" : undefined}
            disabled={locationConfirmed}
            onPress={() => setLocationConfirmed(true)}
            style={{ marginTop: spacing.sm }}
          />
          <Text style={styles.label}>Colonia o municipio</Text>
          <TextInput
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Ej. Mitras Centro"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            maxLength={120}
          />
          <Text style={styles.label}>Referencia (opcional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ej. Frente al parque, junto a la farmacia"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.note]}
            multiline
            maxLength={500}
          />
          <View style={styles.stepFooter}>
            <Button label="Atrás" variant="ghost" onPress={() => setStep(1)} style={{ flex: 1 }} />
            <Button
              label="Siguiente"
              variant="primary"
              disabled={neighborhood.trim().length < 2 || !locationConfirmed}
              onPress={() => setStep(3)}
              style={{ flex: 2 }}
            />
          </View>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <Text style={styles.stepTitle}>Detalles que ayudan (opcional)</Text>
          <Text style={styles.body}>
            Los tipos de taco se agregan una vez que la taquería esté publicada.
          </Text>
          <Text style={styles.label}>Horario</Text>
          <View style={styles.chipWrap}>
            {(Object.keys(OPENING_TIME_LABEL) as OpeningTime[]).map((time) => (
              <Chip
                key={time}
                label={OPENING_TIME_LABEL[time]}
                selected={openingTimes.includes(time)}
                onPress={() => toggleOpeningTime(time)}
              />
            ))}
          </View>
          <Text style={styles.label}>Foto del puesto</Text>
          <PhotoTile dashed size={88} />
          <Text style={styles.muted}>También pasa por revisión.</Text>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error} Lo que llenaste sigue aquí.
            </Text>
          ) : null}
          {nearbyCandidates.length > 0 ? (
            <View style={styles.candidates}>
              <Text style={styles.candidateTitle}>
                ¿Quizá te refieres a un puesto que ya existe?
              </Text>
              {nearbyCandidates.map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => router.push(`/spot/${candidate.id}`)}
                  style={styles.candidateRow}
                >
                  <View>
                    <Text style={styles.pickedName}>{candidate.name}</Text>
                    <Text style={styles.muted}>
                      {candidate.neighborhood} · {candidate.distanceMeters} m
                    </Text>
                  </View>
                  <Text style={styles.reviewLinkText}>Ver</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.stepFooter}>
            <Button label="Atrás" variant="ghost" onPress={() => setStep(2)} style={{ flex: 1 }} />
            <Button
              label={busy ? "Enviando…" : error ? "Reintentar envío" : "Enviar para revisión"}
              variant="accent"
              loading={busy}
              onPress={() => void submit()}
              style={{ flex: 2 }}
            />
          </View>
        </Card>
      )}

      {session ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.cardTitle}>Mis propuestas</Text>
          <Text style={styles.body}>Solo tú puedes verlas mientras esperan revisión.</Text>
          {proposals.length === 0 ? (
            <Text style={styles.empty}>Todavía no has enviado una propuesta.</Text>
          ) : (
            proposals.map((proposal) => (
              <View key={proposal.id} style={styles.proposalRow}>
                <View style={styles.proposalCopy}>
                  <Text style={styles.pickedName}>{proposal.name}</Text>
                  <Text style={styles.muted}>{proposal.neighborhood}</Text>
                </View>
                <Text style={styles.status}>
                  {proposal.status === "pending"
                    ? "Pendiente"
                    : proposal.status === "approved"
                      ? "Aprobada"
                      : "Rechazada"}
                </Text>
              </View>
            ))
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 44 },
  reviewContent: { alignItems: "center", textAlign: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, marginBottom: 24 },
  backText: { color: colors.green, fontSize: 15, fontWeight: "800" },
  kicker: { ...typography.kicker, color: colors.green },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6, textAlign: "center" },
  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    marginBottom: 5,
  },
  stepTitle: { ...typography.sectionTitle, color: colors.ink, marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 14, marginBottom: 7 },
  segmented: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.greenSoft, borderColor: colors.green },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  segmentTextActive: { color: colors.green },
  attribution: { color: colors.muted, fontSize: 11, marginTop: spacing.xs },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.paper,
    paddingHorizontal: 13,
    color: colors.ink,
    fontSize: 15,
  },
  note: { minHeight: 88, paddingTop: 13, textAlignVertical: "top" },
  pickedName: { color: colors.ink, fontWeight: "900", fontSize: 15 },
  dashedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dashedRowText: { color: colors.redStrong, fontSize: 12, fontWeight: "700", flex: 1 },
  mapWrap: {
    height: 180,
    borderRadius: radii.lg,
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  mapCenterPinHint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  mapHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  stepFooter: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: {
    color: colors.dangerText,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    lineHeight: 20,
  },
  empty: { color: colors.muted, fontSize: 14, marginTop: 12 },
  proposalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  proposalCopy: { flex: 1, paddingRight: 10 },
  muted: { color: colors.muted, marginTop: 3, fontSize: 13 },
  status: { color: colors.green, fontSize: 12, fontWeight: "900" },
  candidates: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.goldSoft },
  candidateTitle: { color: colors.ink, fontWeight: "900", lineHeight: 20 },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 8,
  },
  reviewLinkText: { color: colors.green, fontWeight: "900" },
  reviewCheck: { marginTop: spacing.xxl, marginBottom: spacing.lg },
  reviewTitle: { ...typography.title, fontSize: 24, color: colors.ink, textAlign: "center" },
  timelineCard: { marginTop: spacing.xl, width: "100%" },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  timelineLabel: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  timelineLabelMuted: { color: colors.muted },
  timelineBadge: {
    marginLeft: "auto",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.goldSoft,
  },
  timelineBadgeText: { color: colors.pendingText, fontWeight: "800", fontSize: 10 },
});
