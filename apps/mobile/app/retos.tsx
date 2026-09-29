import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/theme";
import { Card } from "@/components/Card";
import { ProgressBar } from "@/components/ProgressBar";
import { BadgeMedal } from "@/components/BadgeMedal";
import { getFixtureProgress } from "@/data/progress";

export default function RetosScreen() {
  const progress = getFixtureProgress();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Link href="/settings" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Volver a ajustes"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={16} color={colors.green} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
      </Link>
      <Text style={styles.kicker}>TU PROGRESO</Text>
      <Text style={styles.title}>Retos e insignias</Text>

      {progress.nextChallenge && (
        <View style={styles.nextChallengeCard}>
          <Text style={styles.nextChallengeLabel}>PRÓXIMO RETO</Text>
          <Text style={styles.nextChallengeTitle}>{progress.nextChallenge.label}</Text>
          <ProgressBar progress={progress.nextChallenge.progress} color={colors.gold} />
        </View>
      )}

      <Text style={styles.section}>Insignias</Text>
      <View style={styles.grid}>
        {progress.badges.map((badge) => (
          <BadgeMedal
            key={badge.id}
            icon={badge.icon as never}
            label={badge.label}
            earned={badge.earned}
            progress={badge.progress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: 22, paddingTop: 56, paddingBottom: 44 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, marginBottom: 24 },
  backText: { color: colors.green, fontSize: 15, fontWeight: "800" },
  kicker: { ...typography.kicker, color: colors.green },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 10 },
  nextChallengeCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.ink,
    gap: spacing.sm,
  },
  nextChallengeLabel: { ...typography.kicker, color: colors.gold },
  nextChallengeTitle: { color: colors.paper, fontSize: 16, fontWeight: "800" },
  section: {
    ...typography.sectionTitle,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
});
