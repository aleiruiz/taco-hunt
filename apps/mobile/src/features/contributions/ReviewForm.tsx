import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { createReview, updateReview, type OwnReview, type ReviewInput } from "./api";

const colors = {
  ink: "#302723",
  muted: "#6C5D53",
  red: "#E95032",
  green: "#276C4F",
  paper: "#FFFAF1",
  cream: "#FBF3E6",
  line: "#E8DCCB",
};
const ratingLabels = ["Tortilla", "Relleno", "Salsa", "Relación calidad-precio"] as const;
type Props = {
  session: Session;
  spotTacoId?: string;
  spotName?: string;
  tacoName?: string;
  existing?: OwnReview;
  onSaved: () => void;
};

export function ReviewForm({ session, spotTacoId, spotName, tacoName, existing, onSaved }: Props) {
  const [ratings, setRatings] = useState({
    tortilla: existing?.tortilla ?? 0,
    filling: existing?.filling ?? 0,
    salsa: existing?.salsa ?? 0,
    value: existing?.value ?? 0,
  });
  const [price, setPrice] = useState(
    existing?.pricePaidMxn == null ? "" : String(existing.pricePaidMxn),
  );
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = ["tortilla", "filling", "salsa", "value"] as const;

  async function save() {
    if (
      Object.values(ratings).some((value) => value < 1 || value > 5) ||
      (!existing && !spotTacoId)
    ) {
      setError("Elige una calificación del 1 al 5 en cada categoría.");
      return;
    }
    const priceValue = price.trim() === "" ? undefined : Number(price.replace(",", "."));
    if (priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0)) {
      setError("Escribe un precio válido en pesos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await updateReview(session, existing.id, {
          ...ratings,
          pricePaidMxn: priceValue ?? null,
          body: body.trim() || null,
        });
      } else {
        const input: ReviewInput = {
          spotTacoId: spotTacoId!,
          ...ratings,
          ...(priceValue === undefined ? {} : { pricePaidMxn: priceValue }),
          ...(body.trim() ? { body: body.trim() } : {}),
        };
        await createReview(session, input);
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar tu reseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.kicker}>{existing ? "EDITAR RESEÑA" : "NUEVA RESEÑA"}</Text>
      <Text style={styles.title}>{tacoName ?? existing?.tacoName ?? "Tu taco"}</Text>
      <Text style={styles.subtitle}>{spotName ?? existing?.spotName ?? "Puesto"}</Text>
      <Text style={styles.intro}>
        Tu visita cuenta como experiencia personal; no verificamos ubicación GPS.
      </Text>
      {ratingLabels.map((label, index) => {
        const key = keys[index];
        return (
          <View key={key} style={styles.ratingRow}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${value} de 5`}
                  onPress={() => setRatings((current) => ({ ...current, [key]: value }))}
                  style={styles.starButton}
                >
                  <Text style={[styles.star, value <= ratings[key] && styles.starSelected]}>★</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      <Text style={styles.label}>Precio pagado (opcional)</Text>
      <TextInput
        accessibilityLabel="Precio pagado"
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
        placeholder="$ 0"
        placeholderTextColor="#AD9D8E"
        style={styles.input}
      />
      <Text style={styles.label}>Cuéntale a la comunidad (opcional)</Text>
      <TextInput
        accessibilityLabel="Comentario"
        multiline
        maxLength={500}
        value={body}
        onChangeText={setBody}
        placeholder="Hasta 500 caracteres"
        placeholderTextColor="#AD9D8E"
        style={[styles.input, styles.textarea]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => void save()}
        style={styles.primary}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.primaryText}>{existing ? "Guardar cambios" : "Publicar reseña"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingTop: 58, paddingBottom: 48 },
  kicker: { color: colors.green, fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "900", marginTop: 10 },
  subtitle: { color: colors.muted, fontSize: 16, marginTop: 4 },
  intro: { color: colors.muted, lineHeight: 21, marginTop: 18, marginBottom: 22 },
  ratingRow: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 13 },
  stars: { flexDirection: "row", marginTop: 7 },
  starButton: { minWidth: 42, minHeight: 42, alignItems: "center", justifyContent: "center" },
  star: { color: "#D7C8B8", fontSize: 30 },
  starSelected: { color: colors.red },
  input: {
    minHeight: 50,
    marginTop: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 16,
  },
  textarea: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },
  error: { color: "#A52218", lineHeight: 20, marginTop: 16 },
  primary: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { color: "white", fontWeight: "900", fontSize: 15 },
});
