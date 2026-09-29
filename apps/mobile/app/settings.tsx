import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authConfigured } from "@/auth/client";
import { useAuth } from "@/auth/provider";
import { deleteAccount } from "@/features/contributions/api";
import { colors } from "@/theme";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

export default function SettingsScreen() {
  const { session, loading, error, retrySession, signOut } = useAuth();
  const router = useRouter();
  const email = session?.user.email ?? "";
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Eliminar cuenta",
      "Se eliminarán tu perfil, reseñas, favoritos y fotos. Tus propuestas ya enviadas se conservan de forma anónima para el equipo de moderación. Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar cuenta",
          style: "destructive",
          onPress: () => void handleDeleteAccount(),
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    if (!session) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount(session);
      await signOut();
      router.replace("/");
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "No pudimos eliminar tu cuenta. Intenta de nuevo.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" style={styles.back}>
          <Ionicons name="chevron-back" size={16} color={colors.green} />
          <Text style={styles.backText}>Volver a explorar</Text>
        </Pressable>
      </Link>
      <Text style={styles.kicker}>TU CUENTA</Text>
      <Text style={styles.title}>Ajustes</Text>
      {error ? (
        <View style={styles.notice}>
          <Text style={styles.body}>No pudimos restaurar tu sesión: {error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void retrySession()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
          <Link href="/my-tacos" asChild>
            <Button label="Mis tacos y favoritos" variant="secondary" />
          </Link>
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color={colors.red} style={{ marginTop: 30 }} />
      ) : session ? (
        <Card style={styles.card}>
          <Text style={styles.label}>Sesión iniciada como</Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.body}>
            Tu sesión se guarda de forma segura en este dispositivo y se renueva automáticamente.
          </Text>
          <Button
            label="Cerrar sesión"
            onPress={() => void handleSignOut()}
            style={styles.button}
          />
          <Link href="/admin" style={styles.moderationLink}>
            Abrir panel de moderación
          </Link>
          {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
          <Button
            label="Eliminar cuenta"
            variant="danger"
            onPress={confirmDeleteAccount}
            loading={deleting}
            style={styles.deleteAccountButton}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Inicia sesión para guardar tus favoritos</Text>
          <Text style={styles.body}>
            Explora Taco Hunt sin cuenta. Para participar, entra o crea una cuenta.
          </Text>
          <Link href="/sign-in" asChild>
            <Button label="Iniciar sesión" style={styles.buttonTextLink} />
          </Link>
          <Link href="/sign-up" asChild>
            <Button label="Crear cuenta" variant="secondary" style={styles.buttonSecondary} />
          </Link>
        </Card>
      )}
      {session ? null : (
        <Link href="/my-tacos" asChild>
          <Button
            label="Mis tacos y favoritos"
            variant="secondary"
            style={styles.buttonSecondary}
          />
        </Link>
      )}
      {!authConfigured ? (
        <Text style={styles.notice}>
          Supabase Auth no está configurado. Añade EXPO_PUBLIC_SUPABASE_URL y
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY al entorno móvil.
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Taco Hunt</Text>
        <Text style={styles.body}>Versión 0.1.0 · Descubre, prueba y comparte.</Text>
        <Text style={styles.body}>
          Consulta nuestra política de privacidad en la información del proyecto.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 40 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, marginBottom: 24 },
  backText: { color: colors.green, fontSize: 15, fontWeight: "800" },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10, marginBottom: 22 },
  card: { padding: 19 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  email: { color: colors.ink, fontSize: 17, fontWeight: "900", marginTop: 5 },
  cardTitle: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  button: { marginTop: 22 },
  buttonTextLink: { marginTop: 20 },
  buttonSecondary: { marginTop: 10 },
  notice: {
    lineHeight: 21,
    marginTop: 15,
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.tacoTile,
  },
  retry: { marginTop: 10, paddingVertical: 8 },
  retryText: { color: colors.green, fontWeight: "900" },
  footer: { marginTop: 34 },
  moderationLink: { color: colors.green, fontWeight: "900", textAlign: "center", marginTop: 16 },
  deleteAccountButton: { marginTop: 22 },
  deleteError: {
    color: colors.dangerText,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    lineHeight: 20,
  },
  footerTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
});
