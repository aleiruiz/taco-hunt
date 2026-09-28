import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const authConfigured = Boolean(supabaseUrl && supabaseKey);
export const passwordResetRedirectUrl = "tacohunt://update-password";

export const supabase = createClient(
  supabaseUrl || "http://127.0.0.1:55421",
  supabaseKey || "missing-publishable-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
