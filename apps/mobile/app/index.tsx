import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { Link, type Href, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/provider";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { colors, spacing, radii, sizes, elevation, typography } from "@/theme";
import { Chip } from "@/components/Chip";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { Avatar } from "@/components/Avatar";
import { getFixtureUser } from "@/data/auth";

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
type Review = {
  id: string;
  body: string;
  score?: number;
  createdAt?: string;
  author?: string;
};
type SpotDetail = {
  id: string;
  name: string;
  neighborhood: string;
  tacos?: Taco[];
  reviews?: Review[];
};
type Page = { items: Spot[]; nextCursor: string | null };
type Area = { label: string; north: number; south: number; east: number; west: number };
// Mirrors packages/contracts/src/index.ts's mapPinSchema/mapClusterSchema (T33's
// GET /v1/spots/map), duplicated locally the same way Spot/Taco/Review are above —
// this app doesn't import @taco-hunt/contracts.
type MapPin = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  bestTaco: string | null;
};
type MapCluster = {
  count: number;
  latitude: number;
  longitude: number;
  bounds: { north: number; south: number; east: number; west: number };
};
type MapPinsResponse = { pins: MapPin[]; clusters: MapCluster[] };
const API_COVERAGE = { north: 27, south: 25, east: -99, west: -101.5 };
const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
const AREAS: Area[] = [
  { label: "Monterrey", north: 25.78, south: 25.6, east: -100.2, west: -100.4 },
  { label: "San Pedro", north: 25.72, south: 25.62, east: -100.3, west: -100.45 },
  { label: "San Nicolás", north: 25.8, south: 25.7, east: -100.2, west: -100.32 },
  { label: "Guadalupe", north: 25.72, south: 25.62, east: -100.15, west: -100.27 },
  { label: "Apodaca", north: 25.82, south: 25.72, east: -100.08, west: -100.23 },
];
function clipAreaToApiCoverage(area: Area): Area | null {
  const north = Math.min(API_COVERAGE.north, area.north);
  const south = Math.max(API_COVERAGE.south, area.south);
  const east = Math.min(API_COVERAGE.east, area.east);
  const west = Math.max(API_COVERAGE.west, area.west);
  if (south >= north || west >= east) return null;
  return { ...area, north, south, east, west };
}
function areaToRegion(area: Area): Region {
  return {
    latitude: (area.north + area.south) / 2,
    longitude: (area.east + area.west) / 2,
    latitudeDelta: Math.max(0.045, area.north - area.south),
    longitudeDelta: Math.max(0.05, area.east - area.west),
  };
}
// Fetches a bit more than the visible viewport so panning slightly doesn't
// immediately reveal an edge with no pins loaded yet.
function regionToViewportBounds(region: Region, marginFactor = 0.25): Area | null {
  const latMargin = region.latitudeDelta * marginFactor;
  const lonMargin = region.longitudeDelta * marginFactor;
  return clipAreaToApiCoverage({
    label: "",
    north: region.latitude + region.latitudeDelta / 2 + latMargin,
    south: region.latitude - region.latitudeDelta / 2 - latMargin,
    east: region.longitude + region.longitudeDelta / 2 + lonMargin,
    west: region.longitude - region.longitudeDelta / 2 - lonMargin,
  });
}

export default function ExploreScreen() {
  const [items, setItems] = useState<Spot[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [types, setTypes] = useState<TacoType[]>([]);
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<TacoType | null>(null);
  const [area, setArea] = useState(AREAS[0]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<"lista" | "mapa">("mapa");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SpotDetail | null>(null);
  const [spotLoading, setSpotLoading] = useState(false);
  const [spotError, setSpotError] = useState("");
  const router = useRouter();
  const { clearFilterAt } = useLocalSearchParams<{ clearFilterAt?: string }>();
  const { session } = useAuth();
  const spotCacheRef = useRef<Map<string, SpotDetail>>(new Map());
  const sheetAnimRef = useRef(new Animated.Value(0)).current;
  const selectedSpotIdRef = useRef<string | null>(null);
  const closingRef = useRef(false);

  // Viewport pin loading (T34): id-keyed cache of pins seen so far, so panning
  // the map merges new pins in instead of replacing everything on screen.
  const [mapPins, setMapPins] = useState<MapPin[]>([]);
  const [mapClusters, setMapClusters] = useState<MapCluster[]>([]);
  const [mapPinsLoading, setMapPinsLoading] = useState(true);
  const [mapPinsError, setMapPinsError] = useState("");
  const mapPinsCacheRef = useRef<Map<string, MapPin>>(new Map());
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<Region | null>(null);
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapFetchSeqRef = useRef(0);
  const activeTypeRef = useRef<TacoType | null>(null);

  // Keep refs synchronized with current state to avoid closure issues in async callbacks
  useEffect(() => {
    selectedSpotIdRef.current = selectedSpotId;
  }, [selectedSpotId]);
  useEffect(() => {
    activeTypeRef.current = activeType;
  }, [activeType]);

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
      if (mode === "mapa") {
        animateCameraToArea(areaAtLocation);
      } else {
        await load(query, activeType, areaAtLocation);
      }
    } catch {
      setError("No pudimos obtener tu ubicación. Elige una zona para seguir explorando.");
    } finally {
      setLocating(false);
    }
  };

  // Initial camera only — once the map is interactive, panning/zooming is
  // uncontrolled and viewport pins follow via onRegionChangeComplete below.
  const mapRegion = useMemo<Region>(() => areaToRegion(area), [area]);

  const fetchMapPins = useCallback(async (region: Region) => {
    const bounds = regionToViewportBounds(region);
    const seq = ++mapFetchSeqRef.current;
    if (!bounds) {
      setMapPinsError("Esta zona queda fuera de la cobertura disponible.");
      setMapPinsLoading(false);
      return;
    }
    setMapPinsLoading(true);
    setMapPinsError("");
    try {
      const params = new URLSearchParams({
        north: String(bounds.north),
        south: String(bounds.south),
        east: String(bounds.east),
        west: String(bounds.west),
      });
      const type = activeTypeRef.current;
      if (type) params.set("tacoType", type.slug);
      const response = await fetch(`${API}/spots/map?${params}`);
      if (!response.ok) throw new Error("No se pudo cargar el mapa.");
      const data = (await response.json()) as MapPinsResponse;
      // A newer fetch (later pan/zoom or filter change) already landed; drop this one.
      if (seq !== mapFetchSeqRef.current) return;
      const cache = mapPinsCacheRef.current;
      for (const pin of data.pins) cache.set(pin.id, pin);
      setMapPins(Array.from(cache.values()));
      setMapClusters(data.clusters);
    } catch {
      if (seq === mapFetchSeqRef.current) {
        setMapPinsError("No hay conexión con Taco Hunt. Puedes reintentar cuando vuelva la señal.");
      }
    } finally {
      if (seq === mapFetchSeqRef.current) setMapPinsLoading(false);
    }
  }, []);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      currentRegionRef.current = region;
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = setTimeout(() => {
        void fetchMapPins(region);
      }, 300);
    },
    [fetchMapPins],
  );

  useEffect(() => {
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    };
  }, []);

  // Taco-type is the only filter allowed to hide map pins (per CLAUDE.md T34 spec).
  // The cache was built under the previous filter, so it's invalidated here rather
  // than merged, and the viewport is re-fetched under the new one.
  useEffect(() => {
    if (mode !== "mapa") return;
    mapPinsCacheRef.current = new Map();
    setMapPins([]);
    setMapClusters([]);
    void fetchMapPins(currentRegionRef.current ?? mapRegion);
    // mapRegion intentionally excluded: it should only seed the very first fetch,
    // not re-trigger when `area` changes list-mode state while map mode is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeType, fetchMapPins]);

  // Neighborhood/area chips are camera shortcuts only in map mode — they move the
  // camera and let onRegionChangeComplete load pins for the new viewport, they
  // never filter the loaded pin set directly.
  const animateCameraToArea = useCallback((next: Area) => {
    mapRef.current?.animateToRegion(areaToRegion(next), 400);
  }, []);

  const handleClusterPress = useCallback((cluster: MapCluster) => {
    const { north, south, east, west } = cluster.bounds;
    mapRef.current?.animateToRegion(
      {
        latitude: (north + south) / 2,
        longitude: (east + west) / 2,
        latitudeDelta: Math.max(0.01, (north - south) * 1.4),
        longitudeDelta: Math.max(0.01, (east - west) * 1.4),
      },
      350,
    );
  }, []);

  const chooseType = (type: TacoType | null) => {
    setActiveType(type);
    void load(query, type, area);
  };
  useEffect(() => {
    if (clearFilterAt) chooseType(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearFilterAt]);
  const chooseArea = (next: Area) => {
    setArea(next);
    if (mode === "mapa") {
      animateCameraToArea(next);
    } else {
      void load(query, activeType, next);
    }
  };
  const clearFilters = () => {
    setQuery("");
    setActiveType(null);
    void load("", null, area);
  };

  const handleMarkerPress = useCallback(async (spotId: string) => {
    setSelectedSpotId(spotId);
    selectedSpotIdRef.current = spotId;
    setSelectedSpot(null);
    setSpotError("");
    setSpotLoading(true);

    // Start opening animation immediately
    Animated.timing(sheetAnimRef, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start();

    const cached = spotCacheRef.current.get(spotId);
    if (cached) {
      setSelectedSpot(cached);
      setSpotLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API}/spots/${encodeURIComponent(spotId)}`);
      if (!response.ok) throw new Error("Failed to fetch spot");
      const spot = (await response.json()) as SpotDetail;

      // Only update state if this spot is still the selected one (prevent stale responses)
      if (selectedSpotIdRef.current === spotId) {
        spotCacheRef.current.set(spotId, spot);
        setSelectedSpot(spot);
      }
    } catch {
      // Only show error if this spot is still the selected one
      if (selectedSpotIdRef.current === spotId) {
        setSpotError("No se pudo cargar la información del puesto. Intenta de nuevo.");
      }
    } finally {
      // Only clear loading if this spot is still the selected one
      if (selectedSpotIdRef.current === spotId) {
        setSpotLoading(false);
      }
    }
  }, []);

  const closeSheet = useCallback((): boolean => {
    // Guard against re-entrance: if already closing, reject this request
    if (closingRef.current) {
      return false;
    }

    closingRef.current = true;
    const closingSpotId = selectedSpotIdRef.current;
    Animated.timing(sheetAnimRef, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start(({ finished }) => {
      try {
        // Only clear state if animation finished and this spot is still being closed
        // (i.e., the user hasn't selected a different marker during the animation)
        if (finished && selectedSpotIdRef.current === closingSpotId) {
          setSelectedSpotId(null);
          setSelectedSpot(null);
          setSpotError("");
        }
      } finally {
        // Always reset the closing guard when animation completes
        closingRef.current = false;
      }
    });

    return true;
  }, []);

  const CustomMarkerContent = ({ hasReviews }: { hasReviews: boolean }) => (
    <View style={styles.markerWrap}>
      <View style={styles.marker}>
        <Text style={{ fontSize: 24 }}>🌮</Text>
      </View>
      {!hasReviews && (
        <View style={styles.markerSparkle} accessibilityLabel="Sin reseñas todavía">
          <Ionicons name="sparkles" size={12} color={colors.paper} />
        </View>
      )}
    </View>
  );

  const modeToggle = (
    <View style={styles.modeRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "lista" }}
        onPress={() => setMode("lista")}
        style={[styles.modeButton, mode === "lista" && styles.modeSelected]}
      >
        <Ionicons
          name="list"
          size={14}
          color={mode === "lista" ? colors.ink : colors.muted}
          style={styles.icon}
        />
        <Text style={[styles.modeText, mode === "lista" && styles.modeSelectedText]}>Lista</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "mapa" }}
        onPress={() => setMode("mapa")}
        style={[styles.modeButton, mode === "mapa" && styles.modeSelected]}
      >
        <Ionicons
          name="map"
          size={14}
          color={mode === "mapa" ? colors.ink : colors.muted}
          style={styles.icon}
        />
        <Text style={[styles.modeText, mode === "mapa" && styles.modeSelectedText]}>Mapa</Text>
      </Pressable>
    </View>
  );

  const filterCount = activeType ? 1 : 0;

  const searchPill = (
    <View style={styles.searchPill}>
      <Pressable
        style={styles.searchPillTouchArea}
        accessibilityRole="button"
        accessibilityLabel="Buscar puesto o colonia"
        onPress={() =>
          router.push({
            pathname: "/search",
            params: activeType ? { tacoType: activeType.nameEs } : {},
          })
        }
      >
        <Ionicons name="search" size={18} color={colors.muted} />
        <Text
          style={[styles.searchPillPlaceholder, !query && { color: colors.placeholder }]}
          numberOfLines={1}
        >
          {query || "Busca un puesto o colonia"}
        </Text>
      </Pressable>
      <View style={styles.pillDivider} />
      <IconButton
        icon="options-outline"
        label="Filtros"
        size={36}
        color={colors.ink}
        badge={filterCount}
        accessibilityState={{ expanded: panelOpen }}
        onPress={() => setPanelOpen((open) => !open)}
      />
    </View>
  );

  const profileButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={session ? "Mi cuenta" : "Entrar"}
      style={styles.profileButton}
      onPress={() => router.push("/settings")}
    >
      {session ? (
        <Avatar size={40} preset={getFixtureUser().avatarPreset} />
      ) : (
        <Ionicons name="person" size={22} color={colors.ink} />
      )}
    </Pressable>
  );

  const renderSummaryRow = (count: number) => (
    <View style={styles.summaryRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir filtros. Zona: ${area.label}`}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={styles.summaryChip}
        onPress={() => setPanelOpen(true)}
      >
        <Text style={styles.summaryChipText} numberOfLines={1}>
          {area.label}
          {activeType ? ` · ${activeType.nameEs}` : ""}
        </Text>
        <Ionicons name="chevron-down" size={12} color={colors.ink} />
      </Pressable>
      <View style={styles.countPill}>
        <Text style={styles.countPillText}>{count} puestos</Text>
      </View>
    </View>
  );
  const mapPinTotal = mapPins.length + mapClusters.reduce((total, c) => total + c.count, 0);

  const filterPanel = panelOpen && (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Cerrar filtros"
        onPress={() => setPanelOpen(false)}
      />
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void load()}
            placeholder="Busca un puesto o colonia"
            placeholderTextColor={colors.placeholder}
            returnKeyType="search"
            style={styles.panelSearchInput}
            accessibilityLabel="Buscar puesto o colonia"
          />
          <IconButton
            icon="chevron-up"
            label="Cerrar filtros"
            onPress={() => setPanelOpen(false)}
          />
        </View>
        <Text style={styles.panelSectionLabel}>Zona</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.panelChipRow}
        >
          <Chip
            label={locating ? "Buscando…" : "Cerca de mí"}
            icon="navigate"
            selected={area.label === "Cerca de ti"}
            onPress={() => void locate()}
          />
          {AREAS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={area.label === option.label}
              onPress={() => chooseArea(option)}
            />
          ))}
        </ScrollView>
        <Text style={styles.panelSectionLabel}>Tipo de taco</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.panelChipRow}
        >
          <Chip label="Todos" selected={!activeType} onPress={() => chooseType(null)} />
          {types.map((type) => (
            <Chip
              key={type.id}
              label={type.nameEs}
              selected={activeType?.id === type.id}
              onPress={() => chooseType(activeType?.id === type.id ? null : type)}
            />
          ))}
        </ScrollView>
        <Text style={styles.panelSectionLabel}>Ver como</Text>
        {modeToggle}
        <View style={styles.panelFooter}>
          <Button label="Limpiar" variant="ghost" onPress={clearFilters} style={{ flex: 1 }} />
          <Button
            label={`Ver ${items.length} puestos`}
            variant="primary"
            onPress={() => setPanelOpen(false)}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </>
  );

  if (mode === "mapa") {
    return (
      <View style={styles.screen}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          onRegionChangeComplete={handleRegionChangeComplete}
          accessibilityLabel="Mapa de puestos en la zona seleccionada"
          showsUserLocation={false}
        >
          {mapPins.map((pin) => (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              accessibilityLabel={`${pin.name}, ${pin.neighborhood}`}
              onPress={() => void handleMarkerPress(pin.id)}
            >
              {/* MapPin has no reviewCount (see packages/contracts mapPinSchema), so the
                  "sin reseñas" sparkle badge from the fixture-era marker isn't shown here;
                  flagged as a gap in the PR. */}
              <CustomMarkerContent hasReviews />
            </Marker>
          ))}
          {mapClusters.map((cluster, index) => (
            <Marker
              key={`cluster-${index}-${cluster.latitude.toFixed(4)}-${cluster.longitude.toFixed(4)}`}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              accessibilityLabel={`${cluster.count} puestos agrupados`}
              onPress={() => handleClusterPress(cluster)}
            >
              <View style={styles.clusterBubble}>
                <Text style={styles.clusterBubbleText}>{cluster.count}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <View style={styles.collapsedRow}>
            {searchPill}
            {profileButton}
          </View>
          {renderSummaryRow(mapPinTotal)}
          {filterPanel}
        </View>
        <View style={styles.bottomControls} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            style={styles.listPill}
            onPress={() => setMode("lista")}
          >
            <Ionicons name="list" size={16} color={colors.ink} style={styles.icon} />
            <Text style={styles.listPillText}>Lista</Text>
          </Pressable>
          <View style={styles.bottomRightControls}>
            <IconButton
              icon="navigate"
              label={locating ? "Buscando ubicación…" : "Usar mi ubicación"}
              size={sizes.locateButton}
              elevated
              onPress={() => void locate()}
            />
            <Pressable
              accessibilityRole="button"
              style={[styles.addButton, selectedSpotId && styles.addButtonCompact]}
              onPress={() => router.push("/propose")}
            >
              <Ionicons name="add" size={22} color={colors.paper} />
              {!selectedSpotId && <Text style={styles.addButtonText}>Agregar taquería</Text>}
            </Pressable>
          </View>
        </View>
        {mapPinsLoading && mapPinTotal === 0 && (
          <View style={styles.mapCenterState} pointerEvents="none">
            <ActivityIndicator color={colors.red} />
          </View>
        )}
        {!mapPinsLoading && mapPinsError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void fetchMapPins(currentRegionRef.current ?? mapRegion)}
            style={styles.mapErrorCard}
          >
            <Text style={styles.emptyTitle}>Sin conexión</Text>
            <Text style={styles.muted}>{mapPinsError} Toca para reintentar.</Text>
          </Pressable>
        ) : null}
        {!mapPinsLoading && !mapPinsError && mapPinTotal === 0 && (
          <View accessibilityLabel="Sin puestos para mostrar en el mapa" style={styles.mapEmpty}>
            <Ionicons name="location-outline" size={42} color={colors.red} />
            <Text style={styles.mapEmptyTitle}>Todavía no hay puestos en el mapa</Text>
            <Text style={styles.muted}>
              Prueba otra zona o quita el filtro de taco para ver más lugares.
            </Text>
          </View>
        )}
        {selectedSpotId && (
          <Animated.View
            style={[
              styles.bottomSheet,
              {
                transform: [
                  {
                    translateY: sheetAnimRef.interpolate({
                      inputRange: [0, 1],
                      outputRange: [500, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Card style={styles.previewCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewTitle}>{selectedSpot?.name}</Text>
                  <Text style={styles.previewNeighborhood}>{selectedSpot?.neighborhood}</Text>
                </View>
                <Pressable
                  onPress={() => closeSheet()}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar tarjeta"
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>

              {spotLoading ? (
                <View style={{ marginTop: spacing.md, alignItems: "center" }}>
                  <ActivityIndicator color={colors.red} />
                </View>
              ) : spotError ? (
                <Text style={[styles.previewError, { marginTop: spacing.md }]}>{spotError}</Text>
              ) : selectedSpot ? (
                <>
                  {(() => {
                    const spotFromList = items.find((i) => i.id === selectedSpotId);
                    // Fallback: if spot is not in current items list, derive best taco from selectedSpot.tacos
                    const bestTaco =
                      spotFromList?.bestTaco ||
                      selectedSpot?.tacos?.reduce((best, current) => {
                        if (!best) return current;
                        // Treat null/undefined score as lowest (never rank first)
                        const bestScore = best.score ?? -Infinity;
                        const currentScore = current.score ?? -Infinity;
                        return currentScore > bestScore ? current : best;
                      });

                    return bestTaco ? (
                      <View style={{ marginTop: spacing.md }}>
                        <Text style={styles.previewLabel}>Mejor taco</Text>
                        <Text style={styles.previewTaco}>
                          {bestTaco.name} ·{" "}
                          {bestTaco.score === null
                            ? "Sin reseñas"
                            : `${bestTaco.score.toFixed(1)} ★`}
                        </Text>
                      </View>
                    ) : null;
                  })()}

                  {selectedSpot.reviews && selectedSpot.reviews.length > 0 && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.previewLabel}>Reseña reciente</Text>
                      <Text style={styles.previewReview} numberOfLines={3}>
                        {selectedSpot.reviews[0].body}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => {
                      if (closeSheet()) {
                        router.push({
                          pathname: "/spot/[id]",
                          params: { id: selectedSpotId },
                        } as Href);
                      }
                    }}
                    style={styles.previewViewButton}
                  >
                    <Text style={styles.previewViewText}>Ver puesto completo</Text>
                  </Pressable>
                </>
              ) : null}
            </Card>
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
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
              {profileButton}
            </View>
            <Text style={styles.title}>¿Qué se te antoja hoy?</Text>
            <Text style={styles.subtitle}>Encuentra tu próximo taco favorito.</Text>
            <Link href="/propose" style={styles.proposeLink}>
              ¿No encuentras tu taquería? Propónla
            </Link>
            <View style={{ marginTop: spacing.lg }}>{searchPill}</View>
            {renderSummaryRow(items.length)}
            {filterPanel}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Puestos para descubrir</Text>
              <Text style={styles.count}>{items.length} lugares</Text>
            </View>
            {modeToggle}
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
          !loading && !error ? (
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
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
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
  icon: { marginRight: 6 },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: sizes.headerPill,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    gap: spacing.sm,
    ...elevation.float,
  },
  searchPillInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
  },
  searchPillTouchArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: "100%",
  },
  searchPillPlaceholder: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
  },
  pillDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.line,
  },
  profileButton: {
    width: sizes.headerPill,
    height: sizes.headerPill,
    borderRadius: sizes.headerPill / 2,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...elevation.float,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryChipText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  countPill: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: { color: colors.paper, fontWeight: "800", fontSize: 12 },
  panel: {
    marginTop: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomLeftRadius: radii.sheet,
    borderBottomRightRadius: radii.sheet,
    padding: spacing.lg,
    ...elevation.float,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  panelSearchInput: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 14,
  },
  panelSectionLabel: {
    ...typography.label,
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  panelChipRow: { gap: 8 },
  panelFooter: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  bottomControls: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  listPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    ...elevation.float,
  },
  listPillText: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  bottomRightControls: {
    alignItems: "flex-end",
    gap: spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: sizes.fab,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.redStrong,
    ...elevation.float,
  },
  addButtonCompact: {
    width: sizes.fab,
    paddingHorizontal: 0,
    justifyContent: "center",
  },
  addButtonText: { color: colors.paper, fontWeight: "800", fontSize: 13 },
  markerWrap: { width: 44, height: 44 },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  clusterBubble: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 22,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.paper,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  clusterBubbleText: { color: colors.white, fontWeight: "800", fontSize: 14 },
  markerSparkle: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.paper,
  },
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
    backgroundColor: colors.segmentTrack,
    borderRadius: 12,
    marginBottom: 12,
    marginTop: 12,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
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
    borderColor: colors.line,
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
    backgroundColor: colors.tacoTile,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 19 },
  meta: { color: colors.green, fontSize: 12, fontWeight: "700", marginTop: 5 },
  empty: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: colors.paper,
    padding: 20,
    alignItems: "center",
  },
  emptyTitle: { color: colors.ink, fontWeight: "800", fontSize: 16, textAlign: "center" },
  mapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  mapCenterState: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  mapErrorCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    borderRadius: 18,
    backgroundColor: colors.paper,
    padding: 20,
    alignItems: "center",
  },
  mapEmpty: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    padding: 24,
    borderRadius: 18,
    backgroundColor: colors.paper,
    borderColor: colors.lineSoft,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapEmptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 5,
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
  loadMoreText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  previewCard: {
    marginHorizontal: 0,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  previewNeighborhood: {
    color: colors.muted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  previewLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  previewTaco: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  previewReview: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  previewError: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: "600",
  },
  previewViewButton: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  previewViewText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
  },
});
