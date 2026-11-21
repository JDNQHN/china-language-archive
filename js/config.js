// Feature switches. Flip these to turn parts of the page on or off.
export const FEATURES = {
  // Side panel with a language's description, varieties and recordings.
  // Slides in when a language is clicked; hidden while nothing is selected.
  detailPanel: true,
};

// Supabase project used for sign-in, recordings and audio storage.
// Both values are on the Supabase dashboard under Project Settings → API.
// The anon key is meant to be public: the row-level rules in
// supabase/schema.sql decide what each visitor can read and write.
//
// Leave them empty to run the contribute page in demo mode: everything works,
// but nothing leaves the browser and recordings vanish on reload.
export const BACKEND = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
