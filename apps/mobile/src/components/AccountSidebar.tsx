import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Avatar } from "@/components/Avatar";
import { colors, elevation, radii, spacing, typography } from "@/theme";

type Props = {
  visible: boolean;
  email?: string;
  signedIn: boolean;
  isAdmin: boolean;
  avatarPreset?: ComponentProps<typeof Avatar>["preset"];
  avatarPhotoUrl?: string | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

type MenuRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  subtitle?: string;
};

function MenuRow({ icon, label, onPress, subtitle }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.green} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export function AccountSidebar({
  visible,
  email,
  signedIn,
  isAdmin,
  avatarPreset,
  avatarPhotoUrl,
  onClose,
  onNavigate,
  onSignOut,
}: Props) {
  const navigate = (path: string) => {
    onClose();
    onNavigate(path);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar menú de cuenta"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.accountHeading}>
              {signedIn ? (
                <Avatar size={40} preset={avatarPreset} photoUrl={avatarPhotoUrl ?? undefined} />
              ) : (
                <View style={styles.guestAvatar}>
                  <Ionicons name="person-outline" size={24} color={colors.green} />
                </View>
              )}
              <View style={styles.headerCopy}>
                <Text style={styles.kicker}>TU CUENTA</Text>
                <Text style={styles.title}>{signedIn ? "Tu taquiza" : "Explora Taco Hunt"}</Text>
                {signedIn && email ? (
                  <Text style={styles.email} numberOfLines={1}>
                    {email}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar menú de cuenta"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.menu}>
            {signedIn ? (
              <>
                <MenuRow
                  icon="person-outline"
                  label="Mi perfil"
                  onPress={() => navigate("/my-tacos")}
                />
                <MenuRow
                  icon="heart-outline"
                  label="Favoritos"
                  onPress={() => navigate("/my-tacos?tab=favoritos")}
                />
                <MenuRow
                  icon="location-outline"
                  label="Mis propuestas"
                  subtitle="Puestos que has propuesto"
                  onPress={() => navigate("/propose")}
                />
                <MenuRow
                  icon="ribbon-outline"
                  label="Mis estampas"
                  subtitle="Retos e insignias"
                  onPress={() => navigate("/retos")}
                />
                {isAdmin ? (
                  <MenuRow
                    icon="shield-checkmark-outline"
                    label="Panel de administración"
                    onPress={() => navigate("/admin")}
                  />
                ) : null}
                <View style={styles.divider} />
                <MenuRow
                  icon="settings-outline"
                  label="Cuenta y seguridad"
                  onPress={() => navigate("/settings")}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar sesión"
                  onPress={() => {
                    onClose();
                    onSignOut();
                  }}
                  style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}
                >
                  <Ionicons name="log-out-outline" size={20} color={colors.dangerText} />
                  <Text style={styles.signOutText}>Cerrar sesión</Text>
                </Pressable>
              </>
            ) : (
              <>
                <MenuRow
                  icon="log-in-outline"
                  label="Iniciar sesión"
                  onPress={() => navigate("/sign-in")}
                />
                <MenuRow
                  icon="person-add-outline"
                  label="Crear cuenta"
                  onPress={() => navigate("/sign-up")}
                />
                <View style={styles.guestHint}>
                  <Ionicons name="heart-outline" size={18} color={colors.green} />
                  <Text style={styles.guestHintText}>
                    Inicia sesión para guardar favoritos, reseñas y propuestas.
                  </Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.footer}>Taco Hunt · Descubre, prueba y comparte.</Text>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    flexDirection: "row",
  },
  panel: {
    width: "86%",
    maxWidth: 360,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    ...elevation.float,
  },
  header: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  accountHeading: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerCopy: { flex: 1 },
  kicker: { ...typography.kicker, color: colors.green },
  title: { color: colors.ink, fontSize: 20, fontWeight: "900", marginTop: 3 },
  email: { color: colors.muted, fontSize: 12, marginTop: 3 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  guestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    minHeight: 56,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.cream },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1 },
  rowLabel: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  rowSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.sm },
  signOut: {
    minHeight: 52,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  signOutText: { color: colors.dangerText, fontSize: 15, fontWeight: "800" },
  guestHint: {
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.greenSoft,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  guestHintText: { flex: 1, color: colors.green, fontSize: 13, lineHeight: 19 },
  footer: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: "auto",
    marginBottom: spacing.lg,
  },
});
