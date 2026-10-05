import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/provider";
import { listFavorites, setFavorite } from "@/features/contributions/api";
import { createReport, ReportConflictError, type ReportReason } from "@/features/reports/api";
import {
  createTacoProposal,
  listMyTacoProposals,
  listTacoTypes,
  TacoProposalConflictError,
  type TacoProposal,
  type TacoType,
} from "@/features/proposals/api";
import { openDirections as openMapDirections } from "@/lib/directions";
import {
  createFixtureTacoHuntPhoto,
  getFixtureGooglePlaceDetails,
  getFixtureTacoHuntPhotoGallery,
  type GooglePlaceDetails,
  type TacoHuntPhoto,
} from "@/data/stand-details";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { PhotoTile } from "@/components/PhotoTile";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { Toast } from "@/components/Toast";
import { colors, radii, spacing, typography } from "@/theme";

type PhotoKind = "tacos" | "puesto" | "menu";
const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  tacos: "Tacos",
  puesto: "El puesto",
  menu: "Menú y precios",
};

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
  const [tacoTypes, setTacoTypes] = useState<TacoType[]>([]);
  const [tacoTypesLoading, setTacoTypesLoading] = useState(true);
  const [tacoTypesError, setTacoTypesError] = useState(false);
  const [myTacoProposals, setMyTacoProposals] = useState<TacoProposal[]>([]);
  const [proposalsOwnerId, setProposalsOwnerId] = useState<string | null>(null);
  const [tacoModalOpen, setTacoModalOpen] = useState(false);
  const [selectedTacoTypeId, setSelectedTacoTypeId] = useState<string | null>(null);
  const [tacoDisplayName, setTacoDisplayName] = useState("");
  const [tacoSubmitting, setTacoSubmitting] = useState(false);
  const [tacoError, setTacoError] = useState("");
  const proposalRequestId = useRef(0);
  const currentUserId = useRef<string | null>(session?.user.id ?? null);
  currentUserId.current = session?.user.id ?? null;
  const proposalsOwner = useRef<string | null>(null);
  const tacoSubmissionId = useRef(0);
  const [approvedPhotos, setApprovedPhotos] = useState<TacoHuntPhoto[]>([]);
  const [myPhotos, setMyPhotos] = useState<TacoHuntPhoto[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [googleDetails, setGoogleDetails] = useState<GooglePlaceDetails | null>(null);
  const [googleDetailsState, setGoogleDetailsState] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const [googleDetailsMessage, setGoogleDetailsMessage] = useState("");
  const googleRequestId = useRef(0);
  const loadRequestId = useRef(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadAsset, setUploadAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadKind, setUploadKind] = useState<PhotoKind>("tacos");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Guards against a session change (sign-out/sign-in) leaking the previous
  // identity's in-flight upload into the new one: close any open upload sheet
  // and clear local pending photos so visibleMyPhotos (already scoped by
  // uploaderId) has nothing stale to filter through.
  useEffect(() => {
    setUploadOpen(false);
    setUploadBusy(false);
    setMyPhotos([]);
  }, [session?.user.id]);
  useEffect(() => {
    googleRequestId.current += 1;
    setGoogleDetails(null);
    setGoogleDetailsState("idle");
    setGoogleDetailsMessage("");
    return () => {
      googleRequestId.current += 1;
    };
  }, [id]);
  const loadTacoTypes = useCallback(() => {
    setTacoTypesLoading(true);
    setTacoTypesError(false);
    void listTacoTypes()
      .then(setTacoTypes)
      .catch(() => setTacoTypesError(true))
      .finally(() => setTacoTypesLoading(false));
  }, []);
  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/spots/${encodeURIComponent(id)}`);
      if (loadRequestId.current !== requestId) return;
      if (response.status === 404) {
        setError("missing");
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      const data = (await response.json()) as Spot;
      if (loadRequestId.current !== requestId) return;
      setSpot(data);
      const fixture = await getFixtureTacoHuntPhotoGallery(
        data.id,
        data.name,
        session?.user.id ?? "user-123",
      );
      if (loadRequestId.current !== requestId) return;
      setApprovedPhotos(fixture.approved);
      setMyPhotos(fixture.mine);
    } catch {
      if (loadRequestId.current !== requestId) return;
      setError("offline");
    } finally {
      if (loadRequestId.current === requestId) setLoading(false);
    }
  }, [id, session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadGoogleDetails() {
    const requestId = ++googleRequestId.current;
    setGoogleDetailsState("loading");
    setGoogleDetailsMessage("");
    try {
      const result = await getFixtureGooglePlaceDetails(id);
      if (googleRequestId.current !== requestId) return;
      setGoogleDetails(result.details ?? null);
      setGoogleDetailsState(result.state);
      setGoogleDetailsMessage(result.message ?? "");
    } catch {
      if (googleRequestId.current !== requestId) return;
      setGoogleDetails(null);
      setGoogleDetailsState("error");
      setGoogleDetailsMessage("No pudimos actualizar los datos de Google.");
    }
  }

  function openGoogleSource(url: string) {
    void Linking.openURL(url).catch(() => {
      Alert.alert("No se pudo abrir Google Maps", "Intenta de nuevo más tarde.");
    });
  }

  useFocusEffect(
    useCallback(() => {
      const requestId = ++proposalRequestId.current;
      if (!session || !id) {
        proposalsOwner.current = null;
        setProposalsOwnerId(null);
        setMyTacoProposals([]);
        return undefined;
      }
      const userId = session.user.id;
      if (proposalsOwner.current !== userId) {
        proposalsOwner.current = null;
        setProposalsOwnerId(null);
        setMyTacoProposals([]);
      }
      void listFavorites(session)
        .then(({ items }) => setFavoriteState(items.some((item) => item.id === id)))
        .catch(() => undefined);
      void listMyTacoProposals(session)
        .then((proposals) => {
          if (proposalRequestId.current !== requestId || currentUserId.current !== userId) return;
          proposalsOwner.current = userId;
          setProposalsOwnerId(userId);
          setMyTacoProposals(proposals.filter((item) => item.spotId === id));
        })
        .catch(() => undefined);
      return () => {
        proposalRequestId.current += 1;
      };
    }, [id, session]),
  );
  useEffect(() => {
    loadTacoTypes();
  }, [loadTacoTypes]);
  async function toggleFavorite() {
    if (!session) {
      router.push("/sign-in");
      return;
    }
    setFavoriteBusy(true);
    try {
      await setFavorite(session, id, !favorite);
      setFavoriteState((current) => !current);
    } catch {
      Alert.alert("No pudimos actualizar tus favoritos", "Inténtalo de nuevo en un momento.");
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
  function openUpload() {
    if (!session) {
      router.push("/sign-in");
      return;
    }
    setUploadAsset(null);
    setUploadKind("tacos");
    setUploadError("");
    setUploadProgress(0);
    setUploadOpen(true);
  }
  function closeUpload() {
    setUploadBusy(false);
    setUploadOpen(false);
  }
  async function pickUploadPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    const result = permission.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setUploadAsset(result.assets[0]);
    setUploadError("");
  }
  async function submitUpload() {
    if (!uploadAsset || !spot || !session) return;
    const uploaderId = session.user.id;
    const targetSpot = spot;
    const asset = uploadAsset;
    setUploadBusy(true);
    setUploadError("");
    setUploadProgress(30);
    try {
      const created = await createFixtureTacoHuntPhoto(
        targetSpot.id,
        targetSpot.name,
        uploaderId,
        asset.uri,
        uploadKind,
      );
      setUploadProgress(100);
      // A sign-out/sign-in during the upload already reset local state (see
      // the session-change effect above); don't resurrect a photo under the
      // new identity.
      if (currentUserId.current !== uploaderId) return;
      setMyPhotos((current) => [created, ...current]);
      setUploadBusy(false);
      setUploadOpen(false);
      setToast("Foto enviada… un moderador la revisa antes de publicarla.");
      AccessibilityInfo.announceForAccessibility(
        "Foto enviada, un moderador la revisa antes de publicarla.",
      );
    } catch (error) {
      setUploadBusy(false);
      setUploadProgress(0);
      setUploadError(
        error instanceof Error ? error.message : "No pudimos subir la foto. Inténtalo de nuevo.",
      );
    }
  }
  function openTacoModal() {
    if (!session) {
      router.push("/sign-in");
      return;
    }
    setSelectedTacoTypeId(null);
    setTacoDisplayName("");
    setTacoError("");
    setTacoModalOpen(true);
  }
  function closeTacoModal() {
    tacoSubmissionId.current += 1;
    setTacoSubmitting(false);
    setTacoModalOpen(false);
  }
  async function submitTacoProposal() {
    if (!session || !selectedTacoTypeId || !spot) return;
    const submissionId = ++tacoSubmissionId.current;
    const proposalContextId = proposalRequestId.current;
    const proposalUserId = session.user.id;
    const selectedType = tacoTypes.find((type) => type.id === selectedTacoTypeId);
    setTacoSubmitting(true);
    setTacoError("");
    try {
      const created = await createTacoProposal(session, {
        spotId: spot.id,
        tacoTypeId: selectedTacoTypeId,
        displayName: tacoDisplayName.trim() || undefined,
      });
      const proposal: TacoProposal = {
        id: created.id,
        spotId: created.spotId,
        spotName: spot.name,
        tacoTypeId: created.tacoTypeId,
        name: created.displayName ?? selectedType?.nameEs ?? "Tipo de taco",
        status: created.status,
        createdAt: created.createdAt,
      };
      if (
        proposalRequestId.current === proposalContextId &&
        currentUserId.current === proposalUserId
      ) {
        setMyTacoProposals((current) => [proposal, ...current]);
      }
      if (tacoSubmissionId.current !== submissionId) return;
      setTacoModalOpen(false);
    } catch (submitError) {
      if (tacoSubmissionId.current !== submissionId) return;
      setTacoError(
        submitError instanceof TacoProposalConflictError
          ? "Ya existe una propuesta o tipo de taco para este puesto."
          : "No se pudo enviar. Lo que llenaste sigue aquí.",
      );
    } finally {
      if (tacoSubmissionId.current === submissionId) setTacoSubmitting(false);
    }
  }
  const visibleMyTacoProposals =
    session && proposalsOwnerId === session.user.id ? myTacoProposals : [];
  const availableTacoTypes = tacoTypes.filter(
    (type) =>
      !spot?.tacos.some((taco) => taco.tacoTypeId === type.id) &&
      !visibleMyTacoProposals.some(
        (proposal) => proposal.tacoTypeId === type.id && proposal.status === "pending",
      ),
  );
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

  // myPhotos is purely local device state (not scoped by any fetch), so a
  // session change without unmounting this screen could otherwise leak the
  // previous user's pending photos into the new user's view.
  const visibleMyPhotos = myPhotos.filter(
    (photo) => photo.spotId === spot?.id && photo.uploaderId === session?.user.id,
  );
  const heroUrl = approvedPhotos[0]?.url;
  const totalScored = spot?.tacos.filter((taco) => taco.score !== null) ?? [];
  const ratingSummary =
    totalScored.length > 0
      ? `${(totalScored.reduce((total, taco) => total + (taco.score ?? 0), 0) / totalScored.length).toFixed(1)} ★ · ${spot?.tacos.reduce((total, taco) => total + taco.reviewCount, 0)} reseñas`
      : null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: spot?.name ?? "Puesto" }} />
        {!spot && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={16} color={colors.green} />
            <Text style={styles.backText}>Volver</Text>
          </Pressable>
        )}
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
              <View style={styles.hero}>
                {heroUrl ? (
                  <Image source={{ uri: heroUrl }} style={StyleSheet.absoluteFill} />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]}>
                    <Ionicons name="camera-outline" size={40} color={colors.muted} />
                  </View>
                )}
                <View style={styles.heroTopRow}>
                  <IconButton
                    icon="chevron-back"
                    label="Volver"
                    elevated
                    onPress={() => router.back()}
                  />
                  <View style={styles.heroTopRight}>
                    <IconButton
                      icon={favorite ? "heart" : "heart-outline"}
                      label={favorite ? "Guardado en favoritos" : "Guardar en favoritos"}
                      color={colors.red}
                      elevated
                      disabled={favoriteBusy}
                      onPress={() => void toggleFavorite()}
                    />
                    <IconButton
                      icon="ellipsis-horizontal"
                      label="Más opciones"
                      elevated
                      onPress={() => setMoreOpen(true)}
                    />
                  </View>
                </View>
                {approvedPhotos.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ver las ${approvedPhotos.length} fotos de Taco Hunt de ${spot.name}`}
                    onPress={() => setGalleryOpen(true)}
                    style={styles.heroCountPill}
                  >
                    <Text style={styles.heroCountText}>
                      1 / {approvedPhotos.length} · Ver todas
                    </Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.kicker}>PUESTO EN MONTERREY</Text>
              <Text style={styles.title}>{spot.name}</Text>
              <Text style={styles.neighborhood}>{spot.neighborhood}</Text>
              {ratingSummary ? <Text style={styles.body}>{ratingSummary}</Text> : null}
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

              <Text style={styles.section}>Datos del puesto</Text>
              <Card style={styles.googleDetailsCard}>
                <View style={styles.googleHeadingRow}>
                  <View style={styles.googleIcon}>
                    <Ionicons name="logo-google" size={18} color={colors.ink} />
                  </View>
                  <View style={styles.googleHeadingCopy}>
                    <Text style={styles.googleTitle}>Detalles de Google</Text>
                    <Text style={styles.googleCaption}>
                      Se consultan al abrirlos y no se guardan como datos de Taco Hunt.
                    </Text>
                  </View>
                </View>
                {googleDetailsState === "idle" && (
                  <Button
                    label="Ver datos actuales de Google"
                    variant="secondary"
                    icon="cloud-download-outline"
                    onPress={() => void loadGoogleDetails()}
                    style={styles.googleAction}
                  />
                )}
                {googleDetailsState === "loading" && (
                  <View style={styles.googleLoading} accessibilityLiveRegion="polite">
                    <ActivityIndicator color={colors.green} />
                    <Text style={styles.body}>Consultando Google…</Text>
                  </View>
                )}
                {(googleDetailsState === "unavailable" || googleDetailsState === "error") && (
                  <View style={styles.googleUnavailable}>
                    <Ionicons
                      name={
                        googleDetailsState === "error"
                          ? "cloud-offline-outline"
                          : "information-circle-outline"
                      }
                      size={20}
                      color={colors.dangerText}
                    />
                    <Text style={styles.googleUnavailableText}>
                      {googleDetailsMessage ||
                        "Los datos de Google no están disponibles por ahora."}
                    </Text>
                    <Button
                      label="Reintentar"
                      variant="secondary"
                      onPress={() => void loadGoogleDetails()}
                      style={styles.googleRetry}
                    />
                  </View>
                )}
                {googleDetailsState === "ready" && googleDetails && (
                  <View style={styles.googleReady}>
                    <Text style={styles.googlePlaceName}>{googleDetails.name}</Text>
                    <Text style={styles.googleAddress}>{googleDetails.address}</Text>
                    <Button
                      label="Abrir en Google Maps"
                      variant="ghost"
                      icon="open-outline"
                      accessibilityRole="link"
                      accessibilityLabel="Abrir este puesto en Google Maps"
                      onPress={() => openGoogleSource(googleDetails.googleMapsUrl)}
                      style={styles.googleSourceLink}
                    />
                    <Text style={styles.googleAttribution}>
                      Fuente: {googleDetails.attributionLabel}. Datos mostrados bajo sus términos.
                    </Text>
                  </View>
                )}
              </Card>

              <Text style={styles.section}>Fotos de Taco Hunt</Text>
              <Text style={styles.photoSourceNote}>
                Fotos subidas por la comunidad y revisadas por Taco Hunt.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoStrip}
              >
                <PhotoTile
                  dashed
                  size={96}
                  accessibilityLabel="Agregar foto"
                  onPress={session ? openUpload : () => router.push("/sign-in")}
                />
                {visibleMyPhotos
                  .filter((photo) => photo.status === "pending")
                  .map((photo) => (
                    <View key={photo.id} style={styles.photoStripItem}>
                      <PhotoTile
                        photoUrl={photo.url}
                        size={96}
                        accessibilityLabel="Tu foto, en revisión. Solo tú la ves."
                      />
                      <View
                        style={[StyleSheet.absoluteFill, styles.pendingVeil]}
                        pointerEvents="none"
                      />
                      <View style={styles.pendingClock} pointerEvents="none">
                        <Ionicons name="time" size={14} color={colors.pendingText} />
                      </View>
                    </View>
                  ))}
                {approvedPhotos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photoUrl={photo.url}
                    size={96}
                    accessibilityLabel={`Foto de ${photo.spotName}, de ${photo.uploaderName}`}
                    onPress={() => setGalleryOpen(true)}
                  />
                ))}
              </ScrollView>
              {visibleMyPhotos.some((photo) => photo.status === "pending") && (
                <Text style={styles.body}>
                  Solo tú ves tu foto mientras la revisa un moderador.
                </Text>
              )}
              {visibleMyPhotos.length > 0 && (
                <View style={styles.myPhotosSection}>
                  <Text style={styles.myPhotosLabel}>MIS FOTOS</Text>
                  {visibleMyPhotos.map((photo) => (
                    <View key={photo.id} style={styles.myPhotoRow}>
                      <PhotoTile photoUrl={photo.url} size={44} accessibilityLabel="Tu foto" />
                      <View style={styles.myPhotoStatus}>
                        <StatusBadge status={photo.status} reason={photo.rejectionReason} />
                        {photo.status === "rejected" && (
                          <Button
                            label="Subir otra"
                            variant="secondary"
                            size="md"
                            onPress={openUpload}
                            style={styles.replacePhotoButton}
                          />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

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
              {visibleMyTacoProposals
                .filter((proposal) => proposal.status !== "approved")
                .map((proposal) => (
                  <View key={proposal.id} style={styles.pendingTacoRow}>
                    <Text style={styles.tacoName}>{proposal.name}</Text>
                    <StatusBadge status={proposal.status} />
                  </View>
                ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="¿Venden otro taco? Agrégalo"
                onPress={openTacoModal}
                style={styles.dashedRow}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.redStrong} />
                <Text style={styles.dashedRowText}>¿Venden otro taco? Agrégalo</Text>
              </Pressable>
            </>
          )
        )}
        <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={closeReport}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Reportar este puesto</Text>
              <Text style={styles.body}>
                Cuéntanos qué está mal. Un reporte no oculta el puesto de inmediato; nuestro equipo
                lo revisa.
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
                placeholderTextColor={colors.placeholder}
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
        <Modal
          visible={tacoModalOpen}
          animationType="slide"
          transparent
          onRequestClose={closeTacoModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Proponer un tipo de taco</Text>
              <Text style={styles.body}>
                Un moderador lo revisa antes de publicarlo en este puesto.
              </Text>
              <View style={styles.reasonRow}>
                {availableTacoTypes.map((type) => (
                  <Chip
                    key={type.id}
                    label={type.nameEs}
                    selected={selectedTacoTypeId === type.id}
                    onPress={() => setSelectedTacoTypeId(type.id)}
                  />
                ))}
                {tacoTypesLoading ? (
                  <ActivityIndicator color={colors.red} />
                ) : tacoTypesError ? (
                  <View>
                    <Text style={styles.body}>No pudimos cargar el catálogo de tacos.</Text>
                    <Button
                      label="Reintentar"
                      variant="secondary"
                      onPress={loadTacoTypes}
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                ) : availableTacoTypes.length === 0 ? (
                  <Text style={styles.body}>
                    {tacoTypes.length === 0
                      ? "Aún no hay tipos de taco en el catálogo."
                      : "Ya hay una propuesta o tipo confirmado para cada tipo del catálogo."}
                  </Text>
                ) : null}
              </View>
              <TextInput
                value={tacoDisplayName}
                onChangeText={setTacoDisplayName}
                placeholder="Nombre en el menú (opcional, ej. Taco de pastor especial)"
                placeholderTextColor={colors.placeholder}
                maxLength={80}
                style={styles.reportNoteInput}
                accessibilityLabel="Nombre en el menú"
              />
              {tacoError ? <Text style={styles.reportError}>{tacoError}</Text> : null}
              <View style={styles.modalActions}>
                <Button
                  label="Cancelar"
                  variant="secondary"
                  onPress={closeTacoModal}
                  style={{ flex: 1 }}
                />
                <Button
                  label={tacoError ? "Reintentar envío" : "Enviar para revisión"}
                  variant="accent"
                  disabled={!selectedTacoTypeId}
                  loading={tacoSubmitting}
                  onPress={() => void submitTacoProposal()}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          visible={moreOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setMoreOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú"
            onPress={() => setMoreOpen(false)}
          >
            <View style={styles.moreSheet}>
              <Button
                label="Reportar este puesto"
                variant="danger"
                icon="flag-outline"
                onPress={() => {
                  setMoreOpen(false);
                  openReport();
                }}
              />
            </View>
          </Pressable>
        </Modal>
        <Modal
          visible={galleryOpen}
          animationType="slide"
          onRequestClose={() => setGalleryOpen(false)}
        >
          <View style={styles.galleryScreen}>
            <View style={styles.galleryHeader}>
              <IconButton
                icon="close"
                label="Cerrar galería"
                onPress={() => setGalleryOpen(false)}
              />
              <Text style={styles.modalTitle}>Fotos de Taco Hunt</Text>
            </View>
            <ScrollView contentContainerStyle={styles.galleryGrid}>
              {approvedPhotos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.url }} style={styles.galleryImage} />
              ))}
            </ScrollView>
          </View>
        </Modal>
        <Modal visible={uploadOpen} animationType="slide" transparent onRequestClose={closeUpload}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Subir una foto</Text>
              <View style={styles.uploadPreviewWrap}>
                <PhotoTile
                  photoUrl={uploadAsset?.uri}
                  dashed={!uploadAsset}
                  size={160}
                  accessibilityLabel={uploadAsset ? "Cambiar foto" : "Elegir foto"}
                  onPress={() => void pickUploadPhoto()}
                />
              </View>
              <Text style={styles.label}>¿Qué muestra?</Text>
              <View style={styles.reasonRow}>
                {(Object.keys(PHOTO_KIND_LABEL) as PhotoKind[]).map((kind) => (
                  <Chip
                    key={kind}
                    label={PHOTO_KIND_LABEL[kind]}
                    selected={uploadKind === kind}
                    onPress={() => setUploadKind(kind)}
                  />
                ))}
              </View>
              <Card tone="dashed" style={styles.uploadRulesCard}>
                <Text style={styles.body}>
                  Enfoca la comida o el puesto. Sin rostros ni placas reconocibles. Solo tus propias
                  fotos.
                </Text>
              </Card>
              {uploadBusy && (
                <View style={styles.uploadProgressWrap}>
                  <ProgressBar progress={uploadProgress} />
                  <Text style={styles.body}>{uploadProgress}%</Text>
                </View>
              )}
              {uploadError ? <Text style={styles.reportError}>{uploadError}</Text> : null}
              <Text style={[styles.body, { marginTop: spacing.md }]}>
                Un moderador la revisa antes de que la vean los demás.
              </Text>
              <View style={styles.modalActions}>
                <Button
                  label="Cancelar"
                  variant="secondary"
                  disabled={uploadBusy}
                  onPress={closeUpload}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Subir foto"
                  variant="accent"
                  disabled={!uploadAsset}
                  loading={uploadBusy}
                  onPress={() => void submitUpload()}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
      {toast && (
        <View style={styles.toastWrap} pointerEvents="box-none">
          <Toast message={toast} variant="success" onDismiss={() => setToast(null)} />
        </View>
      )}
    </View>
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
  hero: {
    height: 290,
    marginHorizontal: -22,
    marginTop: -58,
    marginBottom: spacing.lg,
    backgroundColor: colors.segmentTrack,
    justifyContent: "space-between",
  },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 52,
  },
  heroTopRight: { flexDirection: "row", gap: spacing.xs },
  heroCountPill: {
    alignSelf: "flex-end",
    marginRight: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCountText: { color: colors.paper, fontSize: 12, fontWeight: "800" },
  googleDetailsCard: { marginTop: spacing.sm },
  googleHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  googleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  googleHeadingCopy: { flex: 1 },
  googleTitle: { ...typography.sectionTitle, color: colors.ink },
  googleCaption: { ...typography.caption, color: colors.muted, marginTop: 2, lineHeight: 16 },
  googleAction: { marginTop: spacing.md },
  googleLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 48,
  },
  googleUnavailable: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  googleUnavailableText: { flex: 1, color: colors.dangerText, fontSize: 13, lineHeight: 19 },
  googleRetry: { marginLeft: 28 },
  googleReady: { marginTop: spacing.md },
  googlePlaceName: { color: colors.ink, fontSize: 14, fontWeight: "800", marginBottom: spacing.xs },
  googleAddress: { ...typography.body, color: colors.ink, lineHeight: 21 },
  googleSourceLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  googleSourceLinkText: { color: colors.green, fontSize: 13, fontWeight: "800" },
  googleAttribution: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  photoSourceNote: { ...typography.body, color: colors.muted, marginTop: -spacing.sm },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: spacing.md },
  photoStrip: { gap: spacing.sm, paddingVertical: spacing.xs },
  photoStripItem: { position: "relative" },
  pendingVeil: {
    borderRadius: radii.md,
    backgroundColor: colors.goldSoft,
    opacity: 0.55,
  },
  pendingClock: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  myPhotosSection: { marginTop: spacing.lg },
  myPhotosLabel: {
    ...typography.label,
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  myPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  myPhotoStatus: { flex: 1, gap: spacing.xs },
  replacePhotoButton: { alignSelf: "flex-start" },
  moreSheet: {
    marginTop: "auto",
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
  },
  galleryScreen: { flex: 1, backgroundColor: colors.cream, paddingTop: 56 },
  galleryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  galleryImage: { width: "48%", aspectRatio: 1, borderRadius: radii.md },
  uploadPreviewWrap: { alignItems: "center", marginTop: spacing.sm },
  uploadRulesCard: { marginTop: spacing.md },
  uploadProgressWrap: { marginTop: spacing.md, gap: spacing.xs },
  toastWrap: { position: "absolute", left: 0, right: 0, bottom: spacing.lg },
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
  pendingTacoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.goldSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  dashedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    marginTop: 4,
  },
  dashedRowText: { color: colors.redStrong, fontSize: 13, fontWeight: "700", flex: 1 },
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
