import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Button, Card } from "@/components";
import { colors, spacing, typography } from "@/theme";

export function ReviewSignInPrompt({
  returnTo,
  loading,
  editing = false,
}: {
  returnTo: string;
  loading: boolean;
  editing?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      {loading ? (
        <ActivityIndicator color={colors.green} accessibilityLabel="Restaurando sesión" />
      ) : (
        <Card style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Tu opinión cuenta
          </Text>
          <Text style={styles.body}>
            Inicia sesión para {editing ? "editar tu reseña" : "escribir una reseña"}. Te llevaremos
            de vuelta a este taco.
          </Text>
          <Link href={{ pathname: "/sign-in", params: { returnTo } }} asChild>
            <Button label="Iniciar sesión" accessibilityRole="link" />
          </Link>
          <Link href={{ pathname: "/sign-up", params: { returnTo } }} asChild>
            <Button label="Crear una cuenta" variant="ghost" accessibilityRole="link" />
          </Link>
          <Link href="/" asChild>
            <Button label="Seguir explorando" variant="ghost" accessibilityRole="link" />
          </Link>
        </Card>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.xl, justifyContent: "center" },
  card: { gap: spacing.lg },
  title: { ...typography.display, color: colors.ink },
  body: { ...typography.body, color: colors.muted },
});
