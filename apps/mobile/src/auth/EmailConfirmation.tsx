import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "@/components";
import { colors, spacing, typography } from "@/theme";
import { supabase } from "./client";

export function maskEmail(email: string) {
  const [local, domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain.slice(0, 1)}•••${domain.includes(".") ? domain.slice(domain.lastIndexOf(".")) : ""}`;
}

export function EmailConfirmation({
  email,
  onChangeEmail,
  onSignIn,
}: {
  email: string;
  onChangeEmail: () => void;
  onSignIn: () => void;
}) {
  const [resendAt, setResendAt] = useState(() => Date.now() + 60_000);
  const [remaining, setRemaining] = useState(60);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility("Revisa tu correo para confirmar tu cuenta.");
  }, []);
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [resendAt]);

  async function resend() {
    if (busyRef.current || Date.now() < resendAt) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: authError } = await supabase.auth.resend({ type: "signup", email });
      if (authError) throw authError;
      setResendAt(Date.now() + 60_000);
      setMessage("Correo reenviado. Revisa también la carpeta de spam.");
      AccessibilityInfo.announceForAccessibility("Correo reenviado.");
    } catch {
      setResendAt(Date.now() + 60_000);
      setError("No pudimos reenviar el correo. Espera un minuto e inténtalo de nuevo.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function openMail() {
    setError("");
    try {
      await Linking.openURL(Platform.OS === "ios" ? "message://" : "mailto:");
    } catch {
      setError("Abre tu app de correo y busca el mensaje de Taco Hunt.");
    }
  }

  return (
    <View style={styles.content}>
      <Ionicons name="mail-outline" size={56} color={colors.green} />
      <Text accessibilityRole="header" style={styles.title}>
        Revisa tu correo
      </Text>
      <Card>
        <Text style={styles.body}>
          Si el correo puede registrarse, recibirás un enlace de confirmación en {maskEmail(email)}.
        </Text>
        <Text style={styles.body}>
          Ábrelo y luego vuelve para iniciar sesión. Si ya tienes cuenta, puedes entrar con tu
          contraseña.
        </Text>
      </Card>
      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button label="Abrir mi app de correo" icon="mail-outline" onPress={() => void openMail()} />
      <Button
        label={
          busy ? "Reenviando…" : remaining > 0 ? `Reenviar en ${remaining} s` : "Reenviar correo"
        }
        variant="ghost"
        disabled={remaining > 0 || busy}
        loading={busy}
        onPress={() => void resend()}
      />
      <Button
        label="Ya confirmé: iniciar sesión"
        variant="ghost"
        disabled={busy}
        onPress={onSignIn}
      />
      <Button label="Usar otro correo" variant="ghost" disabled={busy} onPress={onChangeEmail} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  title: { ...typography.display, color: colors.ink },
  body: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
  message: { ...typography.body, color: colors.green },
  error: { ...typography.body, color: colors.dangerText },
});
