import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, Button, Card, ProgressBar } from "@/components";
import { avatarNames, type OnboardingProfile } from "@/data/auth-onboarding";
import { colors, spacing, typography } from "@/theme";

export function SignUpSuccess({
  profile,
  onExplore,
  onPersonalize,
}: {
  profile: OnboardingProfile;
  onExplore: () => void;
  onPersonalize: () => void;
}) {
  const title = `¡Listo, ${profile.displayName}! Ya eres parte de la cacería.`;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  return (
    <View style={styles.content}>
      <View
        style={styles.avatar}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Tu avatar: ${avatarNames[profile.avatarPreset]}`}
      >
        <View style={styles.avatarScale}>
          <Avatar size={72} preset={profile.avatarPreset} />
        </View>
        <Icon name="sparkles" size={24} color={colors.redStrong} style={styles.sparkles} />
      </View>
      <Text style={styles.kicker}>CUENTA CREADA</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.body}>
        Te tocó {avatarNames[profile.avatarPreset]}. Puedes cambiarlo cuando quieras.
      </Text>
      <Card style={styles.steps}>
        <Text accessibilityRole="header" style={styles.heading}>
          Tus primeros pasos
        </Text>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Tus primeros pasos"
          accessibilityValue={{ min: 0, max: 4, now: 1, text: "1 de 4 pasos completados" }}
        >
          <Text style={styles.body}>1 de 4 completados</Text>
          <ProgressBar progress={25} />
        </View>
        {[
          { icon: "checkmark-circle" as const, label: "Crear cuenta · listo" },
          {
            icon: "star-outline" as const,
            label: "Califica tu primer taco · insignia Primera mordida",
          },
          { icon: "heart-outline" as const, label: "Guarda un favorito" },
          { icon: "add-circle-outline" as const, label: "Propón una taquería" },
        ].map((step) => (
          <View key={step.label} style={styles.step}>
            <Icon name={step.icon} size={22} color={colors.green} />
            <Text style={styles.stepText}>{step.label}</Text>
          </View>
        ))}
      </Card>
      <Button label="Empezar a explorar" size="lg" onPress={onExplore} />
      <Button label="Personalizar mi perfil" variant="ghost" onPress={onPersonalize} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  avatar: {
    width: 112,
    height: 112,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarScale: { transform: [{ scale: 112 / 72 }] },
  sparkles: { position: "absolute", right: 0, top: 0 },
  kicker: { ...typography.kicker, color: colors.green },
  title: { ...typography.display, color: colors.ink },
  body: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
  heading: { ...typography.sectionTitle, color: colors.ink },
  steps: { gap: spacing.lg, padding: spacing.lg },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepText: { ...typography.body, color: colors.ink, flex: 1 },
});
