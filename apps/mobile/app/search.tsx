import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "@/theme";
import { IconButton } from "@/components/IconButton";
import { SearchBar } from "@/components/SearchBar";
import { SuggestionRow, type SuggestionItem } from "@/components/SuggestionRow";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { searchSuggestFixture, type ColoniaSuggestion, type PuestoSuggestion } from "@/data/spots";
import { addRecentSearch, getRecentSearches } from "@/features/discovery/recentSearches";

type Status = "idle" | "loading" | "success" | "empty" | "error";

export default function SearchScreen() {
  const router = useRouter();
  const { tacoType } = useLocalSearchParams<{ tacoType?: string }>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [colonias, setColonias] = useState<ColoniaSuggestion[]>([]);
  const [puestos, setPuestos] = useState<PuestoSuggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [retryToken, setRetryToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    void getRecentSearches().then(setRecent);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestId.current += 1;
      setStatus("idle");
      setColonias([]);
      setPuestos([]);
      return;
    }
    const currentRequest = ++requestId.current;
    setStatus("loading");
    const timer = setTimeout(() => {
      searchSuggestFixture(trimmed)
        .then((result) => {
          if (requestId.current !== currentRequest) return;
          setColonias(result.colonias);
          setPuestos(result.puestos);
          const hasResults = result.colonias.length > 0 || result.puestos.length > 0;
          setStatus(hasResults ? "success" : "empty");
        })
        .catch(() => {
          if (requestId.current !== currentRequest) return;
          setStatus("error");
          AccessibilityInfo.announceForAccessibility(
            "No pudimos buscar. Lo que escribiste sigue aquí.",
          );
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, retryToken]);

  function close() {
    router.back();
  }

  function runSearch(text: string) {
    setQuery(text);
  }

  async function selectSuggestion(item: SuggestionItem) {
    await addRecentSearch(item.name);
    if (item.type === "puesto") {
      router.push(`/spot/${item.id}`);
    } else {
      router.back();
    }
  }

  async function selectRecent(text: string) {
    await addRecentSearch(text);
    setQuery(text);
  }

  function proposeFromQuery() {
    router.push({ pathname: "/propose", params: { name: query.trim() } });
  }

  function clearTacoTypeFilter() {
    router.navigate({ pathname: "/", params: { clearFilterAt: String(Date.now()) } });
  }

  function retry() {
    setRetryToken((token) => token + 1);
  }

  const coloniaItems: SuggestionItem[] = colonias.map((c) => ({
    id: c.id,
    type: "colonia",
    name: c.name,
    subtitle: c.spotCount > 0 ? `${c.municipality} · ${c.spotCount} puestos` : "sin puestos aún",
  }));
  const puestoItems: SuggestionItem[] = puestos.map((p) => ({
    id: p.id,
    type: "puesto",
    name: p.name,
    subtitle: `${p.neighborhood}${p.bestTaco ? ` · ${p.bestTaco}` : ""} · ${p.reviewCount} reseñas`,
  }));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Cerrar búsqueda" onPress={close} />
        <View style={styles.searchBarWrap}>
          <SearchBar
            value={query}
            onChangeText={runSearch}
            onClear={() => setQuery("")}
            placeholder="Busca un puesto o colonia"
            autoFocus
            accessibilityRole="combobox"
            accessibilityLabel="Buscar puesto o colonia"
            accessibilityState={{ expanded: status === "success" || status === "empty" }}
          />
          {status === "loading" && (
            <ActivityIndicator
              color={colors.green}
              size="small"
              style={styles.inlineSpinner}
              accessibilityElementsHidden
            />
          )}
        </View>
      </View>
      <Text style={styles.subline}>Lo más cercano primero · sin límite de zona</Text>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {status === "loading" && (
          <>
            <Text style={styles.statusLine} accessibilityLiveRegion="polite">
              Buscando…
            </Text>
            <SuggestionRow variant="skeleton" />
            <SuggestionRow variant="skeleton" />
            <SuggestionRow variant="skeleton" />
          </>
        )}

        {status === "idle" && recent.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionLabel}>BÚSQUEDAS RECIENTES</Text>
            <View style={styles.recentChips}>
              {recent.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  icon="time-outline"
                  onPress={() => selectRecent(item)}
                />
              ))}
            </View>
          </View>
        )}

        {status === "success" && (
          <>
            {coloniaItems.length > 0 && (
              <View accessibilityRole="list">
                <Text style={styles.sectionLabel}>COLONIAS</Text>
                {coloniaItems.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onPress={selectSuggestion}
                  />
                ))}
              </View>
            )}
            {puestoItems.length > 0 && (
              <View accessibilityRole="list">
                <Text style={styles.sectionLabel}>PUESTOS</Text>
                {puestoItems.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onPress={selectSuggestion}
                  />
                ))}
              </View>
            )}
            <SuggestionRow
              variant="dashed"
              label="¿Falta un puesto? Propónlo"
              icon="add-circle-outline"
              onPress={proposeFromQuery}
            />
          </>
        )}

        {status === "empty" && (
          <View style={styles.centeredSection}>
            <Text style={styles.noResultsTitle}>No encontramos «{query.trim()}»</Text>
            <Card tone="highlight" style={styles.noResultsCard}>
              <Text style={styles.noResultsCardTitle}>¿Existe y no está? Súmala al mapa</Text>
              <Button
                label={`Proponer «${query.trim()}»`}
                variant="accent"
                onPress={proposeFromQuery}
                style={styles.noResultsButton}
              />
            </Card>
            {tacoType ? (
              <View style={styles.hintRow}>
                <Text style={styles.hintText}>Filtro activo: {tacoType}</Text>
                <Button label="Quitar filtro" variant="secondary" onPress={clearTacoTypeFilter} />
              </View>
            ) : null}
          </View>
        )}

        {status === "error" && (
          <View style={styles.centeredSection}>
            <View style={styles.errorIconWrap}>
              <Ionicons name="cloud-offline-outline" size={28} color={colors.dangerText} />
            </View>
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              No pudimos buscar… lo que escribiste sigue aquí
            </Text>
            <Button
              label="Reintentar"
              variant="secondary"
              onPress={retry}
              style={styles.retryButton}
            />
            {recent.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.sectionLabel}>BÚSQUEDAS RECIENTES</Text>
                <View style={styles.recentChips}>
                  {recent.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      icon="time-outline"
                      onPress={() => selectRecent(item)}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingTop: 56 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  searchBarWrap: { flex: 1, position: "relative", justifyContent: "center" },
  inlineSpinner: { position: "absolute", right: spacing.md },
  subline: {
    ...typography.caption,
    color: colors.muted,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  body: { flex: 1 },
  bodyContent: { paddingBottom: spacing.xxl },
  statusLine: {
    ...typography.body,
    color: colors.muted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.muted,
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  recentSection: { paddingTop: spacing.md },
  recentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centeredSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, alignItems: "center" },
  noResultsTitle: {
    ...typography.sectionTitle,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  noResultsCard: { width: "100%" },
  noResultsCardTitle: {
    ...typography.body,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: spacing.md,
  },
  noResultsButton: { marginTop: spacing.xs },
  hintRow: {
    marginTop: spacing.lg,
    width: "100%",
    alignItems: "center",
    gap: spacing.sm,
  },
  hintText: { ...typography.body, color: colors.muted },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.dangerText,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: { minWidth: 160 },
});
