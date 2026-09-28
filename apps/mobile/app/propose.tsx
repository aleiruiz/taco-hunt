import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { Link, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/auth/provider";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  green: "#276C4F",
  paper: "#FFFAF1",
  line: "#DFD0BA",
  cream: "#FBF3E6",
};
type Source = "manual" | "autocomplete";
type Proposal = {
  id: string;
  name: string;
  neighborhood: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
type NearbyCandidate = { id: string; name: string; neighborhood: string; distanceMeters: number };

export default function ProposeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [source, setSource] = useState<Source>("manual");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [latitude, setLatitude] = useState("25.6866");
  const [longitude, setLongitude] = useState("-100.3161");
  const [note, setNote] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
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
        setError("Sin permiso de ubicación. Puedes escribir el pin manualmente.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
    } catch {
      setError("No pudimos leer tu ubicación. Puedes escribir el pin manualmente.");
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (!session?.access_token) {
      router.push("/sign-in");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
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
          latitude: Number(latitude),
          longitude: Number(longitude),
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
      setMessage("Recibimos tu propuesta. Quedará pendiente de revisión y aún no acepta reseñas.");
      setName("");
      setNeighborhood("");
      setNote("");
      setSourceRef("");
      await loadMine();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos enviar la propuesta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Link href="/" style={styles.back}>
        ‹ Volver a explorar
      </Link>
      <Text style={styles.kicker}>CONTRIBUYE A TACO HUNT</Text>
      <Text style={styles.title}>Propón una taquería</Text>
      <Text style={styles.body}>
        Ayúdanos a encontrar puestos que todavía no aparecen. Un moderador revisará los datos antes
        de publicarlos.
      </Text>
      {!session ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Necesitas una cuenta para proponer</Text>
          <Text style={styles.body}>
            Tu propuesta será privada para ti mientras está pendiente.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sign-in")}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.label}>¿Cómo encontraste este lugar?</Text>
        <View style={styles.segmented}>
          {(["manual", "autocomplete"] as Source[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setSource(option)}
              style={[styles.segment, source === option && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, source === option && styles.segmentTextActive]}>
                {option === "manual" ? "Captura manual" : "Desde sugerencia"}
              </Text>
            </Pressable>
          ))}
        </View>
        {source === "autocomplete" ? (
          <>
            <Text style={styles.label}>Referencia de la sugerencia</Text>
            <TextInput
              value={sourceRef}
              onChangeText={setSourceRef}
              placeholder="ID o referencia de la sugerencia"
              placeholderTextColor="#9C8D80"
              style={styles.input}
              maxLength={200}
            />
          </>
        ) : null}
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej. Tacos El Cometa"
          placeholderTextColor="#9C8D80"
          style={styles.input}
          maxLength={120}
        />
        <Text style={styles.label}>Colonia o municipio</Text>
        <TextInput
          value={neighborhood}
          onChangeText={setNeighborhood}
          placeholder="Ej. Mitras Centro"
          placeholderTextColor="#9C8D80"
          style={styles.input}
          maxLength={120}
        />
        <Text style={styles.label}>Pin del puesto</Text>
        <View style={styles.row}>
          <TextInput
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="decimal-pad"
            placeholder="Latitud"
            placeholderTextColor="#9C8D80"
            style={[styles.input, styles.coordinate]}
          />
          <TextInput
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="decimal-pad"
            placeholder="Longitud"
            placeholderTextColor="#9C8D80"
            style={[styles.input, styles.coordinate]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void useLocation()}
          style={styles.locationButton}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator color={colors.green} />
          ) : (
            <Text style={styles.locationText}>Usar mi ubicación actual</Text>
          )}
        </Pressable>
        <Text style={styles.label}>Nota opcional</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Referencia útil para el moderador"
          placeholderTextColor="#9C8D80"
          style={[styles.input, styles.note]}
          multiline
          maxLength={500}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {nearbyCandidates.length > 0 ? (
          <View style={styles.candidates}>
            <Text style={styles.candidateTitle}>¿Quizá te refieres a un puesto que ya existe?</Text>
            {nearbyCandidates.map((candidate) => (
              <Pressable
                key={candidate.id}
                onPress={() => router.push(`/spot/${candidate.id}`)}
                style={styles.candidateRow}
              >
                <View>
                  <Text style={styles.proposalName}>{candidate.name}</Text>
                  <Text style={styles.muted}>
                    {candidate.neighborhood} · {candidate.distanceMeters} m
                  </Text>
                </View>
                <Text style={styles.locationText}>Ver</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void submit()}
          style={[styles.button, busy && styles.disabled]}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{busy ? "Enviando…" : "Enviar para revisión"}</Text>
        </Pressable>
      </View>
      {session ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mis propuestas</Text>
          <Text style={styles.body}>Solo tú puedes verlas mientras esperan revisión.</Text>
          {proposals.length === 0 ? (
            <Text style={styles.empty}>Todavía no has enviado una propuesta.</Text>
          ) : (
            proposals.map((proposal) => (
              <View key={proposal.id} style={styles.proposalRow}>
                <View style={styles.proposalCopy}>
                  <Text style={styles.proposalName}>{proposal.name}</Text>
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
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 44 },
  back: {
    color: colors.green,
    fontSize: 15,
    fontWeight: "800",
    minHeight: 44,
    textAlignVertical: "center",
    marginBottom: 24,
  },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10, marginBottom: 12 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  card: {
    padding: 19,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8DCCB",
    backgroundColor: colors.paper,
    marginTop: 18,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    marginBottom: 5,
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 14, marginBottom: 7 },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center",
    alignItems: "center",
  },
  segmentActive: { backgroundColor: "#E8F0E7", borderColor: colors.green },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  segmentTextActive: { color: colors.green },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    paddingHorizontal: 13,
    color: colors.ink,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: 8 },
  coordinate: { flex: 1 },
  note: { minHeight: 88, paddingTop: 13, textAlignVertical: "top" },
  locationButton: { minHeight: 42, justifyContent: "center", alignItems: "center" },
  locationText: { color: colors.green, fontWeight: "900" },
  button: {
    minHeight: 48,
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: colors.paper, fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.65 },
  error: {
    color: "#A92E24",
    backgroundColor: "#FBE2DC",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    lineHeight: 20,
  },
  success: {
    color: colors.green,
    backgroundColor: "#E8F0E7",
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
    borderTopColor: "#E8DCCB",
  },
  proposalCopy: { flex: 1, paddingRight: 10 },
  proposalName: { color: colors.ink, fontWeight: "900", fontSize: 15 },
  muted: { color: colors.muted, marginTop: 3, fontSize: 13 },
  status: { color: colors.green, fontSize: 12, fontWeight: "900" },
  candidates: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#FFF3D8" },
  candidateTitle: { color: colors.ink, fontWeight: "900", lineHeight: 20 },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8DCCB",
    marginTop: 8,
  },
});
