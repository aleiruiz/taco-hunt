import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "@/components";
import { colors, radii, sizes, spacing, typography } from "@/theme";
import { getOnboardingProfile, type OnboardingProfile } from "@/data/auth-onboarding";
import { authConfigured, passwordResetRedirectUrl, supabase } from "./client";
import { useAuth } from "./provider";
import { authDestination, stackRoutePath } from "./navigation";
import { SignUpSuccess } from "./SignUpSuccess";
import { EmailConfirmation } from "./EmailConfirmation";

type Mode = "sign-in" | "sign-up" | "reset";
type FormError = { field?: "email" | "password"; message: string; accountExists?: boolean };

function authFailure(cause: unknown): FormError {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return {
        field: "email",
        message: "Ya hay una cuenta con este correo. Inicia sesión o recupera tu contraseña.",
        accountExists: true,
      };
    case "invalid_credentials":
      return {
        field: "password",
        message: "El correo o la contraseña no coinciden. Revisa tus datos.",
      };
    case "weak_password":
      return {
        field: "password",
        message: "Elige una contraseña más segura, de al menos 6 caracteres.",
      };
    case "email_address_invalid":
    case "validation_failed":
      return { field: "email", message: "Revisa que tu correo electrónico esté bien escrito." };
    case "email_not_confirmed":
      return {
        field: "email",
        message: "Confirma tu correo con el enlace que recibiste antes de iniciar sesión.",
      };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return { message: "Espera un minuto antes de volver a intentarlo." };
    default:
      return {
        message: "No pudimos completar la solicitud. Revisa tu conexión e inténtalo de nuevo.",
      };
  }
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ returnTo?: string; email?: string }>();
  const destination = authDestination(params.returnTo);

  /**
   * Returns to the screen that opened this one when it is the destination (it re-renders
   * signed in), instead of stacking a second copy of it that "atrás" would reveal later.
   */
  function goToDestination() {
    const state = navigation.getState();
    const previous = state && state.index > 0 ? state.routes[state.index - 1] : undefined;
    const target = typeof destination === "string" ? destination.split("?")[0] : undefined;
    if (previous && target && stackRoutePath(previous.name, previous.params) === target) {
      router.back();
    } else {
      router.replace(destination);
    }
  }
  const { session, loading } = useAuth();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const navigated = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<OnboardingProfile | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (busy) return;
    if (error?.field === "email") emailRef.current?.focus();
    if (error?.field === "password") passwordRef.current?.focus();
  }, [error, busy]);

  useEffect(() => {
    // An auth event may precede signUp's response. Let the submitting call own
    // its result so a new account is never redirected past the success screen.
    if (
      !session ||
      loading ||
      submitting.current ||
      newProfile ||
      navigated.current ||
      mode === "reset"
    )
      return;
    if (confirmationEmail) {
      if (session.user.email?.toLowerCase() === confirmationEmail.toLowerCase()) {
        setNewProfile(getOnboardingProfile(session.user.id, displayName));
        setConfirmationEmail(null);
      }
      return;
    }
    navigated.current = true;
    goToDestination();
    // goToDestination only reads navigation state and router, both stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading, newProfile, confirmationEmail, displayName, mode, destination, router]);

  function reportError(next: FormError) {
    setError(next);
    AccessibilityInfo.announceForAccessibility(next.message);
  }

  function openAuth(pathname: "/sign-in" | "/sign-up" | "/reset-password") {
    router.replace({ pathname, params: { returnTo: String(destination), email: email.trim() } });
  }

  async function submit() {
    if (submitting.current) return;
    setError(null);
    setMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      reportError({ field: "email", message: "Escribe un correo electrónico válido." });
      return;
    }
    if (mode !== "reset" && password.length < 6) {
      reportError({
        field: "password",
        message: "La contraseña debe tener al menos 6 caracteres.",
      });
      return;
    }
    if (!authConfigured) {
      reportError({
        message:
          "El acceso no está disponible por ahora. Puedes seguir explorando y volver más tarde.",
      });
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        if (!data.session) throw new Error("Missing session");
        const profile = getOnboardingProfile(
          data.session.user.id,
          data.session.user.user_metadata.display_name,
        );
        AccessibilityInfo.announceForAccessibility(
          `Sesión iniciada. ¡Bienvenido, ${profile.displayName}!`,
        );
        navigated.current = true;
        goToDestination();
      } else if (mode === "sign-up") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || null } },
        });
        if (authError) throw authError;
        setPassword("");
        if (data.session) {
          setNewProfile(getOnboardingProfile(data.session.user.id, displayName));
        } else {
          // Supabase may deliberately obscure an existing account: do not claim
          // an account was created until we actually receive its session.
          setConfirmationEmail(email.trim());
        }
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: passwordResetRedirectUrl,
        });
        if (authError) throw authError;
        const notice =
          "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.";
        setMessage(notice);
        AccessibilityInfo.announceForAccessibility(notice);
      }
    } catch (cause) {
      reportError(authFailure(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  function finishSignUp(personalize: boolean) {
    if (!newProfile || navigated.current) return;
    navigated.current = true;
    if (personalize) router.replace("/my-tacos");
    else goToDestination();
  }

  const title =
    mode === "sign-in"
      ? "Qué bueno verte"
      : mode === "sign-up"
        ? "Únete a la mesa"
        : "Recupera tu acceso";
  const busyLabel =
    mode === "sign-up"
      ? "Creando tu cuenta…"
      : mode === "sign-in"
        ? "Iniciando sesión…"
        : "Enviando instrucciones…";

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        // Android 15 draws edge-to-edge, so the window no longer resizes for the keyboard.
        behavior="padding"
        style={styles.screen}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {loading ? (
            <ActivityIndicator color={colors.green} accessibilityLabel="Restaurando sesión" />
          ) : newProfile ? (
            <SignUpSuccess
              profile={newProfile}
              onExplore={() => finishSignUp(false)}
              onPersonalize={() => finishSignUp(true)}
            />
          ) : confirmationEmail ? (
            <EmailConfirmation
              email={confirmationEmail}
              onSignIn={() => openAuth("/sign-in")}
              onChangeEmail={() => {
                setConfirmationEmail(null);
                setEmail("");
                setPassword("");
                setError(null);
              }}
            />
          ) : (
            <>
              <Button
                label="Explorar sin cuenta"
                icon="chevron-back"
                variant="ghost"
                disabled={busy}
                onPress={() => router.replace("/")}
              />
              <View style={styles.hero}>
                <Text style={styles.kicker}>TACO HUNT · MONTERREY</Text>
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
                <Text style={styles.subtitle}>
                  {mode === "reset"
                    ? "Te enviaremos un enlace para volver a entrar."
                    : "Guarda tus puestos favoritos y comparte tus reseñas."}
                </Text>
              </View>
              <Card style={styles.form}>
                {mode === "sign-up" && (
                  <Field
                    label="Nombre para mostrar (opcional)"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                    maxLength={80}
                    editable={!busy}
                  />
                )}
                <Field
                  inputRef={emailRef}
                  label="Correo electrónico"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error?.field === "email") setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!busy}
                  error={error?.field === "email" ? error.message : undefined}
                >
                  {error?.accountExists && (
                    <View style={styles.links}>
                      <Button
                        label="Inicia sesión"
                        variant="ghost"
                        onPress={() => openAuth("/sign-in")}
                      />
                      <Button
                        label="Recupera tu contraseña"
                        variant="ghost"
                        onPress={() => openAuth("/reset-password")}
                      />
                    </View>
                  )}
                </Field>
                {mode !== "reset" && (
                  <Field
                    inputRef={passwordRef}
                    label="Contraseña"
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (error?.field === "password") setError(null);
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                    editable={!busy}
                    error={error?.field === "password" ? error.message : undefined}
                  />
                )}
                {error && !error.field ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error.message}
                  </Text>
                ) : null}
                {message ? (
                  <Text accessibilityRole="alert" style={styles.message}>
                    {message}
                  </Text>
                ) : null}
                <Button
                  label={
                    busy
                      ? busyLabel
                      : mode === "sign-in"
                        ? "Iniciar sesión"
                        : mode === "sign-up"
                          ? "Crear cuenta"
                          : "Enviar instrucciones"
                  }
                  loading={busy}
                  size="lg"
                  onPress={() => void submit()}
                />
                {busy && (
                  <Text accessibilityLiveRegion="polite" style={styles.message}>
                    {busyLabel}
                  </Text>
                )}
                {mode === "sign-in" && (
                  <Button
                    label="¿Olvidaste tu contraseña?"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => openAuth("/reset-password")}
                  />
                )}
                <Button
                  label={
                    mode === "sign-up"
                      ? "¿Ya tienes cuenta? Inicia sesión"
                      : mode === "reset"
                        ? "Volver a iniciar sesión"
                        : "¿Primera vez? Crea una cuenta"
                  }
                  variant="ghost"
                  disabled={busy}
                  onPress={() => openAuth(mode === "sign-in" ? "/sign-up" : "/sign-in")}
                />
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  inputRef,
  error,
  children,
  ...props
}: ComponentProps<typeof TextInput> & {
  label: string;
  inputRef?: RefObject<TextInput | null>;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        ref={inputRef}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, error && styles.invalid]}
        accessibilityLabel={label}
        accessibilityHint={error}
      />
      {error && (
        <View style={styles.fieldError}>
          <Ionicons name="alert-circle" size={20} color={colors.dangerText} />
          <Text accessibilityRole="alert" style={styles.fieldErrorText}>
            {error}
          </Text>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.xl, gap: spacing.xxl, flexGrow: 1 },
  hero: { gap: spacing.md },
  kicker: { ...typography.kicker, color: colors.green },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.subtitle, color: colors.muted },
  form: { gap: spacing.lg, padding: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.ink },
  input: {
    minHeight: sizes.headerPill,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.ink,
    ...typography.body,
  },
  invalid: { borderWidth: 2, borderColor: colors.redStrong },
  fieldError: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  fieldErrorText: { ...typography.body, color: colors.dangerText, flex: 1 },
  error: { ...typography.body, color: colors.dangerText },
  message: { ...typography.body, color: colors.green },
  links: { gap: spacing.sm },
});
