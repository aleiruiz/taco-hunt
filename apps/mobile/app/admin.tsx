import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/auth/provider";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const tabs = [
  ["spots", "Propuestas"],
  ["reports", "Reportes"],
  ["photos", "Fotos"],
  ["duplicates", "Duplicados"],
  ["audit", "Bitácora"],
] as const;
type Queue = (typeof tabs)[number][0];
type QueueItem = Record<string, unknown> & { id: string };

export default function AdminScreen() {
  const { session } = useAuth();
  const [tab, setTab] = useState<Queue>("spots");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` }),
    [session?.access_token],
  );

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${API}/admin/${tab === "audit" ? "audit" : `queue?kind=${tab}`}`,
        { headers },
      );
      if (response.status === 403) throw new Error("No tienes permisos de moderación.");
      if (!response.ok) throw new Error("No pudimos cargar esta cola.");
      const data = (await response.json()) as { items?: QueueItem[] };
      setItems(data.items ?? []);
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "No pudimos cargar esta cola.");
    } finally {
      setLoading(false);
    }
  }, [headers, session, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body: Record<string, string> = {}) {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("La acción no pudo completarse.");
    await load();
  }

  async function run(path: string, body?: Record<string, string>) {
    try {
      setMessage(null);
      await act(path, body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La acción no pudo completarse.");
    }
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Panel de moderación</Text>
        <Text style={styles.body}>Inicia sesión con una cuenta administradora.</Text>
        <Link href="/sign-in" style={styles.link}>
          Iniciar sesión
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Link href="/settings" style={styles.back}>
        ‹ Ajustes
      </Link>
      <Text style={styles.kicker}>SOLO ADMINISTRADORES</Text>
      <Text style={styles.title}>Moderar la comunidad</Text>
      <Text style={styles.body}>Cada acción queda registrada en la bitácora privada.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {tabs.map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.activeTab]}
          >
            <Text style={[styles.tabText, tab === value && styles.activeTabText]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {loading ? <ActivityIndicator color="#E95032" style={styles.loader} /> : null}
      {message ? <Text style={styles.notice}>{message}</Text> : null}
      {!loading && !message && items.length === 0 ? (
        <Text style={styles.empty}>No hay elementos pendientes.</Text>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {String(item.name ?? item.targetName ?? item.spotName ?? "Elemento")}
          </Text>
          <Text style={styles.body}>
            {tab === "duplicates"
              ? `${String(item.candidateName ?? "Candidato cercano")} · ${String(item.distanceMeters ?? "?")} m`
              : tab === "reports"
                ? `${String(item.reason ?? "Sin motivo")} · ${String(item.targetType ?? "contenido")}`
                : tab === "photos"
                  ? `${String(item.tacoName ?? "Taco")} · ${String(item.spotName ?? "Puesto")}`
                  : `${String(item.neighborhood ?? "Sin colonia")} · ${String(item.status ?? "pendiente")}${item.moderationReason ? ` · ${String(item.moderationReason)}` : ""}`}
          </Text>
          <View style={styles.actions}>
            {tab === "audit" ? (
              <Text
                style={styles.body}
              >{`${String(item.action ?? "acción")} · ${String(item.targetType ?? "elemento")} · ${String(item.reason ?? "Sin motivo")}`}</Text>
            ) : null}
            {tab === "spots" ? (
              <>
                <Action
                  label="Aprobar"
                  onPress={() => void run(`/admin/spot-proposals/${item.id}/approve`)}
                  primary
                />
                <Action
                  label="Pedir cambios"
                  onPress={() =>
                    void run(`/admin/spot-proposals/${item.id}/request-changes`, {
                      reason: "Faltan datos para verificar el puesto",
                    })
                  }
                />
                <Action
                  label="Rechazar"
                  onPress={() =>
                    void run(`/admin/spot-proposals/${item.id}/reject`, {
                      reason: "No cumple los criterios de publicación",
                    })
                  }
                  danger
                />
              </>
            ) : null}
            {tab === "reports" ? (
              <Action
                label="Cerrar reporte"
                onPress={() => void run(`/admin/reports/${item.id}/close`)}
                primary
              />
            ) : null}
            {tab === "photos" ? (
              <Action
                label="Ocultar foto"
                onPress={() =>
                  void run(`/admin/reviews/${item.id}/hide-photo`, {
                    reason: "Foto no apta para publicación",
                  })
                }
                danger
              />
            ) : null}
            {tab === "duplicates" ? (
              <Action
                label="Fusionar propuesta"
                onPress={() =>
                  void run(`/admin/duplicates/${item.id}/merge`, {
                    canonicalId: String(item.candidateId),
                    reason: "Duplicado cercano confirmado",
                  })
                }
                primary
              />
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function Action({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, primary && styles.primary, danger && styles.danger]}
    >
      <Text style={[styles.actionText, (primary || danger) && styles.inverse]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FBF3E6" },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 40 },
  center: { flex: 1, padding: 28, justifyContent: "center", backgroundColor: "#FBF3E6" },
  back: { color: "#276C4F", fontSize: 15, fontWeight: "800", minHeight: 44 },
  kicker: { color: "#276C4F", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 18 },
  title: { color: "#302723", fontSize: 30, fontWeight: "900", marginTop: 10 },
  body: { color: "#6C5D53", fontSize: 14, lineHeight: 20, marginTop: 8 },
  link: { color: "#E95032", fontWeight: "900", marginTop: 20 },
  tabs: { marginTop: 24, maxHeight: 52 },
  tab: {
    borderWidth: 1,
    borderColor: "#E8DCCB",
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: "#FFFAF1",
  },
  activeTab: { backgroundColor: "#302723", borderColor: "#302723" },
  tabText: { color: "#6C5D53", fontWeight: "800", fontSize: 12 },
  activeTabText: { color: "#FFFAF1" },
  loader: { marginTop: 28 },
  notice: {
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F9DEAE",
    color: "#302723",
    lineHeight: 20,
  },
  empty: { marginTop: 30, color: "#6C5D53", textAlign: "center" },
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8DCCB",
    backgroundColor: "#FFFAF1",
  },
  cardTitle: { color: "#302723", fontSize: 16, fontWeight: "900" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  action: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DFD0BA",
  },
  primary: { backgroundColor: "#276C4F", borderColor: "#276C4F" },
  danger: { backgroundColor: "#E95032", borderColor: "#E95032" },
  actionText: { color: "#302723", fontWeight: "800", fontSize: 12 },
  inverse: { color: "#FFFAF1" },
});
