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
import { authConfigured } from "@/auth/client";
import { useAuth } from "@/auth/provider";
import { deleteAccount } from "@/features/contributions/api";

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
      <Link href="/" style={styles.back}>
        ‹ Volver a explorar
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
          <Link href="/my-tacos" style={styles.buttonSecondary}>
            Mis tacos y favoritos
          </Link>
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color="#E95032" style={{ marginTop: 30 }} />
      ) : session ? (
        <View style={styles.card}>
          <Text style={styles.label}>Sesión iniciada como</Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.body}>
            Tu sesión se guarda de forma segura en este dispositivo y se renueva automáticamente.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleSignOut()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Cerrar sesión</Text>
          </Pressable>
          <Link href="/admin" style={styles.moderationLink}>
            Abrir panel de moderación
          </Link>
          {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={confirmDeleteAccount}
            style={styles.deleteAccountButton}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#A92E24" />
            ) : (
              <Text style={styles.deleteAccountText}>Eliminar cuenta</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inicia sesión para guardar tus favoritos</Text>
          <Text style={styles.body}>
            Explora Taco Hunt sin cuenta. Para participar, entra o crea una cuenta.
          </Text>
          <Link href="/sign-in" style={styles.buttonTextLink}>
            Iniciar sesión
          </Link>
          <Link href="/sign-up" style={styles.buttonSecondary}>
            Crear cuenta
          </Link>
        </View>
      )}
      {session ? null : (
        <Link href="/my-tacos" style={styles.buttonSecondary}>
          Mis tacos y favoritos
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
  screen: { flex: 1, backgroundColor: "#FBF3E6" },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 40 },
  back: {
    color: "#276C4F",
    fontSize: 15,
    fontWeight: "800",
    minHeight: 44,
    textAlignVertical: "center",
    marginBottom: 24,
  },
  kicker: { color: "#276C4F", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#302723", fontSize: 32, fontWeight: "900", marginTop: 10, marginBottom: 22 },
  card: {
    padding: 19,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8DCCB",
    backgroundColor: "#FFFAF1",
  },
  label: { color: "#6C5D53", fontSize: 13, fontWeight: "700" },
  email: { color: "#302723", fontSize: 17, fontWeight: "900", marginTop: 5 },
  cardTitle: { color: "#302723", fontSize: 17, lineHeight: 23, fontWeight: "900" },
  body: { color: "#6C5D53", fontSize: 14, lineHeight: 21, marginTop: 10 },
  button: {
    minHeight: 48,
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: "#E95032",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#FFFAF1", fontWeight: "900", textAlign: "center" },
  buttonTextLink: {
    minHeight: 48,
    marginTop: 20,
    paddingTop: 15,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E95032",
    color: "#FFFAF1",
    fontWeight: "900",
    textAlign: "center",
  },
  buttonSecondary: {
    minHeight: 48,
    marginTop: 10,
    paddingTop: 14,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DFD0BA",
    color: "#302723",
    fontWeight: "900",
    textAlign: "center",
  },
  notice: {
    lineHeight: 21,
    marginTop: 15,
    padding: 15,
    borderRadius: 14,
    backgroundColor: "#F9DEAE",
  },
  retry: { marginTop: 10, paddingVertical: 8 },
  retryText: { color: "#276C4F", fontWeight: "900" },
  footer: { marginTop: 34 },
  moderationLink: { color: "#276C4F", fontWeight: "900", textAlign: "center", marginTop: 16 },
  deleteAccountButton: {
    minHeight: 44,
    marginTop: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteAccountText: { color: "#A92E24", fontWeight: "900", fontSize: 13 },
  deleteError: {
    color: "#A92E24",
    backgroundColor: "#FBE2DC",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    lineHeight: 20,
  },
  footerTitle: { color: "#302723", fontSize: 17, fontWeight: "900" },
});
