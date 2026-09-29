import { useState, type PropsWithChildren } from "react";
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
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { authConfigured, passwordResetRedirectUrl, supabase } from "./client";

type Mode = "sign-in" | "sign-up" | "reset";

export function AuthScreen({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const title =
    mode === "sign-in"
      ? "Qué bueno verte"
      : mode === "sign-up"
        ? "Únete a la mesa"
        : "Recupera tu acceso";

  async function submit() {
    setError("");
    setMessage("");
    if (!authConfigured) {
      setError("Falta configurar Supabase Auth. Revisa las variables EXPO_PUBLIC_SUPABASE_*.");
      return;
    }
    if (!email.trim()) {
      setError("Escribe tu correo electrónico.");
      return;
    }
    if (mode !== "reset" && password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      } else if (mode === "sign-up") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || null } },
        });
        if (authError) throw authError;
        if (!data.session)
          setMessage("Revisa tu correo para confirmar tu cuenta y después inicia sesión.");
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: passwordResetRedirectUrl,
        });
        if (authError) throw authError;
        setMessage(
          "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos completar la solicitud. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" style={styles.back}>
          <Ionicons name="chevron-back" size={16} color={colors.green} />
          <Text style={styles.backText}>Explorar sin cuenta</Text>
        </Pressable>
      </Link>
      <View style={styles.hero}>
        <Text style={styles.kicker}>TACO HUNT · MONTERREY</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {mode === "reset"
            ? "Te enviaremos un enlace para volver a entrar."
            : "Guarda tus puestos favoritos y comparte tus reseñas."}
        </Text>
      </View>
      <View style={styles.form}>
        {mode === "sign-up" && (
          <Field
            label="Nombre para mostrar (opcional)"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}
        <Field
          label="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {mode !== "reset" && (
          <Field
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
        )}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFAF1" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "sign-in"
                ? "Iniciar sesión"
                : mode === "sign-up"
                  ? "Crear cuenta"
                  : "Enviar instrucciones"}
            </Text>
          )}
        </Pressable>
        {mode === "sign-in" ? (
          <Link href="/reset-password" style={styles.inlineLink}>
            ¿Olvidaste tu contraseña?
          </Link>
        ) : null}
        <Text style={styles.switchText}>
          {mode === "sign-up" ? "¿Ya tienes cuenta? " : "¿Primera vez por aquí? "}
          <Link href={mode === "sign-up" ? "/sign-in" : "/sign-up"} style={styles.inlineLink}>
            {mode === "sign-up" ? "Inicia sesión" : "Crea una cuenta"}
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...props
}: PropsWithChildren<React.ComponentProps<typeof TextInput>> & { label: string }) {
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
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 },
  backText: { color: "#276C4F", fontWeight: "800", fontSize: 15 },
  hero: { marginTop: 38 },
  kicker: { color: "#276C4F", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { marginTop: 12, color: "#302723", fontSize: 32, lineHeight: 38, fontWeight: "900" },
  subtitle: { marginTop: 8, color: "#6C5D53", fontSize: 15, lineHeight: 22 },
  form: { marginTop: 30 },
  field: { marginBottom: 17 },
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
  button: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 15,
    backgroundColor: "#E95032",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#FFFAF1", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.86 },
  disabled: { opacity: 0.65 },
  error: { color: "#B3261E", marginBottom: 12, lineHeight: 20 },
  message: { color: "#276C4F", marginBottom: 12, lineHeight: 20 },
  inlineLink: { color: "#276C4F", fontWeight: "800", textAlign: "center", marginTop: 17 },
  switchText: { color: "#6C5D53", textAlign: "center", marginTop: 25, lineHeight: 22 },
});
