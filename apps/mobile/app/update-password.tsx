import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { authConfigured, supabase } from "@/auth/client";
import { useAuth } from "@/auth/provider";

export default function UpdatePasswordScreen() {
  const { session, loading, error: sessionError, retrySession } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function savePassword() {
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/settings");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos actualizar tu contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <Link href="/" style={styles.back}>
        ‹ Explorar sin cuenta
      </Link>
      <View style={styles.content}>
        <Text style={styles.kicker}>RECUPERAR ACCESO</Text>
        <Text style={styles.title}>Elige una contraseña nueva</Text>
        {loading ? (
          <ActivityIndicator color="#E95032" style={{ marginTop: 26 }} />
        ) : session ? (
          <>
            <Text style={styles.body}>
              Tu enlace fue confirmado. Crea una contraseña nueva para tu cuenta.
            </Text>
            <Field
              label="Nueva contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <Field
              label="Confirma la contraseña"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoComplete="new-password"
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void savePassword()}
              style={[styles.button, busy && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFAF1" />
              ) : (
                <Text style={styles.buttonText}>Guardar contraseña</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text accessibilityRole="alert" style={styles.body}>
              {sessionError ??
                "Abre esta pantalla desde el enlace de recuperación que enviamos a tu correo."}
            </Text>
            {sessionError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void retrySession()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Reintentar sesión</Text>
              </Pressable>
            ) : null}
            <Link href="/reset-password" style={styles.link}>
              Solicitar otro enlace
            </Link>
          </>
        )}
        {!authConfigured ? (
          <Text style={styles.error}>Supabase Auth no está configurado.</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#8A7A6E"
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FBF3E6", paddingHorizontal: 24, paddingTop: 56 },
  back: {
    color: "#276C4F",
    fontWeight: "800",
    fontSize: 15,
    minHeight: 44,
    textAlignVertical: "center",
  },
  content: { marginTop: 48 },
  kicker: { color: "#276C4F", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { marginTop: 12, color: "#302723", fontSize: 30, lineHeight: 37, fontWeight: "900" },
  body: { marginTop: 12, color: "#6C5D53", fontSize: 15, lineHeight: 22 },
  field: { marginTop: 20 },
  label: { color: "#302723", fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: "#DFD0BA",
    borderRadius: 14,
    backgroundColor: "#FFFAF1",
    paddingHorizontal: 15,
    color: "#302723",
    fontSize: 15,
  },
  error: { color: "#B3261E", marginTop: 14, lineHeight: 20 },
  button: {
    minHeight: 52,
    marginTop: 20,
    borderRadius: 15,
    backgroundColor: "#E95032",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#FFFAF1", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  retry: { marginTop: 18, minHeight: 44, justifyContent: "center" },
  retryText: { color: "#276C4F", fontWeight: "900" },
  link: { color: "#276C4F", fontWeight: "900", marginTop: 18 },
});
