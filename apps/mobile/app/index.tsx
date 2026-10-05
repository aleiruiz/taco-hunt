import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
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
import TacoHuntTaco from "@/assets/taco-hunt-taco.svg";
import { useAuth } from "@/auth/provider";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { colors, spacing, radii, sizes, elevation, typography } from "@/theme";
import { placeCountLabel } from "@/lib/format";
import { Chip } from "@/components/Chip";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { Avatar } from "@/components/Avatar";
import { AccountSidebar } from "@/components/AccountSidebar";
import { getProfile, type AvatarPreset } from "@/data/profile-api";
import { listSpotPhotos } from "@/features/spotPhotos/api";
import {
  getFixtureMapDiscovery,
  MAP_DISCOVERY_ATTRIBUTION,
  type GoogleDiscoveryResult,
  type MapDiscoverySnapshot,
  type TacoHuntProposalPin,
} from "@/data/map-discovery";

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
  googlePlaceId?: string;
  photoUrl?: string | null;
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
type GooglePlaceDetailsResponse = {
  state: "ready" | "unavailable";
  details?: { photoName?: string };
};
const API_COVERAGE = { north: 27, south: 25, east: -99, west: -101.5 };
const LOCAL_MAP_DELTA = 0.02;
const DEFAULT_MAP_REGION: Region = {
  latitude: 25.6866,
  longitude: -100.3161,
  latitudeDelta: LOCAL_MAP_DELTA,
  longitudeDelta: LOCAL_MAP_DELTA,
};
// Follow the platform defaults from the build spec: Apple Maps on iOS and
// Google Maps on Android. An environment override keeps local/device testing
// explicit without requiring a native Google Maps key on iOS.
const configuredMapProvider = process.env.EXPO_PUBLIC_MAPS_PROVIDER?.trim().toLowerCase();
const MAP_PROVIDER =
  configuredMapProvider === "apple"
    ? undefined
    : configuredMapProvider === "google" || Platform.OS === "android"
      ? PROVIDER_GOOGLE
      : undefined;
const API =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:3001/v1" : "http://localhost:3001/v1");
const AREAS: Area[] = [
  { label: "Monterrey", north: 25.78, south: 25.6, east: -100.2, west: -100.4 },
  { label: "San Pedro", north: 25.72, south: 25.62, east: -100.3, west: -100.45 },
  { label: "San Nicolás", north: 25.8, south: 25.7, east: -100.2, west: -100.32 },
  { label: "Guadalupe", north: 25.72, south: 25.62, east: -100.15, west: -100.27 },
  { label: "Apodaca", north: 25.82, south: 25.72, east: -100.08, west: -100.23 },
];

async function getGoogleFallbackPhotoUrl(placeId: string): Promise<string | null> {
  try {
    const response = await fetch(`${API}/places/${encodeURIComponent(placeId)}/details`);
    if (!response.ok) return null;
    const data = (await response.json()) as GooglePlaceDetailsResponse;
    return data.details?.photoName
      ? `${API}/places/photo?name=${encodeURIComponent(data.details.photoName)}`
      : null;
  } catch {
    return null;
  }
}
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

type MarkerPressHandler = (id: string) => void | Promise<void>;

const CustomMarkerContent = memo(function CustomMarkerContent() {
  return (
    <View collapsable={false} style={styles.markerWrap}>
      <View style={styles.marker}>
        <TacoHuntTaco width={24} height={18} />
      </View>
    </View>
  );
});

const TacoMapMarker = memo(function TacoMapMarker({
  pin,
  onPress,
}: {
  pin: MapPin;
  onPress: MarkerPressHandler;
}) {
  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      accessibilityLabel={`${pin.name}, ${pin.neighborhood}`}
      onPress={() => void onPress(pin.id)}
      tracksViewChanges={false}
    >
      <CustomMarkerContent />
    </Marker>
  );
});

const ClusterMapMarker = memo(
  function ClusterMapMarker({
    cluster,
    onPress,
  }: {
    cluster: MapCluster;
    onPress: (cluster: MapCluster) => void;
  }) {
    return (
      <Marker
        coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
        accessibilityLabel={`${cluster.count} puestos agrupados`}
        onPress={() => onPress(cluster)}
        tracksViewChanges={false}
      >
        <View style={styles.clusterBubble}>
          <Text style={styles.clusterBubbleText}>{cluster.count}</Text>
        </View>
      </Marker>
    );
  },
  (previous, next) =>
    previous.cluster.count === next.cluster.count &&
    previous.cluster.latitude === next.cluster.latitude &&
    previous.cluster.longitude === next.cluster.longitude &&
    previous.cluster.bounds.north === next.cluster.bounds.north &&
    previous.cluster.bounds.south === next.cluster.bounds.south &&
    previous.cluster.bounds.east === next.cluster.bounds.east &&
    previous.cluster.bounds.west === next.cluster.bounds.west &&
    previous.onPress === next.onPress,
);

const GoogleMapMarker = memo(function GoogleMapMarker({
  result,
  onPress,
}: {
  result: GoogleDiscoveryResult;
  onPress: (result: GoogleDiscoveryResult) => void;
}) {
  return (
    <Marker
      coordinate={{ latitude: result.latitude, longitude: result.longitude }}
      accessibilityLabel={`${result.attributionLabel}: ${result.name}, ${result.neighborhood}`}
      onPress={() => onPress(result)}
      tracksViewChanges={false}
    >
      <View
        collapsable={false}
        style={styles.googleMarker}
        accessibilityLabel={`${result.attributionLabel}: ${result.name}`}
      >
        <TacoHuntTaco width={24} height={18} />
      </View>
    </Marker>
  );
});

const ProposalMapMarker = memo(function ProposalMapMarker({
  proposal,
  onPress,
}: {
  proposal: TacoHuntProposalPin;
  onPress: (proposal: TacoHuntProposalPin) => void;
}) {
  return (
    <Marker
      coordinate={{ latitude: proposal.latitude, longitude: proposal.longitude }}
      accessibilityLabel={`${proposal.ownershipLabel}: ${proposal.name}, ${proposal.neighborhood}, en revisión`}
      onPress={() => onPress(proposal)}
      tracksViewChanges={false}
    >
      <View
        style={styles.proposalMarker}
        accessibilityLabel={`${proposal.ownershipLabel}: ${proposal.name}`}
      >
        <TacoHuntTaco width={24} height={18} />
      </View>
    </Marker>
  );
});

/**
 * Picks the taco a map preview highlights and rates: the list's best taco when the
 * detail still has it, otherwise the best-scored approved taco in the detail.
 */
function pickPreviewTaco(spot: SpotDetail, listBest: Taco | null | undefined): Taco | undefined {
  const tacos = spot.tacos ?? [];
  const listMatch = listBest ? tacos.find((taco) => taco.id === listBest.id) : undefined;
  if (listMatch) return listMatch;
  return tacos.reduce<Taco | undefined>((best, current) => {
    if (!best) return current;
    return (current.score ?? -Infinity) > (best.score ?? -Infinity) ? current : best;
  }, undefined);
}

const MapPreviewCard = ({
  title,
  neighborhood,
  kicker,
  detail,
  photoUrl,
  primaryLabel,
  primaryIcon,
  onPrimary,
  onOpen,
  onClose,
  children,
}: {
  title: string;
  neighborhood: string;
  kicker: string;
  detail?: string;
  photoUrl?: string | null;
  primaryLabel?: string;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  onPrimary?: () => void;
  /** When set, the secondary action opens the full stand page instead of closing the card. */
  onOpen?: () => void;
  onClose: () => void;
  children?: ReactNode;
}) => (
  <Card style={styles.mapPreviewCard}>
    {photoUrl ? (
      <Image
        source={{ uri: photoUrl }}
        style={styles.mapPreviewImage}
        resizeMode="cover"
        accessibilityLabel={`Foto de ${title}`}
      />
    ) : (
      <View style={styles.mapPreviewImageFallback} accessibilityLabel="Foto no disponible">
        <TacoHuntTaco width={48} height={36} />
      </View>
    )}
    <View style={styles.mapPreviewBody}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.mapPreviewKicker}>{kicker}</Text>
          <Text style={styles.previewTitle}>{title}</Text>
          <Text style={styles.previewNeighborhood}>{neighborhood}</Text>
        </View>
        <IconButton icon="close" label="Cerrar tarjeta" size={32} onPress={onClose} />
      </View>
      {detail ? <Text style={styles.mapPreviewDetail}>{detail}</Text> : null}
      {children}
      <View style={styles.mapPreviewActions}>
        {onPrimary && primaryLabel ? (
          <Button
            label={primaryLabel}
            variant="accent"
            icon={primaryIcon}
            onPress={onPrimary}
            style={styles.mapPreviewAction}
          />
        ) : null}
        <Button
          label={onOpen ? "Ver puesto" : "Cerrar"}
          variant="secondary"
          onPress={onOpen ?? onClose}
          style={styles.mapPreviewAction}
        />
      </View>
    </View>
  </Card>
);

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
  const previewTaco = selectedSpot
    ? pickPreviewTaco(selectedSpot, items.find((item) => item.id === selectedSpotId)?.bestTaco)
    : undefined;
  const router = useRouter();
  const { clearFilterAt } = useLocalSearchParams<{ clearFilterAt?: string }>();
  const { session, signOut } = useAuth();
  const [headerAvatarPreset, setHeaderAvatarPreset] = useState<AvatarPreset>("pastor");
  const [headerAvatarPhotoUrl, setHeaderAvatarPhotoUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountSidebarOpen, setAccountSidebarOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setHeaderAvatarPreset("pastor");
    setHeaderAvatarPhotoUrl(null);
    setIsAdmin(false);
    if (!session) return () => undefined;
    getProfile(session)
      .then((profile) => {
        if (cancelled) return;
        setHeaderAvatarPreset(profile.avatarPreset);
        setHeaderAvatarPhotoUrl(profile.avatarPhotoUrl);
        setIsAdmin(profile.role === "admin");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);
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
  const [mapDiscovery, setMapDiscovery] = useState<MapDiscoverySnapshot>({
    state: "empty",
    googleResults: [],
    localProposals: [],
    attribution: MAP_DISCOVERY_ATTRIBUTION,
  });
  const [mapDiscoveryLoading, setMapDiscoveryLoading] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<TacoHuntProposalPin | null>(null);
  const [selectedGoogleResult, setSelectedGoogleResult] = useState<GoogleDiscoveryResult | null>(
    null,
  );
  const mapPinsCacheRef = useRef<Map<string, MapPin>>(new Map());
  const mapGoogleResultsCacheRef = useRef<Map<string, GoogleDiscoveryResult>>(new Map());
  const mapProposalCacheRef = useRef<Map<string, TacoHuntProposalPin>>(new Map());
  const mapRef = useRef<MapView>(null);
  const currentRegionRef = useRef<Region | null>(null);
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapFetchSeqRef = useRef(0);
  const mapDiscoveryFetchSeqRef = useRef(0);
  const initialMapDiscoveryRequestedRef = useRef(false);
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
        mapRef.current?.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: LOCAL_MAP_DELTA,
            longitudeDelta: LOCAL_MAP_DELTA,
          },
          400,
        );
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
  const mapRegion = useMemo<Region>(
    () => (area.label === "Monterrey" ? DEFAULT_MAP_REGION : areaToRegion(area)),
    [area],
  );

  // Do not prompt for location on launch. If the user has already granted
  // permission, center the first viewport on their last known position; new
  // users keep the compact Monterrey fallback until they tap "Mi ubicación".
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (cancelled) return;
      const { latitude, longitude } = position.coords;
      if (
        latitude < API_COVERAGE.south ||
        latitude > API_COVERAGE.north ||
        longitude < API_COVERAGE.west ||
        longitude > API_COVERAGE.east
      ) {
        return;
      }
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: LOCAL_MAP_DELTA,
          longitudeDelta: LOCAL_MAP_DELTA,
        },
        350,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      // A pin cached from an earlier, more zoomed-in fetch can fall inside a
      // cluster returned by a later, zoomed-out one; exclude it so it isn't
      // rendered (and counted) alongside its cluster.
      const inCluster = (pin: MapPin) =>
        data.clusters.some(
          ({ bounds }) =>
            pin.latitude <= bounds.north &&
            pin.latitude >= bounds.south &&
            pin.longitude <= bounds.east &&
            pin.longitude >= bounds.west,
        );
      setMapPins(Array.from(cache.values()).filter((pin) => !inCluster(pin)));
      setMapClusters(data.clusters);
    } catch {
      if (seq === mapFetchSeqRef.current) {
        setMapPinsError("No hay conexión con Taco Hunt. Puedes reintentar cuando vuelva la señal.");
      }
    } finally {
      if (seq === mapFetchSeqRef.current) setMapPinsLoading(false);
    }
  }, []);

  const fetchMapDiscovery = useCallback(async (region: Region) => {
    const bounds = regionToViewportBounds(region);
    const seq = ++mapDiscoveryFetchSeqRef.current;
    setSelectedProposal(null);
    if (!bounds) {
      setMapDiscoveryLoading(false);
      setMapDiscovery((current) => ({
        ...current,
        state: "unavailable",
        message: "La búsqueda de Google no está disponible en esta zona.",
      }));
      return;
    }
    setMapDiscoveryLoading(true);
    // Keep the current markers visible while the next viewport is loading.
    // Clearing them here makes every pan unmount and remount their native icon views.
    setMapDiscovery((current) => ({ ...current, message: "Buscando lugares cercanos…" }));
    try {
      const snapshot = await getFixtureMapDiscovery(bounds);
      if (seq === mapDiscoveryFetchSeqRef.current) {
        const googleResultsCache = mapGoogleResultsCacheRef.current;
        const proposalCache = mapProposalCacheRef.current;
        for (const result of snapshot.googleResults) googleResultsCache.set(result.id, result);
        for (const proposal of snapshot.localProposals) proposalCache.set(proposal.id, proposal);
        setMapDiscovery({
          ...snapshot,
          // Keep every place discovered during this session mounted while new
          // viewport results are added to the caches.
          googleResults: Array.from(googleResultsCache.values()),
          localProposals: Array.from(proposalCache.values()),
        });
        setMapDiscoveryLoading(false);
      }
    } catch {
      if (seq === mapDiscoveryFetchSeqRef.current) {
        setMapDiscoveryLoading(false);
        setMapDiscovery((current) => ({
          ...current,
          state: "error",
          message: "No pudimos actualizar los resultados de Google.",
        }));
      }
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
    const region = currentRegionRef.current ?? mapRegion;
    void fetchMapPins(region);
    if (!initialMapDiscoveryRequestedRef.current) {
      initialMapDiscoveryRequestedRef.current = true;
      void fetchMapDiscovery(region);
    }
    // mapRegion intentionally excluded: it should only seed the very first fetch,
    // not re-trigger when `area` changes list-mode state while map mode is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeType, fetchMapDiscovery, fetchMapPins]);

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
  const searchPlacesInCurrentArea = useCallback(() => {
    void fetchMapDiscovery(currentRegionRef.current ?? mapRegion);
  }, [fetchMapDiscovery, mapRegion]);

  const handleMarkerPress = useCallback(async (spotId: string) => {
    setSelectedGoogleResult(null);
    setSelectedProposal(null);
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
      const [response, photos] = await Promise.all([
        fetch(`${API}/spots/${encodeURIComponent(spotId)}`),
        listSpotPhotos(spotId).catch(() => []),
      ]);
      if (!response.ok) throw new Error("Failed to fetch spot");
      const spotPayload = (await response.json()) as SpotDetail;
      const tacoHuntPhotoUrl = photos[0]?.url ?? null;
      const googlePhotoUrl =
        !tacoHuntPhotoUrl && spotPayload.googlePlaceId
          ? await getGoogleFallbackPhotoUrl(spotPayload.googlePlaceId)
          : null;
      const spot = {
        ...spotPayload,
        photoUrl: tacoHuntPhotoUrl ?? googlePhotoUrl,
      };

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

  const handleProposalPress = useCallback((proposal: TacoHuntProposalPin) => {
    setSelectedGoogleResult(null);
    setSelectedProposal(proposal);
    setSelectedSpotId(null);
    selectedSpotIdRef.current = null;
  }, []);

  const handleGoogleMarkerPress = useCallback((result: GoogleDiscoveryResult) => {
    setSelectedSpotId(null);
    selectedSpotIdRef.current = null;
    setSelectedProposal(null);
    setSelectedGoogleResult(result);
  }, []);

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
      onPress={() => setAccountSidebarOpen(true)}
    >
      {session ? (
        <Avatar
          size={40}
          preset={headerAvatarPreset}
          photoUrl={headerAvatarPhotoUrl ?? undefined}
        />
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
        <Text style={styles.countPillText}>{placeCountLabel(count)}</Text>
      </View>
    </View>
  );
  const mapPinTotal = mapPins.length + mapClusters.reduce((total, c) => total + c.count, 0);
  // Google results and pending proposals carry no taco types, so a taco filter cannot
  // match them: hide them instead of implying they sell the selected taco.
  const shownGoogleResults = activeType ? [] : mapDiscovery.googleResults;
  const shownLocalProposals = activeType ? [] : mapDiscovery.localProposals;
  const hiddenForTacoFilter = activeType
    ? mapDiscovery.googleResults.length + mapDiscovery.localProposals.length
    : 0;
  const visiblePlaceTotal = mapPinTotal + shownGoogleResults.length + shownLocalProposals.length;
  const discoveryError =
    !mapDiscoveryLoading &&
    (mapDiscovery.state === "unavailable" ||
      mapDiscovery.state === "offline" ||
      mapDiscovery.state === "error") ? (
      <View style={styles.discoveryError} accessibilityLiveRegion="polite">
        <Text style={styles.discoveryErrorText}>
          {mapDiscovery.message ?? "No pudimos actualizar los lugares cercanos."}
        </Text>
        <Button
          label="Reintentar"
          variant="ghost"
          icon="refresh"
          accessibilityLabel="Reintentar búsqueda de Google"
          onPress={() => void fetchMapDiscovery(currentRegionRef.current ?? mapRegion)}
        />
      </View>
    ) : null;

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
            label={`Ver ${placeCountLabel(mode === "mapa" ? visiblePlaceTotal : items.length)}`}
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
          provider={MAP_PROVIDER}
          style={StyleSheet.absoluteFill}
          initialRegion={mapRegion}
          onRegionChangeComplete={handleRegionChangeComplete}
          accessibilityLabel="Mapa de puestos en la zona seleccionada"
          showsUserLocation={false}
        >
          {mapPins.map((pin) => (
            <TacoMapMarker key={pin.id} pin={pin} onPress={handleMarkerPress} />
          ))}
          {mapClusters.map((cluster, index) => (
            <ClusterMapMarker
              key={`cluster-${index}-${cluster.latitude.toFixed(4)}-${cluster.longitude.toFixed(4)}-${cluster.count}`}
              cluster={cluster}
              onPress={handleClusterPress}
            />
          ))}
          {shownGoogleResults.map((result) => (
            <GoogleMapMarker key={result.id} result={result} onPress={handleGoogleMarkerPress} />
          ))}
          {shownLocalProposals.map((proposal) => (
            <ProposalMapMarker
              key={proposal.id}
              proposal={proposal}
              onPress={handleProposalPress}
            />
          ))}
        </MapView>
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <View style={styles.collapsedRow}>
            {searchPill}
            {profileButton}
          </View>
          {renderSummaryRow(visiblePlaceTotal)}
          {hiddenForTacoFilter > 0 && !panelOpen ? (
            <Text style={styles.filterNote} accessibilityLiveRegion="polite">
              Con el filtro de {activeType?.nameEs} solo mostramos puestos de Taco Hunt que lo
              venden.
            </Text>
          ) : null}
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
            {/* Google results stay hidden under a taco filter, so searching would show nothing. */}
            {activeType ? null : (
              <Button
                label="Buscar taquerías aquí"
                variant="secondary"
                icon="search"
                loading={mapDiscoveryLoading}
                onPress={searchPlacesInCurrentArea}
                style={styles.mapDiscoveryButton}
              />
            )}
            <IconButton
              icon="navigate"
              label={locating ? "Buscando ubicación…" : "Usar mi ubicación"}
              size={sizes.locateButton}
              elevated
              onPress={() => void locate()}
            />
            <Pressable
              accessibilityRole="button"
              style={[
                styles.addButton,
                (selectedSpotId || selectedGoogleResult) && styles.addButtonCompact,
              ]}
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
        {discoveryError}
        {selectedProposal ? (
          <View style={styles.proposalDetailOverlay}>
            <MapPreviewCard
              title={selectedProposal.name}
              neighborhood={selectedProposal.neighborhood}
              kicker="Propuesta de Taco Hunt"
              detail="En revisión por Taco Hunt"
              photoUrl={selectedProposal.photoUrl}
              onClose={() => setSelectedProposal(null)}
            />
          </View>
        ) : null}
        {selectedGoogleResult ? (
          <View style={styles.googlePreviewSheet}>
            <MapPreviewCard
              title={selectedGoogleResult.name}
              neighborhood={selectedGoogleResult.neighborhood}
              kicker="Lugar encontrado en Google Maps"
              detail="Califica sus tacos y lo registraremos automáticamente en Taco Hunt."
              photoUrl={selectedGoogleResult.photoUrl}
              primaryLabel="Calificar tacos"
              primaryIcon="star-outline"
              onPrimary={() => {
                router.push({
                  pathname: "/review/new",
                  params: {
                    googlePlaceId: selectedGoogleResult.id,
                    spotName: selectedGoogleResult.name,
                  },
                });
                setSelectedGoogleResult(null);
              }}
              onClose={() => setSelectedGoogleResult(null)}
            />
          </View>
        ) : null}
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
            <MapPreviewCard
              title={selectedSpot?.name ?? "Cargando puesto…"}
              neighborhood={selectedSpot?.neighborhood ?? ""}
              kicker="Puesto en Taco Hunt"
              photoUrl={selectedSpot?.photoUrl}
              primaryLabel={previewTaco ? `Calificar ${previewTaco.name}` : undefined}
              primaryIcon="star-outline"
              onPrimary={() => {
                if (!previewTaco || !selectedSpot || !selectedSpotId) return;
                if (closeSheet()) {
                  router.push({
                    pathname: "/review/new",
                    params: {
                      spotTacoId: previewTaco.id,
                      spotName: selectedSpot.name,
                      tacoName: previewTaco.name,
                    },
                  } as Href);
                }
              }}
              onOpen={
                selectedSpotId
                  ? () => {
                      const spotId = selectedSpotId;
                      if (closeSheet()) router.push(`/spot/${spotId}` as Href);
                    }
                  : undefined
              }
              onClose={() => closeSheet()}
            >
              {spotLoading ? (
                <View style={{ marginTop: spacing.md, alignItems: "center" }}>
                  <ActivityIndicator color={colors.red} />
                </View>
              ) : spotError ? (
                <Text style={[styles.previewError, { marginTop: spacing.md }]}>{spotError}</Text>
              ) : selectedSpot ? (
                <>
                  {previewTaco ? (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.previewLabel}>Mejor taco</Text>
                      <Text style={styles.previewTaco}>
                        {previewTaco.name} ·{" "}
                        {previewTaco.score === null
                          ? "Sin reseñas"
                          : `${previewTaco.score.toFixed(1)} ★`}
                      </Text>
                    </View>
                  ) : null}

                  {selectedSpot.reviews && selectedSpot.reviews.length > 0 && (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={styles.previewLabel}>Reseña reciente</Text>
                      <Text style={styles.previewReview} numberOfLines={3}>
                        {selectedSpot.reviews[0].body}
                      </Text>
                    </View>
                  )}
                </>
              ) : null}
            </MapPreviewCard>
          </Animated.View>
        )}
        <AccountSidebar
          visible={accountSidebarOpen}
          signedIn={Boolean(session)}
          email={session?.user.email ?? undefined}
          isAdmin={isAdmin}
          avatarPreset={headerAvatarPreset}
          avatarPhotoUrl={headerAvatarPhotoUrl}
          onClose={() => setAccountSidebarOpen(false)}
          onNavigate={(path) => router.push(path as Href)}
          onSignOut={() => void signOut()}
        />
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
                <TacoHuntTaco width={24} height={18} />
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
      <AccountSidebar
        visible={accountSidebarOpen}
        signedIn={Boolean(session)}
        email={session?.user.email ?? undefined}
        isAdmin={isAdmin}
        avatarPreset={headerAvatarPreset}
        avatarPhotoUrl={headerAvatarPhotoUrl}
        onClose={() => setAccountSidebarOpen(false)}
        onNavigate={(path) => router.push(path as Href)}
        onSignOut={() => void signOut()}
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
  filterNote: {
    ...typography.caption,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.paper,
    color: colors.ink,
    overflow: "hidden",
  },
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
  mapDiscoveryButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    ...elevation.float,
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
  googleMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.float,
  },
  proposalMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.float,
  },
  markerWrap: { width: 44, height: 44 },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.red,
    borderWidth: 3,
    borderColor: colors.paper,
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
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.paper,
    shadowColor: colors.ink,
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
  discoveryCard: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg + sizes.locateButton + spacing.md + sizes.fab + spacing.md,
    padding: spacing.md,
    ...elevation.float,
  },
  discoveryError: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg + sizes.locateButton + spacing.md + sizes.fab + spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.dangerText,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...elevation.float,
  },
  discoveryErrorText: { flex: 1, color: colors.dangerText, fontSize: 12, lineHeight: 17 },
  discoveryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  discoveryHeadingIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  discoveryTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  discoveryMessage: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  discoveryLegendRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  discoveryLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  googleLegendDot: { backgroundColor: colors.green },
  proposalLegendDot: {
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: colors.pendingText,
  },
  discoveryLegendText: {
    flex: 1,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  discoveryLegendCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  discoverySourceLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  discoverySourceLinkText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
  },
  discoveryRetry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  proposalDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  proposalDetailOverlay: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg + sizes.locateButton + spacing.md + sizes.fab + spacing.md,
  },
  mapErrorCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 260,
    borderRadius: 18,
    backgroundColor: colors.paper,
    padding: 20,
    alignItems: "center",
  },
  mapEmpty: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 260,
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
  mapPreviewCard: {
    padding: 0,
    overflow: "hidden",
    ...elevation.sheet,
  },
  mapPreviewImage: {
    width: "100%",
    height: 116,
    backgroundColor: colors.tacoTile,
  },
  mapPreviewImageFallback: {
    height: 116,
    backgroundColor: colors.tacoTile,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPreviewBody: {
    padding: spacing.md,
  },
  mapPreviewKicker: {
    ...typography.kicker,
    color: colors.redStrong,
    marginBottom: spacing.xs,
  },
  mapPreviewDetail: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  mapPreviewActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mapPreviewAction: {
    flex: 1,
  },
  googlePreviewSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  googlePreviewSource: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  googlePreviewButton: { marginTop: spacing.md },
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
