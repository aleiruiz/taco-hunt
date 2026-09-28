import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, type Href, useRouter } from "expo-router";
import { useAuth } from "@/auth/provider";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";

type TacoType = { id: string; slug: string; nameEs: string };
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
  latitude: number;
  longitude: number;
  lastVerifiedAt: string | null;
  reviewCount: number;
  bestTaco: Taco | null;
};
type Page = { items: Spot[]; nextCursor: string | null };
type Area = { label: string; north: number; south: number; east: number; west: number };
const API_COVERAGE = { north: 27, south: 25, east: -99, west: -101.5 };
const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const AREAS: Area[] = [
  { label: "Monterrey", north: 25.78, south: 25.6, east: -100.2, west: -100.4 },
  { label: "San Pedro", north: 25.72, south: 25.62, east: -100.3, west: -100.45 },
  { label: "San Nicolás", north: 25.8, south: 25.7, east: -100.2, west: -100.32 },
  { label: "Guadalupe", north: 25.72, south: 25.62, east: -100.15, west: -100.27 },
  { label: "Apodaca", north: 25.82, south: 25.72, east: -100.08, west: -100.23 },
];
const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  green: "#276C4F",
  paper: "#FFFAF1",
  line: "#DFD0BA",
  cream: "#FBF3E6",
};

function clipAreaToApiCoverage(area: Area): Area | null {
  const north = Math.min(API_COVERAGE.north, area.north);
  const south = Math.max(API_COVERAGE.south, area.south);
  const east = Math.min(API_COVERAGE.east, area.east);
  const west = Math.max(API_COVERAGE.west, area.west);
  if (south >= north || west >= east) return null;
  return { ...area, north, south, east, west };
}

export default function ExploreScreen() {
  const [items, setItems] = useState<Spot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [types, setTypes] = useState<TacoType[]>([]);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<TacoType | null>(null);
  const [area, setArea] = useState(AREAS[0]);
  const [areaPicker, setAreaPicker] = useState(false);
  const [mode, setMode] = useState<"lista" | "mapa">("lista");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { session } = useAuth();

  const loadTypes = useCallback(async () => {
    try {
      const response = await fetch(`${API}/taco-types`);
      if (!response.ok) return;
      const data = (await response.json()) as { items: TacoType[] };
      setTypes(data.items);
    } catch {
      /* Search and browsing remain available when types cannot load. */
    }
  }, []);

  const load = useCallback(
    async (
      q = query,
      selectedType = activeType,
      selectedArea = area,
      cursor?: string,
      append = false,
    ) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      if (!append) setNextCursor(null);
      try {
        const bounds = clipAreaToApiCoverage(selectedArea);
        if (!bounds) {
          setItems([]);
          setError(
            "Esta zona queda fuera de la cobertura disponible. Elige una zona de Monterrey y su área metropolitana.",
          );
          return;
        }
        const params = new URLSearchParams({
          limit: "30",
          north: String(bounds.north),
          south: String(bounds.south),
          east: String(bounds.east),
          west: String(bounds.west),
        });
        if (q.trim()) params.set("q", q.trim());
        if (selectedType) params.set("tacoType", selectedType.slug);
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`${API}/spots?${params}`);
        if (!response.ok) throw new Error("No se pudo cargar la búsqueda.");
        const page = (await response.json()) as Page;
        setItems((current) => (append ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch {
        setError("No hay conexión con Taco Hunt. Puedes reintentar cuando vuelva la señal.");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [activeType, area, query],
  );

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);
  useEffect(() => {
    void load("", null, AREAS[0]);
  }, []);

  const locate = async () => {
    setLocating(true);
    try {
      // Permission and coordinates are requested only after the user's explicit tap.
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Sin permiso de ubicación. Puedes elegir una zona manualmente.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      if (
        latitude < API_COVERAGE.south ||
        latitude > API_COVERAGE.north ||
        longitude < API_COVERAGE.west ||
        longitude > API_COVERAGE.east
      ) {
        setError(
          "Tu ubicación está fuera de la cobertura de Monterrey y su área metropolitana. Puedes elegir una zona manualmente.",
        );
        return;
      }
      const areaAtLocation = clipAreaToApiCoverage({
        label: "Cerca de ti",
        north: latitude + 0.08,
        south: latitude - 0.08,
        east: longitude + 0.1,
        west: longitude - 0.1,
      });
      if (!areaAtLocation) {
        setError(
          "No hay cobertura disponible cerca de tu ubicación. Puedes elegir una zona manualmente.",
        );
        return;
      }
      setArea(areaAtLocation);
      await load(query, activeType, areaAtLocation);
    } catch {
      setError("No pudimos obtener tu ubicación. Elige una zona para seguir explorando.");
    } finally {
      setLocating(false);
    }
  };

  const mapRegion = useMemo<Region>(() => {
    const latitude = items.length
      ? items.reduce((total, item) => total + item.latitude, 0) / items.length
      : (area.north + area.south) / 2;
    const longitude = items.length
      ? items.reduce((total, item) => total + item.longitude, 0) / items.length
      : (area.east + area.west) / 2;
    return {
      latitude,
      longitude,
      latitudeDelta: Math.max(0.045, area.north - area.south),
      longitudeDelta: Math.max(0.05, area.east - area.west),
    };
  }, [items, area]);

  const chooseType = (type: TacoType | null) => {
    setActiveType(type);
    void load(query, type, area);
  };
  const chooseArea = (next: Area) => {
    setArea(next);
    setAreaPicker(false);
    void load(query, activeType, next);
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={mode === "lista" ? items : []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor={colors.red}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <Text style={styles.kicker}>MONTERREY · NUEVO LEÓN</Text>
              <Link href="/settings" style={styles.accountLink}>
                {session ? "Mi cuenta" : "Entrar"}
              </Link>
            </View>
            <Text style={styles.title}>¿Qué se te antoja hoy?</Text>
            <Text style={styles.subtitle}>Encuentra tu próximo taco favorito.</Text>
            <Link href="/propose" style={styles.proposeLink}>
              ¿No encuentras tu taquería? Propónla
            </Link>
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => void load()}
              placeholder="Busca un puesto o una colonia"
              placeholderTextColor="#8A7A6E"
              returnKeyType="search"
              style={styles.search}
              accessibilityLabel="Buscar puesto o colonia"
            />
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void locate()}
                style={styles.locationButton}
              >
                <Text style={styles.locationText}>
                  {locating ? "Buscando…" : "⌖  Usar mi ubicación"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: areaPicker }}
                onPress={() => setAreaPicker((open) => !open)}
                style={styles.areaButton}
              >
                <Text style={styles.areaText}>⌄ {area.label}</Text>
              </Pressable>
            </View>
            {areaPicker && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.areaOptions}
              >
                {AREAS.map((option) => (
                  <Pressable
                    key={option.label}
                    onPress={() => chooseArea(option)}
                    style={[styles.areaChip, area.label === option.label && styles.selectedChip]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        area.label === option.label && styles.selectedChipText,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Text style={styles.filterLabel}>SE TE ANTOJA</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeRow}
              contentContainerStyle={{ gap: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !activeType }}
                onPress={() => chooseType(null)}
                style={[styles.typeChip, !activeType && styles.selectedChip]}
              >
                <Text style={[styles.chipText, !activeType && styles.selectedChipText]}>Todos</Text>
              </Pressable>
              {types.map((type) => (
                <Pressable
                  key={type.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeType?.id === type.id }}
                  onPress={() => chooseType(activeType?.id === type.id ? null : type)}
                  style={[styles.typeChip, activeType?.id === type.id && styles.selectedChip]}
                >
                  <Text
                    style={[styles.chipText, activeType?.id === type.id && styles.selectedChipText]}
                  >
                    {type.nameEs}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Puestos para descubrir</Text>
              <Text style={styles.count}>{items.length} lugares</Text>
            </View>
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "lista" }}
                onPress={() => setMode("lista")}
                style={[styles.modeButton, mode === "lista" && styles.modeSelected]}
              >
                <Text style={[styles.modeText, mode === "lista" && styles.modeSelectedText]}>
                  ☷ Lista
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "mapa" }}
                onPress={() => setMode("mapa")}
                style={[styles.modeButton, mode === "mapa" && styles.modeSelected]}
              >
                <Text style={[styles.modeText, mode === "mapa" && styles.modeSelectedText]}>
                  ⌖ Mapa
                </Text>
              </Pressable>
            </View>
            {mode === "mapa" && !error && !loading && items.length > 0 && (
              <View accessibilityLabel="Mapa de puestos" style={styles.map}>
                <MapView
                  provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                  style={StyleSheet.absoluteFill}
                  initialRegion={mapRegion}
                  region={mapRegion}
                  accessibilityLabel="Mapa de puestos en la zona seleccionada"
                  showsUserLocation={false}
                >
                  {items.map((item) => (
                    <Marker
                      key={item.id}
                      coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                      title={item.name}
                      description={item.neighborhood}
                      onCalloutPress={() =>
                        router.push({ pathname: "/spot/[id]", params: { id: item.id } } as Href)
                      }
                    />
                  ))}
                </MapView>
                <Text style={styles.mapCaption}>
                  Toca un marcador para ver el puesto · {items.length} puestos
                </Text>
              </View>
            )}
            {!loading && !error && mode === "mapa" && items.length === 0 && (
              <View
                accessibilityLabel="Sin puestos para mostrar en el mapa"
                style={styles.mapEmpty}
              >
                <Text style={styles.mapEmptyIcon}>⌖</Text>
                <Text style={styles.mapEmptyTitle}>Todavía no hay puestos en el mapa</Text>
                <Text style={styles.muted}>
                  Prueba otra zona o quita el filtro de taco para ver más lugares.
                </Text>
              </View>
            )}
            {loading && <ActivityIndicator color={colors.red} style={{ marginTop: 28 }} />}
            {!loading && error ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void load()}
                style={styles.empty}
              >
                <Text style={styles.emptyTitle}>Sin conexión</Text>
                <Text style={styles.muted}>{error} Toca para reintentar.</Text>
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          mode === "lista" && !loading && !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aún no hay puestos en esta búsqueda</Text>
              <Text style={styles.muted}>Prueba con otra colonia o vuelve más tarde.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          !loading && !error && nextCursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingMore}
              onPress={() => void load(query, activeType, area, nextCursor, true)}
              style={styles.loadMore}
            >
              <Text style={styles.loadMoreText}>
                {loadingMore ? "Cargando…" : "Ver más puestos"}
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <Link
            href={{ pathname: "/spot/[id]", params: { id: item.id } } as unknown as Href}
            asChild
          >
            <Pressable accessibilityRole="link" style={styles.card}>
              <View style={styles.taco}>
                <Text style={{ fontSize: 25 }}>🌮</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.muted}>{item.neighborhood}</Text>
                <Text style={styles.meta}>
                  {item.bestTaco
                    ? `${item.bestTaco.name} · ${item.bestTaco.score === null ? "Sin reseñas" : `${item.bestTaco.score.toFixed(1)} ★`}`
                    : "Tacos por descubrir"}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  listContent: { paddingHorizontal: 22, paddingTop: 60, paddingBottom: 36 },
  headerRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountLink: { color: colors.green, fontSize: 13, fontWeight: "900", paddingVertical: 10 },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: {
    marginTop: 11,
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: { color: colors.muted, marginTop: 6, fontSize: 15 },
  proposeLink: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 12,
    marginBottom: 4,
  },
  search: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 15,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    height: 52,
    color: colors.ink,
    fontSize: 15,
  },
  controls: { flexDirection: "row", gap: 9, marginTop: 11 },
  locationButton: {
    backgroundColor: colors.green,
    borderRadius: 13,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  locationText: { color: "white", fontWeight: "800", fontSize: 12 },
  areaButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  areaText: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  areaOptions: { marginTop: 9, maxHeight: 50 },
  areaChip: {
    marginRight: 8,
    paddingHorizontal: 13,
    height: 44,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
  },
  filterLabel: {
    marginTop: 20,
    marginBottom: 9,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  typeRow: { maxHeight: 50 },
  typeChip: {
    paddingHorizontal: 14,
    height: 44,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
  },
  chipText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  selectedChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  selectedChipText: { color: "white" },
  sectionRow: {
    marginTop: 23,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  count: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  modeRow: {
    flexDirection: "row",
    padding: 3,
    backgroundColor: "#EFE4D5",
    borderRadius: 12,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  modeSelected: { backgroundColor: colors.paper },
  modeText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  modeSelectedText: { color: colors.ink },
  card: {
    minHeight: 91,
    padding: 13,
    marginBottom: 10,
    borderRadius: 18,
    borderColor: "#E8DCCB",
    borderWidth: 1,
    backgroundColor: colors.paper,
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
  },
  taco: {
    width: 57,
    height: 57,
    borderRadius: 15,
    backgroundColor: "#F9DEAE",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 19 },
  meta: { color: colors.green, fontSize: 12, fontWeight: "700", marginTop: 5 },
  arrow: { color: colors.muted, fontSize: 23, paddingHorizontal: 4, fontWeight: "800" },
  empty: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: colors.paper,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16, textAlign: "center" },
  map: {
    height: 245,
    borderRadius: 18,
    backgroundColor: "#E8E6D7",
    overflow: "hidden",
    marginBottom: 11,
  },
  mapEmpty: {
    height: 245,
    marginBottom: 11,
    padding: 24,
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapEmptyIcon: { color: colors.red, fontSize: 42, fontWeight: "800" },
  mapEmptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 5,
  },
  mapCaption: {
    position: "absolute",
    bottom: 9,
    left: 12,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: colors.paper,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  loadMore: {
    minHeight: 44,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 13,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: { color: "white", fontWeight: "800", fontSize: 13 },
});
