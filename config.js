// Supabase connection. Leave both empty to run the panel offline-only on one device.
// Values: Supabase dashboard → Project Settings → API ("Project URL" and the "anon public" key).
// The anon key is meant to be public; the data is protected by login + row level security.
window.MOSSO_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
