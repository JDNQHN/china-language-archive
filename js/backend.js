// Everything the site sends to or reads from the server goes through here.
//
// With BACKEND filled in (js/config.js) it talks to Supabase. Without it, a
// demo stand-in keeps everything in memory so the pages can be tried out
// before a Supabase project exists.
import { BACKEND } from './config.js';

export const isLive = Boolean(BACKEND.supabaseUrl && BACKEND.supabaseAnonKey);

const BUCKET = 'recordings';
const VENDOR_SRC = new URL('./vendor/supabase-2.119.2.js', import.meta.url).href;

// ───────────────────────────────────────────────────────────── Supabase ──
let clientPromise = null;

// The library is kept in js/vendor/ rather than loaded from a CDN, so the site
// doesn't depend on a CDN being reachable (some are blocked in mainland China).
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the Supabase library'));
    document.head.append(s);
  });
}

function client() {
  if (!clientPromise) {
    clientPromise = (window.supabase ? Promise.resolve() : loadScript(VENDOR_SRC))
      .then(() => window.supabase.createClient(BACKEND.supabaseUrl, BACKEND.supabaseAnonKey));
  }
  return clientPromise;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function extFor(type) {
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

const live = {
  async getUser() {
    const sb = await client();
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user : null;
  },

  // Sends a one-time code by email. (No Google/WeChat sign-in: Google is
  // blocked in mainland China, and email works everywhere.)
  async sendCode(email) {
    const sb = await client();
    check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
  },

  async verifyCode(email, code) {
    const sb = await client();
    const data = check(await sb.auth.verifyOtp({ email, token: code, type: 'email' }));
    return data.user;
  },

  async signOut() {
    const sb = await client();
    await sb.auth.signOut();
  },

  async getProfile() {
    const sb = await client();
    const user = await this.getUser();
    if (!user) return null;
    return check(await sb.from('profiles').select('*').eq('id', user.id).maybeSingle());
  },

  async saveProfile(fields) {
    const sb = await client();
    const user = await this.getUser();
    if (!user) throw new Error('Not signed in');
    const { language_id, variety, hometown, age_group } = fields;
    check(await sb.from('profiles').update({ language_id, variety, hometown, age_group }).eq('id', user.id));
  },

  async submitRecording(rec) {
    const sb = await client();
    const user = await this.getUser();
    if (!user) throw new Error('Not signed in');
    const id = crypto.randomUUID();
    const contentType = (rec.blob.type || 'audio/webm').split(';')[0];
    const path = `${user.id}/${id}.${extFor(contentType)}`;
    check(await sb.storage.from(BUCKET).upload(path, rec.blob, { contentType, upsert: false }));
    try {
      check(await sb.from('recordings').insert({
        id,
        prompt_id: rec.promptId,
        language_id: rec.languageId,
        variety: rec.variety || null,
        hometown: rec.hometown || null,
        age_group: rec.ageGroup || null,
        transcription: rec.transcription || null,
        romanisation: rec.romanisation || null,
        audio_path: path,
        duration_ms: rec.durationMs,
        consent: true,
      }));
    } catch (err) {
      // Don't leave an orphaned audio file behind.
      await sb.storage.from(BUCKET).remove([path]);
      throw err;
    }
    return { id, status: 'pending' };
  },

  async listMine() {
    const sb = await client();
    const user = await this.getUser();
    if (!user) return [];
    return check(await sb.from('recordings')
      .select('id, prompt_id, language_id, status, created_at, transcription')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }));
  },
};

// ───────────────────────────────────────────────────────────────── Demo ──
const memory = { user: null, profile: {}, recordings: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const demo = {
  async getUser() { return memory.user; },
  async sendCode() { await wait(400); },
  async verifyCode(email) {
    await wait(300);
    memory.user = { id: 'demo-user', email };
    return memory.user;
  },
  async signOut() { memory.user = null; },
  async getProfile() { return memory.user ? { ...memory.profile } : null; },
  async saveProfile(fields) { Object.assign(memory.profile, fields); },
  async submitRecording(rec) {
    await wait(500);
    const row = {
      id: crypto.randomUUID(),
      prompt_id: rec.promptId,
      language_id: rec.languageId,
      transcription: rec.transcription || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      url: URL.createObjectURL(rec.blob),
    };
    memory.recordings.unshift(row);
    return { id: row.id, status: row.status };
  },
  async listMine() { return memory.recordings.slice(); },
};

export const backend = isLive ? live : demo;
