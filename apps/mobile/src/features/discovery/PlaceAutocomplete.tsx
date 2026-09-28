import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fetchAutocomplete, resolvePlace, type PlaceSuggestion } from "./autocomplete";

const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  green: "#276C4F",
  paper: "#FFFAF1",
  line: "#DFD0BA",
  cream: "#FBF3E6",
};

type ResolvedSelection = {
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

type ExistingSpot = { id: string; name: string; neighborhood: string };

type Props = {
  session: Session;
  onSelectPlace: (place: ResolvedSelection) => void;
  onSelectExistingSpot: (spot: ExistingSpot) => void;
};

export function PlaceAutocomplete({ session, onSelectPlace, onSelectExistingSpot }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setAttribution(null);
      setSearching(false);
      return;
    }
    const currentRequest = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      fetchAutocomplete(session, trimmed)
        .then((result) => {
          if (requestId.current !== currentRequest) return;
          setItems(result.items);
          setAttribution(result.attribution);
          setError("");
        })
        .catch((cause) => {
          if (requestId.current !== currentRequest) return;
          setItems([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos buscar sugerencias. Puedes cambiar a captura manual.",
          );
        })
        .finally(() => {
          if (requestId.current === currentRequest) setSearching(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, session]);

  async function selectGoogleSuggestion(placeId: string) {
    setResolvingPlaceId(placeId);
    setError("");
    try {
      const resolved = await resolvePlace(session, placeId);
      requestId.current += 1;
      setSearching(false);
      onSelectPlace({
        name: resolved.name,
        neighborhood: resolved.neighborhood,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        placeId: resolved.placeId,
      });
      skipNextSearch.current = true;
      setQuery(resolved.name);
      setItems([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos obtener los datos de ese lugar.",
      );
    } finally {
      setResolvingPlaceId(null);
    }
  }

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Busca una taquería, colonia, municipio o dirección"
        placeholderTextColor="#9C8D80"
        style={styles.input}
        maxLength={100}
        accessibilityLabel="Buscar taquería, colonia, municipio o dirección"
      />
      {searching ? <ActivityIndicator color={colors.green} style={styles.spinner} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item, index) => {
            const key = item.kind === "spot" ? `spot:${item.id}` : `google:${item.placeId}`;
            const busy = item.kind === "google" && resolvingPlaceId === item.placeId;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  item.kind === "spot"
                    ? onSelectExistingSpot(item)
                    : void selectGoogleSuggestion(item.placeId)
                }
                style={[styles.row, index === 0 && styles.rowFirst]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {item.kind === "spot" ? item.name : item.text}
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    {item.kind === "spot"
                      ? `${item.neighborhood} · ya está en Taco Hunt`
                      : (item.secondaryText ?? "Sugerencia de Google")}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.green} />
                ) : (
                  <Text style={styles.pick}>Elegir</Text>
                )}
              </Pressable>
            );
          })}
          {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  spinner: { marginTop: 10 },
  error: {
    color: "#A92E24",
    backgroundColor: "#FBE2DC",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    lineHeight: 20,
  },
  list: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8DCCB",
  },
  rowFirst: { borderTopWidth: 0 },
  rowTitle: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  rowSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  pick: { color: colors.green, fontWeight: "900", fontSize: 12 },
  attribution: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E8DCCB",
  },
});
