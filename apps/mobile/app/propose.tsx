import { useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { type Region } from "react-native-maps";
import { useAuth } from "@/auth/provider";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Stepper } from "@/components/Stepper";
import {
  listMySpotProposals,
  ProposalDuplicateError,
  searchProposalPlaces,
  submitProposal,
  type GoogleProposalSuggestion,
  type RegisteredPlaceMatch,
  type ProposalSource,
  type SpotProposal,
} from "@/data/proposals";
import { colors, radii, spacing, typography } from "@/theme";

type Step = 1 | 2 | 3;
type SearchStatus = "idle" | "loading" | "success" | "error";
type SubmitStatus = "idle" | "loading" | "error";

const DEFAULT_PIN = { latitude: 25.6866, longitude: -100.3161 };

export default function ProposeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [source, setSource] = useState<ProposalSource>("google");
  const [step, setStep] = useState<Step>(1);
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<GoogleProposalSuggestion[]>([]);
  const [duplicate, setDuplicate] = useState<RegisteredPlaceMatch>();
  const [selectedGoogle, setSelectedGoogle] = useState<GoogleProposalSuggestion>();
  const [latitude, setLatitude] = useState(DEFAULT_PIN.latitude);
  const [longitude, setLongitude] = useState(DEFAULT_PIN.longitude);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [proposals, setProposals] = useState<SpotProposal[]>([]);

  const mapRegion = useMemo<Region>(
    () => ({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }),
    [latitude, longitude],
  );

  useEffect(() => {
    if (!session || source !== "google" || selectedGoogle || query.trim().length < 2) {
      setSearchStatus("idle");
      setSuggestions([]);
      setDuplicate(undefined);
      return;
    }

    let cancelled = false;
    setSearchStatus("loading");
    const timer = setTimeout(() => {
      void searchProposalPlaces(session, query)
        .then((result) => {
          if (cancelled) return;
          setSuggestions(result.suggestions);
          setDuplicate(result.registeredMatch);
          setSearchStatus("success");
        })
        .catch((cause) => {
          if (cancelled) return;
          setSuggestions([]);
          setDuplicate(undefined);
          setSearchStatus("error");
          announce(cause instanceof Error ? cause.message : "No pudimos buscar sugerencias.");
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedGoogle, session, source]);

  useEffect(() => {
    if (!session) {
      setProposals([]);
      return;
    }
    let cancelled = false;
    void listMySpotProposals(session)
      .then((items) => {
        if (!cancelled) setProposals(items);
      })
      .catch(() => {
        if (!cancelled) setProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  function announce(message: string) {
    AccessibilityInfo.announceForAccessibility(message);
  }

  function resetSource(nextSource: ProposalSource) {
    setSource(nextSource);
    setStep(1);
    setQuery("");
    setSuggestions([]);
    setDuplicate(undefined);
    setSelectedGoogle(undefined);
    setSearchStatus("idle");
    setSubmitError("");
    setSubmitStatus("idle");
  }

  function selectGoogleSuggestion(suggestion: GoogleProposalSuggestion) {
    setSelectedGoogle(suggestion);
    setQuery(suggestion.displayName);
    setSuggestions([]);
    setDuplicate(undefined);
    setSearchStatus("success");
    announce(`${suggestion.displayName} seleccionado. El envío usará únicamente su place_id.`);
  }

  async function useLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        announce("Sin permiso de ubicación. Puedes arrastrar el mapa para ajustar el pin.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
      announce("Pin colocado en tu ubicación.");
    } catch {
      announce("No pudimos leer tu ubicación. Arrastra el mapa para ajustar el pin.");
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (!session) {
      router.push("/sign-in");
      return;
    }

    setSubmitStatus("loading");
    setSubmitError("");
    try {
      const submission =
        source === "google" && selectedGoogle
          ? { source: "google" as const, placeId: selectedGoogle.placeId }
          : {
              source: "local" as const,
              latitude,
              longitude,
              ...(name.trim() ? { name: name.trim() } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            };
      await submitProposal(session, submission);
      void listMySpotProposals(session)
        .then(setProposals)
        .catch(() => undefined);
      setSubmitted(true);
      announce("Propuesta enviada. Está en revisión.");
    } catch (cause) {
      if (cause instanceof ProposalDuplicateError) {
        setSelectedGoogle(undefined);
        setDuplicate(cause.duplicate);
        setStep(1);
        setSubmitStatus("idle");
        announce("Este lugar ya está registrado. Puedes abrir su ficha.");
        return;
      }
      const message = cause instanceof Error ? cause.message : "No se pudo enviar la propuesta.";
      setSubmitError(message);
      setSubmitStatus("error");
      announce(message);
    }
  }

  function startOver() {
    setSubmitted(false);
    setStep(1);
    setSource("google");
    setQuery("");
    setSuggestions([]);
    setDuplicate(undefined);
    setSelectedGoogle(undefined);
    setName("");
    setNote("");
    setLatitude(DEFAULT_PIN.latitude);
    setLongitude(DEFAULT_PIN.longitude);
    setSubmitError("");
    setSubmitStatus("idle");
  }

  if (submitted) {
    const submittedName = source === "google" ? selectedGoogle?.displayName : name.trim();
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.reviewContent}>
        <View style={styles.reviewIcon} accessibilityLabel="Propuesta pendiente de revisión">
          <Ionicons name="checkmark-circle" size={64} color={colors.green} />
        </View>
        <Text style={styles.kicker}>PROPUESTA ENVIADA</Text>
        <Text style={styles.reviewTitle}>{submittedName || "Tu taquería"} está en revisión</Text>
        <Text style={styles.body}>
          Un moderador revisará tu propuesta. Mientras tanto, solo tú la ves en el mapa con un pin
          punteado.
        </Text>
        <Card style={styles.timelineCard} accessibilityLabel="Estado de la propuesta">
          <TimelineRow icon="checkmark-circle" label="Enviada" color={colors.green} />
          <TimelineRow icon="time" label="En revisión" color={colors.gold} badge="AHORA" />
          <TimelineRow icon="ellipse-outline" label="Publicada" color={colors.muted} muted />
        </Card>
        <Button
          label="Volver al mapa"
          variant="primary"
          onPress={() => router.push("/")}
          style={styles.topAction}
        />
        <Button
          label="Mis propuestas"
          variant="secondary"
          onPress={() => {
            setSubmitStatus("idle");
            setSubmitted(false);
          }}
          style={styles.action}
        />
        <Button label="Proponer otra" variant="ghost" onPress={startOver} style={styles.action} />
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
        <Pressable accessibilityRole="link" accessibilityLabel="Volver al mapa" style={styles.back}>
          <Ionicons name="chevron-back" size={18} color={colors.green} />
          <Text style={styles.backText}>Volver al mapa</Text>
        </Pressable>
      </Link>
      <Text style={styles.kicker}>CONTRIBUYE A TACO HUNT</Text>
      <Text style={styles.title}>Agrega una taquería</Text>
      <Text style={styles.intro}>
        Primero cuidamos la ubicación. Después, alguien del equipo revisa la propuesta.
      </Text>

      <View style={styles.sourceSwitch} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: source === "google" }}
          accessibilityLabel="Buscar una taquería en Google"
          onPress={() => resetSource("google")}
          style={[styles.sourceTab, source === "google" && styles.sourceTabActive]}
        >
          <Ionicons
            name="search"
            size={16}
            color={source === "google" ? colors.green : colors.muted}
          />
          <Text style={[styles.sourceTabText, source === "google" && styles.sourceTabTextActive]}>
            Buscar en Google
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: source === "local" }}
          accessibilityLabel="Poner un pin en el mapa"
          onPress={() => resetSource("local")}
          style={[styles.sourceTab, source === "local" && styles.sourceTabActive]}
        >
          <Ionicons
            name="location"
            size={16}
            color={source === "local" ? colors.green : colors.muted}
          />
          <Text style={[styles.sourceTabText, source === "local" && styles.sourceTabTextActive]}>
            Poner un pin
          </Text>
        </Pressable>
      </View>

      <Stepper currentStep={step} totalSteps={3} />

      {!session ? (
        <Card tone="highlight" style={styles.accountCard}>
          <Text style={styles.cardTitle}>Necesitas una cuenta para proponer</Text>
          <Text style={styles.bodyLeft}>
            Tu propuesta será privada para ti mientras está pendiente.
          </Text>
          <Button
            label="Iniciar sesión"
            variant="primary"
            onPress={() => router.push("/sign-in")}
            style={styles.inlineAction}
          />
        </Card>
      ) : null}

      {source === "google" && step === 1 ? (
        <Card>
          <Text style={styles.stepTitle}>¿Cuál taquería es?</Text>
          <Text style={styles.bodyLeft}>
            Elige un resultado para vincularlo sin copiar datos de Google a Taco Hunt.
          </Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setSelectedGoogle(undefined);
              setSubmitError("");
            }}
            placeholder="Busca una taquería o colonia"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            maxLength={100}
            accessibilityLabel="Buscar una taquería o colonia en Google"
          />
          {searchStatus === "loading" ? (
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.green} />
              <Text style={styles.muted}>Buscando sugerencias…</Text>
            </View>
          ) : null}
          {searchStatus === "error" ? (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
              <Text style={styles.errorText}>
                No pudimos buscar. Puedes colocar un pin en el mapa.
              </Text>
            </View>
          ) : null}
          {duplicate ? (
            <DuplicateCard
              match={duplicate}
              onView={() => router.push(`/spot/${duplicate.spotId}`)}
            />
          ) : null}
          {suggestions.length > 0 ? (
            <View style={styles.suggestionList} accessibilityLabel="Resultados de Google">
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.placeId}
                  accessibilityRole="button"
                  accessibilityLabel={`Seleccionar ${suggestion.displayName}`}
                  onPress={() => selectGoogleSuggestion(suggestion)}
                  style={styles.suggestionRow}
                >
                  <View style={styles.suggestionCopy}>
                    <Text style={styles.suggestionTitle}>{suggestion.displayName}</Text>
                    <Text style={styles.muted}>{suggestion.secondaryText}</Text>
                  </View>
                  <Text style={styles.pickText}>Elegir</Text>
                </Pressable>
              ))}
              <Text style={styles.attribution}>Resultados de Google</Text>
            </View>
          ) : null}
          {selectedGoogle ? (
            <View style={styles.selectedCard} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionTitle}>{selectedGoogle.displayName}</Text>
                <Text style={styles.muted}>Selección lista · se enviará solo el place_id</Text>
              </View>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="No aparece. Poner un pin en el mapa"
            onPress={() => resetSource("local")}
            style={styles.manualCard}
          >
            <Ionicons name="location-outline" size={20} color={colors.redStrong} />
            <View style={styles.suggestionCopy}>
              <Text style={styles.manualTitle}>No aparece: poner un pin en el mapa</Text>
              <Text style={styles.muted}>No necesitas escribir una dirección.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.redStrong} />
          </Pressable>
          <Button
            label="Siguiente"
            variant="primary"
            disabled={!selectedGoogle}
            onPress={() => setStep(2)}
            style={styles.topAction}
          />
        </Card>
      ) : null}

      {source === "local" && step === 1 ? (
        <Card>
          <Text style={styles.stepTitle}>¿Dónde se pone?</Text>
          <Text style={styles.bodyLeft}>
            Mueve el mapa hasta el punto exacto. El pin es lo único necesario.
          </Text>
          <PinMap
            region={mapRegion}
            onRegionChange={(region) => {
              setLatitude(region.latitude);
              setLongitude(region.longitude);
            }}
          />
          <Button
            label={locating ? "Buscando…" : "Estoy aquí"}
            variant="secondary"
            icon="navigate"
            loading={locating}
            onPress={() => void useLocation()}
            style={styles.inlineAction}
          />
          <Text style={styles.mapHint}>Arrastra el mapa para ajustar el pin.</Text>
          <Button
            label="Siguiente"
            variant="primary"
            onPress={() => setStep(2)}
            style={styles.topAction}
          />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          {source === "google" ? (
            <>
              <Text style={styles.stepTitle}>Lugar seleccionado</Text>
              <View style={styles.selectedCard} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                <View style={styles.suggestionCopy}>
                  <Text style={styles.suggestionTitle}>{selectedGoogle?.displayName}</Text>
                  <Text style={styles.muted}>Resultados de Google · selección lista</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Detalles que ayudan</Text>
              <Text style={styles.bodyLeft}>
                Estos datos son opcionales y se quedan con tu propuesta.
              </Text>
              <Text style={styles.label}>Nombre (opcional)</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Ej. Tacos de la esquina"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                maxLength={120}
                accessibilityLabel="Nombre opcional de la taquería"
              />
              <Text style={styles.label}>Nota o referencia (opcional)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Ej. Frente al parque, junto a la farmacia"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.note]}
                multiline
                maxLength={500}
                accessibilityLabel="Nota o referencia opcional"
              />
            </>
          )}
          <View style={styles.stepFooter}>
            <Button
              label="Atrás"
              variant="ghost"
              onPress={() => setStep(1)}
              style={styles.backAction}
            />
            <Button
              label="Siguiente"
              variant="primary"
              onPress={() => setStep(3)}
              style={styles.nextAction}
            />
          </View>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <Text style={styles.stepTitle}>Revisa antes de enviar</Text>
          <View style={styles.reviewRow}>
            <Ionicons
              name={source === "google" ? "logo-google" : "location"}
              size={20}
              color={colors.green}
            />
            <View style={styles.suggestionCopy}>
              <Text style={styles.reviewLabel}>
                {source === "google" ? "Lugar de Google" : "Pin de Taco Hunt"}
              </Text>
              <Text style={styles.reviewValue}>
                {source === "google" ? selectedGoogle?.displayName : name.trim() || "Sin nombre"}
              </Text>
            </View>
          </View>
          <Text style={styles.bodyLeft}>
            {source === "google"
              ? "La propuesta se enviará con el place_id seleccionado. Los datos de Google no se guardan como información de Taco Hunt."
              : "La ubicación está lista. El nombre y la nota son opcionales; puedes enviar solo el pin."}
          </Text>
          {submitError ? (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          ) : null}
          <View style={styles.stepFooter}>
            <Button
              label="Atrás"
              variant="ghost"
              onPress={() => setStep(2)}
              style={styles.backAction}
            />
            <Button
              label={submitStatus === "error" ? "Reintentar envío" : "Enviar para revisión"}
              variant="accent"
              loading={submitStatus === "loading"}
              onPress={() => void submit()}
              style={styles.nextAction}
            />
          </View>
        </Card>
      ) : null}

      {session ? <MyProposals proposals={proposals} /> : null}
    </ScrollView>
  );
}

function PinMap({
  region,
  onRegionChange,
}: {
  region: Region;
  onRegionChange: (region: Region) => void;
}) {
  return (
    <View style={styles.mapWrap} accessibilityLabel="Mapa para elegir la ubicación">
      <MapView
        style={StyleSheet.absoluteFill}
        region={region}
        onRegionChangeComplete={onRegionChange}
      />
      <View style={styles.centerPin} pointerEvents="none">
        <Ionicons name="location" size={36} color={colors.redStrong} />
      </View>
    </View>
  );
}

function DuplicateCard({ match, onView }: { match: RegisteredPlaceMatch; onView: () => void }) {
  return (
    <Card tone="highlight" style={styles.duplicateCard} accessibilityLiveRegion="polite">
      <View style={styles.duplicateHeading}>
        <Ionicons name="sparkles" size={18} color={colors.pendingText} />
        <Text style={styles.duplicateKicker}>¿ES ESTE? YA ESTÁ EN TACO HUNT</Text>
      </View>
      <Text style={styles.duplicateTitle}>{match.displayName}</Text>
      <Text style={styles.muted}>{match.neighborhood}</Text>
      <Button label="Ver puesto" variant="secondary" onPress={onView} style={styles.inlineAction} />
    </Card>
  );
}

function TimelineRow({
  icon,
  label,
  color,
  badge,
  muted = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.timelineLabel, muted && styles.timelineMuted]}>{label}</Text>
      {badge ? <Text style={styles.timelineBadge}>{badge}</Text> : null}
    </View>
  );
}

function MyProposals({ proposals }: { proposals: SpotProposal[] }) {
  return (
    <Card style={styles.proposalsCard}>
      <Text style={styles.cardTitle}>Mis propuestas</Text>
      <Text style={styles.bodyLeft}>
        Son propuestas de Taco Hunt; los resultados de Google no se guardan aquí.
      </Text>
      {proposals.map((proposal) => (
        <View key={proposal.id} style={styles.proposalRow}>
          <View style={styles.suggestionCopy}>
            <Text style={styles.suggestionTitle}>
              {proposal.source === "google" ? "Lugar de Google" : proposal.name || "Pin sin nombre"}
            </Text>
            <Text style={styles.muted}>
              {proposal.source === "google"
                ? "Vínculo pendiente de moderación"
                : "Pin local · solo tú la ves por ahora"}
            </Text>
          </View>
          <Text style={styles.pendingStatus}>Pendiente</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: 44 },
  reviewContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: 44,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  backText: { color: colors.green, fontSize: 15, fontWeight: "800" },
  kicker: { ...typography.kicker, color: colors.green },
  title: { color: colors.ink, ...typography.title, marginTop: spacing.sm },
  intro: { color: colors.muted, ...typography.body, lineHeight: 21, marginTop: spacing.sm },
  sourceSwitch: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.segmentTrack,
  },
  sourceTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  sourceTabActive: { backgroundColor: colors.paper },
  sourceTabText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  sourceTabTextActive: { color: colors.green },
  accountCard: { marginBottom: spacing.lg },
  cardTitle: { color: colors.ink, ...typography.sectionTitle },
  stepTitle: { color: colors.ink, ...typography.sectionTitle, marginBottom: spacing.sm },
  body: {
    color: colors.muted,
    ...typography.body,
    lineHeight: 21,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  bodyLeft: { color: colors.muted, ...typography.body, lineHeight: 21, marginTop: spacing.sm },
  inlineAction: { marginTop: spacing.md },
  topAction: { marginTop: spacing.lg },
  action: { marginTop: spacing.sm },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 15,
    marginTop: spacing.md,
  },
  note: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: "top" },
  statusRow: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  muted: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  suggestionList: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.paper,
    overflow: "hidden",
  },
  suggestionRow: {
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  suggestionCopy: { flex: 1 },
  suggestionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  pickText: { color: colors.green, fontSize: 12, fontWeight: "900" },
  attribution: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
    padding: spacing.sm,
  },
  selectedCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.greenSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  manualCard: {
    marginTop: spacing.lg,
    minHeight: 66,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.redStrong,
    backgroundColor: colors.cream,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  manualTitle: { flex: 1, color: colors.redStrong, fontSize: 13, fontWeight: "800" },
  errorBanner: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: { flex: 1, color: colors.dangerText, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  duplicateCard: { marginTop: spacing.md },
  duplicateHeading: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  duplicateKicker: { color: colors.pendingText, ...typography.kicker, fontSize: 10 },
  duplicateTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginTop: spacing.sm },
  mapWrap: { height: 210, marginTop: spacing.md, borderRadius: radii.lg, overflow: "hidden" },
  centerPin: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.lg,
  },
  mapHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  label: {
    color: colors.muted,
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  stepFooter: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  backAction: { flex: 1 },
  nextAction: { flex: 2 },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  reviewLabel: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  reviewValue: { color: colors.ink, fontSize: 15, fontWeight: "900", marginTop: spacing.xs },
  reviewIcon: { marginTop: spacing.xxl },
  reviewTitle: {
    color: colors.ink,
    ...typography.title,
    fontSize: 26,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  timelineCard: { width: "100%", marginTop: spacing.xl },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  timelineLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  timelineMuted: { color: colors.muted },
  timelineBadge: {
    marginLeft: "auto",
    color: colors.pendingText,
    ...typography.badge,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  proposalsCard: { marginTop: spacing.xl },
  proposalRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  pendingStatus: { color: colors.pendingText, ...typography.caption },
});
