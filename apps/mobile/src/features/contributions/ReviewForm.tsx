import { useRef, useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import type { Session } from "@supabase/supabase-js";
import {
  createReview,
  updateReview,
  uploadReviewPhoto,
  type OwnReview,
  type ReviewInput,
} from "./api";
import { colors, spacing } from "@/theme";
import { PhotoTile } from "@/components/PhotoTile";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/Button";

const ratingLabels = ["Tortilla", "Relleno", "Salsa", "Relación calidad-precio"] as const;
const MAX_REVIEW_PHOTO_BYTES = 2 * 1024 * 1024;
type Props = {
  session: Session;
  spotTacoId?: string;
  spotName?: string;
  tacoName?: string;
  existing?: OwnReview;
  onSaved: () => void;
};

export function ReviewForm({ session, spotTacoId, spotName, tacoName, existing, onSaved }: Props) {
  const [ratings, setRatings] = useState({
    tortilla: existing?.tortilla ?? 0,
    filling: existing?.filling ?? 0,
    salsa: existing?.salsa ?? 0,
    value: existing?.value ?? 0,
  });
  const [price, setPrice] = useState(
    existing?.pricePaidMxn == null ? "" : String(existing.pricePaidMxn),
  );
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUploadId, setPhotoUploadId] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPicker, setPhotoPicker] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoChooserOpen, setPhotoChooserOpen] = useState(false);
  const keys = ["tortilla", "filling", "salsa", "value"] as const;
  // Bumped on every new pick/retry so a slow upload that finishes after the
  // user moved on (picked another photo, or retried) can't clobber the
  // photoUploadId/photoUri/photoError state of the one the user sees now.
  const photoOpId = useRef(0);

  async function uploadAsset(asset: ImagePicker.ImagePickerAsset) {
    const opId = ++photoOpId.current;
    setPhotoUri(asset.uri);
    setPhotoUploadId(null);
    if (asset.fileSize != null && asset.fileSize > MAX_REVIEW_PHOTO_BYTES) {
      setPhotoPicker(null);
      setPhotoUploading(false);
      const message = "La foto debe pesar como máximo 2 MB. Elige una foto más pequeña.";
      setPhotoError(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    setPhotoPicker(asset);
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const upload = await uploadReviewPhoto(session, {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
      if (photoOpId.current !== opId) return;
      setPhotoUploadId(upload.id);
      AccessibilityInfo.announceForAccessibility("Foto lista para tu reseña.");
    } catch (cause) {
      if (photoOpId.current !== opId) return;
      const message = cause instanceof Error ? cause.message : "No pudimos subir la foto.";
      setPhotoError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      if (photoOpId.current === opId) setPhotoUploading(false);
    }
  }

  async function pickFromLibrary() {
    setPhotoChooserOpen(false);
    try {
      // Single-image selection via launchImageLibraryAsync doesn't require a
      // library permission grant on supported platforms (Expo SDK 57) — the
      // system picker handles access to the one photo the user selects.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      await uploadAsset(result.assets[0]);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "No pudimos abrir tu galería de fotos.";
      setPhotoError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  }

  async function takePhoto() {
    setPhotoChooserOpen(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPhotoError("Necesitamos acceso a tu cámara para tomar la foto. Actívalo en Ajustes.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      await uploadAsset(result.assets[0]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No pudimos abrir la cámara.";
      setPhotoError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  }

  function removePhoto() {
    photoOpId.current += 1;
    setPhotoUri(null);
    setPhotoUploadId(null);
    setPhotoPicker(null);
    setPhotoError(null);
    setPhotoUploading(false);
    AccessibilityInfo.announceForAccessibility("Foto quitada.");
  }

  function retryUpload() {
    if (photoPicker) void uploadAsset(photoPicker);
  }

  async function save() {
    if (
      Object.values(ratings).some((value) => value < 1 || value > 5) ||
      (!existing && !spotTacoId)
    ) {
      setError("Elige una calificación del 1 al 5 en cada categoría.");
      return;
    }
    const priceValue = price.trim() === "" ? undefined : Number(price.replace(",", "."));
    if (priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0)) {
      setError("Escribe un precio válido en pesos.");
      return;
    }
    if (photoUploading) {
      setError("Espera a que termine de subirse la foto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await updateReview(session, existing.id, {
          ...ratings,
          pricePaidMxn: priceValue ?? null,
          body: body.trim() || null,
          ...(photoUploadId ? { photoUploadId } : {}),
        });
      } else {
        const input: ReviewInput = {
          spotTacoId: spotTacoId!,
          ...ratings,
          ...(priceValue === undefined ? {} : { pricePaidMxn: priceValue }),
          ...(body.trim() ? { body: body.trim() } : {}),
          ...(photoUploadId ? { photoUploadId } : {}),
        };
        await createReview(session, input);
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar tu reseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>{existing ? "EDITAR RESEÑA" : "NUEVA RESEÑA"}</Text>
      <Text style={styles.title}>{tacoName ?? existing?.tacoName ?? "Tu taco"}</Text>
      <Text style={styles.subtitle}>{spotName ?? existing?.spotName ?? "Puesto"}</Text>
      <Text style={styles.intro}>
        Tu visita cuenta como experiencia personal; no verificamos ubicación GPS.
      </Text>
      {ratingLabels.map((label, index) => {
        const key = keys[index];
        return (
          <View key={key} style={styles.ratingRow}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${value} de 5`}
                  onPress={() => setRatings((current) => ({ ...current, [key]: value }))}
                  style={styles.starButton}
                >
                  <Text style={[styles.star, value <= ratings[key] && styles.starSelected]}>★</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      <Text style={styles.label}>Precio pagado (opcional)</Text>
      <TextInput
        accessibilityLabel="Precio pagado"
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
        placeholder="$ 0"
        placeholderTextColor="#AD9D8E"
        style={styles.input}
      />
      <Text style={styles.label}>Cuéntale a la comunidad (opcional)</Text>
      <TextInput
        accessibilityLabel="Comentario"
        multiline
        maxLength={500}
        value={body}
        onChangeText={setBody}
        placeholder="Hasta 500 caracteres"
        placeholderTextColor="#AD9D8E"
        style={[styles.input, styles.textarea]}
      />
      <Text style={styles.label}>Foto (opcional)</Text>
      <View style={styles.photoRow}>
        <View>
          <PhotoTile
            photoUrl={photoUri ?? undefined}
            dashed={!photoUri}
            size={96}
            accessibilityLabel={photoUri ? "Cambiar foto de la reseña" : "Agregar foto a la reseña"}
            onPress={() => setPhotoChooserOpen((open) => !open)}
          />
          {photoUploading && (
            <View
              style={[StyleSheet.absoluteFill, styles.photoOverlay]}
              accessibilityElementsHidden
            >
              <ActivityIndicator color={colors.paper} />
            </View>
          )}
          {photoUri && !photoUploading && (
            <View style={styles.photoRemove}>
              <IconButton
                icon="close"
                label="Quitar foto"
                size={28}
                color={colors.paper}
                elevated
                onPress={removePhoto}
              />
            </View>
          )}
        </View>
        <View style={styles.photoInfo}>
          {photoUploading ? (
            <Text style={styles.photoStatus}>Subiendo foto…</Text>
          ) : photoUploadId ? (
            <Text style={styles.photoStatus}>Foto lista para publicarse con tu reseña.</Text>
          ) : (
            <Text style={styles.photoStatus}>
              Comparte cómo se ve tu taco. Un moderador la revisa antes de mostrarla.
            </Text>
          )}
          {photoError && !photoUploading && (
            <>
              <Text style={styles.error}>{photoError}</Text>
              {photoPicker && (
                <Button
                  label="Reintentar"
                  variant="secondary"
                  onPress={retryUpload}
                  style={styles.retryButton}
                />
              )}
            </>
          )}
        </View>
      </View>
      {photoChooserOpen && (
        <View style={styles.photoChooser}>
          <Button
            label="Tomar foto"
            variant="secondary"
            icon="camera-outline"
            onPress={() => void takePhoto()}
            style={styles.photoChooserButton}
          />
          <Button
            label="Elegir de galería"
            variant="secondary"
            icon="image-outline"
            onPress={() => void pickFromLibrary()}
            style={styles.photoChooserButton}
          />
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={styles.primary}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.primaryText}>{existing ? "Guardar cambios" : "Publicar reseña"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingTop: 58, paddingBottom: 48 },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "900", marginTop: 10 },
  subtitle: { color: colors.muted, fontSize: 16, marginTop: 4 },
  intro: { color: colors.muted, lineHeight: 21, marginTop: 18, marginBottom: 22 },
  ratingRow: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 13 },
  stars: { flexDirection: "row", marginTop: 7 },
  starButton: { minWidth: 42, minHeight: 42, alignItems: "center", justifyContent: "center" },
  star: { color: "#D7C8B8", fontSize: 30 },
  starSelected: { color: colors.red },
  input: {
    minHeight: 50,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 16,
  },
  textarea: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },
  photoRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
    alignItems: "flex-start",
  },
  photoOverlay: {
    borderRadius: 13,
    backgroundColor: "rgba(48, 39, 35, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemove: { position: "absolute", top: -6, right: -6 },
  photoInfo: { flex: 1, paddingTop: spacing.xs },
  photoStatus: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  photoChooser: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  photoChooserButton: { flex: 1 },
  retryButton: { marginTop: spacing.sm, alignSelf: "flex-start" },
  error: { color: "#A52218", lineHeight: 20, marginTop: 16 },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { color: "white", fontWeight: "900", fontSize: 15 },
});
