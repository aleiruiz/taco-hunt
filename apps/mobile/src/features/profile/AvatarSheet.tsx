import { useEffect, useState } from "react";
import { AccessibilityInfo, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Icon, type IconName } from "@/components/Icon";
import { colors, spacing, typography } from "@/theme";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import type { AvatarPreset as Preset } from "@/data/profile-api";

const AVATAR_OPTIONS: { preset: Preset; label: string }[] = [
  { preset: "pastor", label: "El Trompo" },
  { preset: "masa", label: "La Tortilla" },
  { preset: "cilantro", label: "La Cebollita" },
  { preset: "tortilla", label: "El Limón" },
  { preset: "salsa", label: "El Chile" },
  { preset: "comal", label: "El Molcajete" },
  { preset: "aguacate", label: "El Aguacate" },
  { preset: "horchata", label: "La Horchata" },
];

/**
 * `photoUri` is set only when the user picked a *new* local image this
 * session (needs uploading); `clearPhoto` means they picked a preset,
 * replacing a previously saved photo. Neither set means only the preset
 * selection changed. `onSave` does the real upload + PATCH /v1/me and can
 * reject — the sheet surfaces that error and stays open.
 */
type SaveInput = { preset: Preset; photoUri?: string; clearPhoto: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  preset: Preset;
  photoUrl?: string;
  onSave: (next: SaveInput) => Promise<void>;
};

export function AvatarSheet({ visible, onClose, preset, photoUrl, onSave }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>(preset);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | undefined>(photoUrl);
  const [saving, setSaving] = useState(false);

  // The sheet stays mounted between opens (only `visible` toggles), so
  // resync the working selection to the actual saved avatar each time it
  // opens — otherwise an unsaved pick from a prior open (dismissed via the
  // backdrop rather than "Guardar") would still be showing next time.
  useEffect(() => {
    if (visible) {
      setSelectedPreset(preset);
      setSelectedPhotoUrl(photoUrl);
    }
  }, [visible, preset, photoUrl]);

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setSelectedPhotoUrl(result.assets[0].uri);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setSelectedPhotoUrl(result.assets[0].uri);
  }

  function choosePreset(next: Preset) {
    setSelectedPreset(next);
    setSelectedPhotoUrl(undefined);
  }

  async function save() {
    const isNewPhoto = Boolean(selectedPhotoUrl) && selectedPhotoUrl !== photoUrl;
    setSaving(true);
    try {
      await onSave({
        preset: selectedPreset,
        photoUri: isNewPhoto ? selectedPhotoUrl : undefined,
        clearPhoto: !selectedPhotoUrl && Boolean(photoUrl),
      });
      AccessibilityInfo.announceForAccessibility("Foto de perfil actualizada.");
      onClose();
    } catch (cause) {
      Alert.alert(
        "No se pudo actualizar",
        cause instanceof Error ? cause.message : "Intenta de nuevo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.previewWrap}>
        <Avatar size={72} preset={selectedPreset} photoUrl={selectedPhotoUrl} />
      </View>
      <View style={styles.actionRow}>
        <Button
          label="Tomar foto"
          variant="secondary"
          icon="camera-outline"
          onPress={() => void takePhoto()}
          style={{ flex: 1 }}
        />
        <Button
          label="Elegir de galería"
          variant="secondary"
          icon="image-outline"
          onPress={() => void pickFromLibrary()}
          style={{ flex: 1 }}
        />
      </View>
      <Text style={styles.sectionLabel}>O ELIGE UNO DE LA TAQUIZA</Text>
      <View style={styles.grid}>
        {AVATAR_OPTIONS.map((option) => {
          const selected = !selectedPhotoUrl && selectedPreset === option.preset;
          return (
            <Pressable
              key={option.preset}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => choosePreset(option.preset)}
              style={styles.gridItem}
            >
              <View style={[styles.avatarRing, selected && styles.avatarRingSelected]}>
                <Avatar size={40} preset={option.preset} />
                {selected && (
                  <View style={styles.checkBadge}>
                    <Icon name="checkmark" size={12} color={colors.paper} />
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>
        Una foto nueva se muestra de inmediato y pasa por una revisión automática; si no se aprueba,
        volvemos a tu avatar y te decimos por qué.
      </Text>
      <Button
        label="Guardar"
        variant="primary"
        loading={saving}
        onPress={() => void save()}
        style={styles.saveButton}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: "center", marginTop: spacing.md },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  sectionLabel: {
    ...typography.label,
    color: colors.muted,
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridItem: { width: "22%", alignItems: "center", minHeight: 44, justifyContent: "center" },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarRingSelected: { borderColor: colors.green },
  checkBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.paper,
  },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.lg },
  saveButton: { marginTop: spacing.lg },
});
