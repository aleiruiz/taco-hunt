import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/auth/provider";
import {
  deleteReview,
  listFavorites,
  listOwnReviews,
  type Favorite,
  type OwnReview,
} from "@/features/contributions/api";
import {
  getProfile,
  updateProfile,
  uploadAvatarPhoto,
  type AvatarPreset,
  type Profile,
} from "@/data/profile-api";
import { getFixtureProgress } from "@/data/progress";
import { AvatarSheet } from "@/features/profile/AvatarSheet";
import { colors, radii, spacing, typography } from "@/theme";
import { Avatar } from "@/components/Avatar";
import { IconButton } from "@/components/IconButton";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";

const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/v1";
type Tab = "favoritos" | "resenas" | "fotos";
type Proposal = { id: string; name: string; neighborhood: string; status: string };

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export default function MyTacosScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();
  const [reviews, setReviews] = useState<OwnReview[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("favoritos");
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const progress = getFixtureProgress();
  const earnedBadges = progress.badges.filter((badge) => badge.earned);
  const nextBadge = progress.badges.find((badge) => !badge.earned);

  useEffect(() => {
    if (requestedTab === "favoritos" || requestedTab === "resenas" || requestedTab === "fotos") {
      setTab(requestedTab);
    }
  }, [requestedTab]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [reviewPage, favoritePage, proposalsResponse, ownProfile] = await Promise.all([
        listOwnReviews(session),
        listFavorites(session),
        fetch(`${API}/me/proposals`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => null),
        // Kept out of the failure path below: a profile fetch failure shouldn't block
        // reviews/favorites/proposals from loading. displayName already falls back to
        // sign-up metadata when profile is null (see below).
        getProfile(session).catch(() => null),
      ]);
      setReviews(reviewPage.items);
      setFavorites(favoritePage.items);
      setProfile(ownProfile);
      if (proposalsResponse?.ok) {
        const data = (await proposalsResponse.json()) as {
          spotProposals: Proposal[];
          tacoProposals: Proposal[];
        };
        setProposals([...data.spotProposals, ...data.tacoProposals]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tu perfil.");
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  async function remove(review: OwnReview) {
    Alert.alert("Eliminar reseña", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () =>
          void (async () => {
            if (!session) return;
            await deleteReview(session, review.id);
            setReviews((items) => items.filter((item) => item.id !== review.id));
          })().catch((cause) =>
            setError(cause instanceof Error ? cause.message : "No pudimos eliminar la reseña."),
          ),
      },
    ]);
  }
  if (!session)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Tu pasaporte empieza aquí</Text>
        <Text style={styles.body}>
          Inicia sesión para guardar favoritos y consultar tus reseñas.
        </Text>
        <Link href="/sign-in" style={styles.primaryText}>
          Iniciar sesión
        </Link>
      </View>
    );

  const isNewProfile = reviews.length === 0 && favorites.length === 0 && proposals.length === 0;
  const memberSince = session.user.created_at ? new Date(session.user.created_at) : null;
  const memberSinceLabel = memberSince
    ? `Cazando tacos desde ${MONTHS_ES[memberSince.getMonth()]} ${memberSince.getFullYear()}`
    : null;
  const pendingProposals = proposals.filter((proposal) => proposal.status === "pending").length;
  // Prefer the persisted profile (T40); fall back to the sign-up metadata (in
  // case the profile hasn't loaded yet) and finally a generic label.
  const displayName =
    profile?.displayName?.trim() ||
    (typeof session.user.user_metadata?.display_name === "string"
      ? session.user.user_metadata.display_name.trim()
      : "") ||
    "Explorador";

  async function saveAvatar(next: {
    preset: AvatarPreset;
    photoUri?: string;
    clearPhoto: boolean;
  }) {
    if (!session) return;
    let avatarPhotoUploadId: string | null | undefined;
    if (next.photoUri) {
      const upload = await uploadAvatarPhoto(session, { uri: next.photoUri });
      avatarPhotoUploadId = upload.id;
    } else if (next.clearPhoto) {
      avatarPhotoUploadId = null;
    }
    const updated = await updateProfile(session, {
      avatarPreset: next.preset,
      ...(avatarPhotoUploadId !== undefined ? { avatarPhotoUploadId } : {}),
    });
    setProfile(updated);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Mi perfil", headerShown: true }} />
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={16} color={colors.green} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
        <IconButton
          icon="settings-outline"
          label="Ajustes"
          onPress={() => router.push("/settings")}
        />
      </View>

      <View style={styles.profileHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mi perfil, ${displayName}. Cambiar foto`}
          onPress={() => setAvatarSheetOpen(true)}
          style={styles.avatarWrap}
        >
          <Avatar
            size={72}
            preset={profile?.avatarPreset ?? "pastor"}
            photoUrl={profile?.avatarPhotoUrl ?? undefined}
          />
          <View style={styles.avatarCameraBadge}>
            <Ionicons name="camera" size={14} color={colors.paper} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{displayName}</Text>
          {memberSinceLabel ? <Text style={styles.body}>{memberSinceLabel}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setAvatarSheetOpen(true)}
            style={styles.editLink}
          >
            <Text style={styles.editLinkText}>Editar</Text>
          </Pressable>
        </View>
      </View>

      {isNewProfile ? (
        <View style={styles.checklistCard}>
          <Text style={styles.checklistLabel}>ARMA TU PERFIL · 1 DE 3</Text>
          <View style={styles.checklistRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.green} />
            <Text style={styles.checklistText}>Crear cuenta</Text>
          </View>
          <View style={styles.checklistRow}>
            <Ionicons name="ellipse-outline" size={20} color={colors.muted} />
            <Text style={styles.checklistText}>Califica tu primer taco</Text>
          </View>
          <View style={styles.checklistRow}>
            <Ionicons name="ellipse-outline" size={20} color={colors.muted} />
            <Text style={styles.checklistText}>Guarda un favorito</Text>
          </View>
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{reviews.length}</Text>
            <Text style={styles.statLabel}>Reseñas</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{favorites.length}</Text>
            <Text style={styles.statLabel}>Favoritos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Fotos</Text>
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${earnedBadges.length} insignias, vista previa. Siguiente: ${nextBadge?.label ?? "todas ganadas"}`}
        onPress={() => router.push("/retos")}
        style={styles.badgeRow}
      >
        <Ionicons name="ribbon" size={18} color={colors.gold} />
        <Text style={styles.badgeRowText}>
          {earnedBadges.length} insignias
          {nextBadge ? ` · siguiente: ${nextBadge.label}` : ""}
          <Text style={styles.badgeRowPreview}> · vista previa</Text>
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.paper} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mis propuestas${pendingProposals > 0 ? `, ${pendingProposals} pendientes` : ""}`}
        onPress={() => router.push("/propose")}
        style={styles.proposalsRow}
      >
        <Text style={styles.proposalsRowText}>Mis propuestas</Text>
        {pendingProposals > 0 ? (
          <StatusBadge status="pending" reason={`${pendingProposals}`} />
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        )}
      </Pressable>

      <View style={styles.tabs}>
        {(
          [
            ["favoritos", "Favoritos"],
            ["resenas", "Reseñas"],
            ["fotos", "Fotos"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === value && styles.tabActiveText]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.notice}>
          <Text style={styles.body}>{error}</Text>
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={colors.red} style={{ marginTop: 28 }} /> : null}

      {!loading && tab === "favoritos" ? (
        favorites.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title="Aún no guardas favoritos"
            actionLabel="Explorar el mapa"
            onAction={() => router.push("/")}
          />
        ) : (
          favorites.map((favorite) => (
            <Pressable
              key={favorite.id}
              onPress={() => router.push({ pathname: "/spot/[id]", params: { id: favorite.id } })}
              style={styles.card}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{favorite.name}</Text>
                <Text style={styles.body}>{favorite.neighborhood}</Text>
              </View>
              <Ionicons name="heart" size={21} color={colors.red} />
            </Pressable>
          ))
        )
      ) : null}

      {!loading && tab === "resenas" ? (
        reviews.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="Aún no has publicado una reseña"
            actionLabel="Explorar el mapa"
            onAction={() => router.push("/")}
          />
        ) : (
          reviews.map((review) => (
            <View key={review.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{review.tacoName}</Text>
                <Text
                  style={styles.body}
                  accessibilityLabel={`${review.score.toFixed(1)} de 5 estrellas`}
                >
                  {review.spotName} · {review.score.toFixed(1)} ★
                </Text>
                {review.body ? (
                  <Text style={styles.comment}>{review.body}</Text>
                ) : (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: "/review/edit", params: { id: review.id } })
                    }
                  >
                    <Text style={styles.link}>Agregar uno</Text>
                  </Pressable>
                )}
              </View>
              <View>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/review/edit", params: { id: review.id } })
                  }
                  style={styles.smallButton}
                >
                  <Text style={styles.smallText}>Editar</Text>
                </Pressable>
                <Pressable onPress={() => void remove(review)} style={styles.deleteButton}>
                  <Text style={styles.deleteText}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          ))
        )
      ) : null}

      {!loading && tab === "fotos" ? (
        <EmptyState
          icon="camera-outline"
          title="Aún no subes fotos"
          subtitle="Sube una foto desde la página de un puesto."
          actionLabel="Explorar el mapa"
          onAction={() => router.push("/")}
        />
      ) : null}

      <AvatarSheet
        visible={avatarSheetOpen}
        onClose={() => setAvatarSheetOpen(false)}
        preset={profile?.avatarPreset ?? "pastor"}
        photoUrl={profile?.avatarPhotoUrl ?? undefined}
        onSave={saveAvatar}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingTop: 58, paddingBottom: 46 },
  center: { flex: 1, backgroundColor: colors.cream, padding: 28, justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  backText: { color: colors.green, fontWeight: "800", fontSize: 15 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  avatarWrap: { position: "relative" },
  avatarCameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.cream,
  },
  name: { ...typography.title, fontSize: 22, color: colors.ink },
  editLink: { marginTop: spacing.xs, minHeight: 32, justifyContent: "center" },
  editLinkText: { color: colors.green, fontWeight: "800", fontSize: 13 },
  checklistCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.goldSoft,
  },
  checklistLabel: {
    ...typography.kicker,
    color: colors.pendingText,
    marginBottom: spacing.sm,
  },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  checklistText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  statsGrid: {
    flexDirection: "row",
    marginTop: spacing.lg,
    backgroundColor: colors.paper,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.ink,
    minHeight: 44,
  },
  badgeRowText: { flex: 1, color: colors.paper, fontWeight: "800", fontSize: 13 },
  badgeRowPreview: { color: colors.gold, fontWeight: "700" },
  proposalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    minHeight: 44,
  },
  proposalsRowText: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  tabs: {
    flexDirection: "row",
    marginTop: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.redStrong },
  tabText: { color: colors.muted, fontWeight: "800", fontSize: 13 },
  tabActiveText: { color: colors.ink },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    marginTop: spacing.md,
  },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  comment: { color: colors.ink, marginTop: 7, lineHeight: 20 },
  notice: { padding: 14, backgroundColor: colors.tacoTile, borderRadius: 14, marginTop: 18 },
  link: { color: colors.green, fontWeight: "900", marginTop: 8 },
  primaryText: {
    color: "white",
    backgroundColor: colors.red,
    borderRadius: 14,
    padding: 15,
    textAlign: "center",
    overflow: "hidden",
    fontWeight: "900",
    marginTop: 22,
  },
  smallButton: {
    minHeight: 40,
    minWidth: 68,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  smallText: { color: "white", fontWeight: "800", fontSize: 12 },
  deleteButton: { minHeight: 40, justifyContent: "center", alignItems: "center" },
  deleteText: { color: colors.red, fontWeight: "800", fontSize: 12 },
});
