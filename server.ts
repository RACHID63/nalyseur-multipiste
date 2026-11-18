import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const LOCK_FILE_PATH = path.join(__dirname, '.engine-lock.json');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RECOVERY_EMAIL = (process.env.RECOVERY_EMAIL?.trim() || 'rachid.laieb@gmail.com').toLowerCase();

type AiProvider = 'gemini' | 'deepseek';
type DeepSeekModel = 'deepseek-chat' | 'deepseek-reasoner';
type GeminiThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface TrackInput {
  name: string;
  rhythm: string;
  positions: string;
}

interface GenerateRequestBody {
  provider: AiProvider;
  geminiThinkingLevel?: GeminiThinkingLevel;
  deepseekModel?: DeepSeekModel;
  deepseekTemperature?: number;
  lang: 'fr' | 'en';
  tracks: TrackInput[];
  style: string;
  lyricsLanguage: string;
  voice: string;
  voiceChar: string;
  timeSignature: string;
  theme: string;
  isLongFormat: boolean;
  keepRhythmAsLyrics: boolean;
}

interface SunoResult {
  style: string;
  antiPrompt: string;
  lyrics: string;
}

interface EngineLockStore {
  salt: string;
  hash: string;
  hmacSecret: string;
  tokenVersion: number;
  recoveryEmail: string;
  resetCodeSalt?: string;
  resetCodeHash?: string;
  resetCodeExpiresAt?: number;
  resetAttempts?: number;
  updatedAt: string;
}

const DEFAULT_ANTI_PROMPT =
  "Sibilance, breathy vocals, whispering, airy voice, hissing, background noise, low-fidelity, muffled, harsh treble, whistling 's'";

function isValidEmail(email: string): boolean {
  return email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function emailsEqualTimingSafe(a: string, b: string): boolean {
  const normA = crypto.createHash('sha256').update(a.trim().toLowerCase()).digest();
  const normB = crypto.createHash('sha256').update(b.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(normA, normB);
}

// --- PASSWORD VAULT & TOKEN HELPERS ---
let runtimeFallbackHmacSecret = crypto.randomBytes(32).toString('hex');

function readLockStore(): EngineLockStore | null {
  try {
    if (!fs.existsSync(LOCK_FILE_PATH)) return null;
    const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<EngineLockStore>;
    if (
      typeof parsed.salt === 'string' &&
      typeof parsed.hash === 'string' &&
      typeof parsed.hmacSecret === 'string' &&
      typeof parsed.tokenVersion === 'number'
    ) {
      const storedEmail =
        typeof parsed.recoveryEmail === 'string' && isValidEmail(parsed.recoveryEmail.trim())
          ? parsed.recoveryEmail.trim().toLowerCase()
          : DEFAULT_RECOVERY_EMAIL;

      return {
        salt: parsed.salt,
        hash: parsed.hash,
        hmacSecret: parsed.hmacSecret,
        tokenVersion: parsed.tokenVersion,
        recoveryEmail: storedEmail,
        resetCodeSalt: typeof parsed.resetCodeSalt === 'string' ? parsed.resetCodeSalt : undefined,
        resetCodeHash: typeof parsed.resetCodeHash === 'string' ? parsed.resetCodeHash : undefined,
        resetCodeExpiresAt: typeof parsed.resetCodeExpiresAt === 'number' ? parsed.resetCodeExpiresAt : undefined,
        resetAttempts: typeof parsed.resetAttempts === 'number' ? parsed.resetAttempts : undefined,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeLockStore(store: EngineLockStore): void {
  fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(store, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function hashPassword(password: string, saltHex?: string): Promise<{ salt: string; hash: string }> {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ salt, hash: derivedKey.toString('hex') });
    });
  });
}

async function verifyPassword(password: string, salt: string, expectedHashHex: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  const actualBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expectedHashHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function issueEngineToken(store: EngineLockStore): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payloadObj = {
    v: store.tokenVersion,
    exp: expiresAt,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const secret = store.hmacSecret || runtimeFallbackHmacSecret;
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
  };
}

function verifyEngineToken(token: string | undefined, store: EngineLockStore | null): { valid: boolean; expiresAt: number | null } {
  if (!token || !store) return { valid: false, expiresAt: null };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, expiresAt: null };
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return { valid: false, expiresAt: null };

  const secret = store.hmacSecret || runtimeFallbackHmacSecret;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, expiresAt: null };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      v?: number;
      exp?: number;
    };
    if (payload.v !== store.tokenVersion) {
      return { valid: false, expiresAt: null };
    }
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
      return { valid: false, expiresAt: null };
    }
    return { valid: true, expiresAt: payload.exp };
  } catch {
    return { valid: false, expiresAt: null };
  }
}

// --- RATE LIMITERS ---
const generateRateMap = new Map<string, number[]>();
const authRateMap = new Map<string, number[]>();
const resetRateMap = new Map<string, number[]>();

// --- EMAIL RECOVERY DELIVERY ---
function getEmailTransportStatus(): { configured: boolean; mode: 'smtp' | 'resend' | 'none' } {
  const hasSmtp =
    Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) ||
    Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
  if (hasSmtp) {
    return { configured: true, mode: 'smtp' };
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return { configured: true, mode: 'resend' };
  }
  return { configured: false, mode: 'none' };
}

async function sendPasswordResetEmail(toEmail: string, resetCode: string, lang: 'fr' | 'en'): Promise<void> {
  const transportStatus = getEmailTransportStatus();
  if (!transportStatus.configured) {
    throw new Error('EMAIL_DELIVERY_NOT_CONFIGURED');
  }

  const isFr = lang !== 'en';
  const subject = isFr
    ? 'Code de réinitialisation — Multi-Track Analyzer (Suno AI)'
    : 'Password Reset Code — Multi-Track Analyzer (Suno AI)';

  const textBody = isFr
    ? [
        'Bonjour,',
        '',
        'Vous avez demandé la réinitialisation du mot de passe qui protège la sélection et les clés API IA dans Multi-Track Analyzer.',
        '',
        `Votre code de vérification à usage unique : ${resetCode}`,
        '',
        'Ce code est valable pendant 15 minutes.',
        'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.',
      ].join('\n')
    : [
        'Hello,',
        '',
        'You requested a password reset for the AI engine lock in Multi-Track Analyzer.',
        '',
        `Your single-use verification code: ${resetCode}`,
        '',
        'This code expires in 15 minutes.',
        'If you did not request this reset, you can safely ignore this email.',
      ].join('\n');

  const htmlBody = isFr
    ? `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;color:#0f172a;">
        <h2 style="margin:0 0 12px;color:#1e3a8a;">Réinitialisation du mot de passe IA</h2>
        <p style="font-size:14px;line-height:1.6;">Vous avez demandé à réinitialiser le mot de passe qui verrouille l'accès aux moteurs API (Gemini &amp; DeepSeek) dans <strong>Multi-Track Analyzer</strong>.</p>
        <div style="margin:20px 0;padding:16px;background:#0f172a;color:#fbbf24;border-radius:12px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:4px;">${resetCode}</div>
        <p style="font-size:13px;color:#475569;">Ce code à usage unique expire dans <strong>15 minutes</strong>. Saisissez-le dans l'application pour définir votre nouveau mot de passe.</p>
      </div>`
    : `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;color:#0f172a;">
        <h2 style="margin:0 0 12px;color:#1e3a8a;">AI Engine Password Reset</h2>
        <p style="font-size:14px;line-height:1.6;">You requested a password reset for the AI engine lock (Gemini &amp; DeepSeek) in <strong>Multi-Track Analyzer</strong>.</p>
        <div style="margin:20px 0;padding:16px;background:#0f172a;color:#fbbf24;border-radius:12px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:4px;">${resetCode}</div>
        <p style="font-size:13px;color:#475569;">This single-use code expires in <strong>15 minutes</strong>. Enter it in the application to set a new password.</p>
      </div>`;

  if (transportStatus.mode === 'smtp') {
    const gmailUser = process.env.GMAIL_USER?.trim();
    const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
    const smtpHost = process.env.SMTP_HOST?.trim() || (gmailUser ? 'smtp.gmail.com' : '');
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === 'true' : smtpPort === 465;
    const smtpUser = process.env.SMTP_USER?.trim() || gmailUser || '';
    const smtpPass = process.env.SMTP_PASS?.trim() || gmailPass || '';
    const fromAddr = process.env.SMTP_FROM?.trim() || smtpUser;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: `"Multi-Track Analyzer" <${fromAddr}>`,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return;
  }

  // Resend HTTP API mode
  const resendKey = process.env.RESEND_API_KEY!.trim();
  const resendFrom = process.env.RESEND_FROM?.trim() || 'Multi-Track Analyzer <onboarding@resend.dev>';
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [toEmail],
      subject,
      text: textBody,
      html: htmlBody,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => '');
    console.error('Resend API error:', resendRes.status, errText);
    throw new Error('EMAIL_SEND_FAILED');
  }
}

function checkRateLimit(map: Map<string, number[]>, ip: string, windowMs: number, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = map.get(ip) || [];
  const recent = timestamps.filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    map.set(ip, recent);
    return false;
  }
  recent.push(now);
  map.set(ip, recent);
  return true;
}

function sanitizeText(value: unknown, maxLength: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength);
}

function cleanAndParseJson(raw: string): SunoResult {
  let clean = raw.trim();

  if (clean.startsWith('```')) {
    const firstNewline = clean.indexOf('\n');
    if (firstNewline !== -1) {
      clean = clean.slice(firstNewline + 1);
    } else {
      clean = clean.replace(/^```[a-zA-Z]*/, '');
    }
    clean = clean.replace(/```$/, '').trim();
  }

  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }

  clean = clean.replace(/,(\s*[\]}])/g, '$1');

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const repaired = clean.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (_match, content: string) => {
      const fixedContent = content
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${fixedContent}"`;
    });
    parsed = JSON.parse(repaired);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON structure returned by model.');
  }

  const record = parsed as Record<string, unknown>;
  const style = typeof record.style === 'string' ? record.style.trim() : '';
  const antiPrompt = typeof record.antiPrompt === 'string' && record.antiPrompt.trim()
    ? record.antiPrompt.trim()
    : DEFAULT_ANTI_PROMPT;
  const lyrics = typeof record.lyrics === 'string' ? record.lyrics.trim() : '';

  if (!style || !lyrics) {
    throw new Error('Incomplete generation payload returned by model.');
  }

  return { style, antiPrompt, lyrics };
}

function buildSunoPrompts(input: GenerateRequestBody): { systemInstruction: string; userPrompt: string } {
  const isFr = input.lang === 'fr';
  const instrumentsInfo = input.tracks
    .map((t) => `- ${t.name}: [${t.rhythm}] (${isFr ? 'Position' : 'Position'}: ${t.positions})`)
    .join('\n');

  const systemInstruction = isFr
    ? "Tu es un expert en composition musicale et un pro du logiciel Suno AI. Tu transformes des structures rythmiques en un prompt de STYLE et des PAROLES optimisées pour Suno AI. Réponds uniquement avec un objet JSON valide contenant exactement les clés 'style', 'antiPrompt' et 'lyrics'."
    : "You are a music composition expert and a Suno AI pro. You transform rhythmic structures into a STYLE prompt and optimized LYRICS for Suno AI. Respond only with a valid JSON object containing strictly the keys 'style', 'antiPrompt', and 'lyrics'.";

  const mimicInstruction = input.keepRhythmAsLyrics
    ? (isFr
        ? 'Intégrer les onomatopées rythmiques fournies (comme "DUM", "ta", "ti") de manière fluide dans le texte des paroles chantées.'
        : 'Fluidly integrate the provided rhythmic onomatopoeia (like "DUM", "ta", "ti") directly into the sung lyrics.')
    : (isFr
        ? 'Ne PAS faire prononcer les onomatopées rythmiques par le chanteur dans les paroles chantées ; garde les motifs rythmiques uniquement à l\'intérieur des balises entre crochets [ ].'
        : 'Do NOT write rhythmic onomatopoeia in the sung lyrics; keep rhythmic patterns strictly inside square brackets [ ] as production tags.');

  const userPrompt = `${isFr ? "DONNÉES D'ENTRÉE" : 'INPUT DATA'} :
- ${isFr ? 'Rythmes par instruments' : 'Rhythms by instruments'} :
${instrumentsInfo}
- ${isFr ? 'Style sélectionné' : 'Selected style'} : ${input.style}
- ${isFr ? 'Langue des paroles' : 'Lyrics language'} : ${input.lyricsLanguage}
- ${isFr ? 'Exigence de qualité Vocale (MANDATOIRE)' : 'Vocal Quality Requirement (MANDATORY)'} : "Studio-grade polished vocals, clinically clean voice, powerful forward projection, heavy de-essing, no sibilance, zero breathiness, dry vocal mix, crisp articulation, high-fidelity recording."
- ${isFr ? 'Voix souhaitée' : 'Desired voice'} : ${input.voice}
- ${isFr ? 'Caractéristiques de la voix' : 'Voice characteristics'} : ${input.voiceChar}
- ${isFr ? 'Signature rythmique (Mesure)' : 'Time Signature (Measure)'} : ${input.timeSignature}
- ${isFr ? 'Thème ou émotion' : 'Theme or emotion'} : ${input.theme || (isFr ? 'Non spécifié' : 'Not specified')}
- ${isFr ? 'Format long (Full length)' : 'Long format (Full length)'} : ${input.isLongFormat ? (isFr ? 'Oui' : 'Yes') : (isFr ? 'Non' : 'No')}

${isFr ? "INSTRUCTIONS D'OUTPUT" : 'OUTPUT INSTRUCTIONS'} :
1. **style** : ${isFr ? "Une chaîne de mots-clés en anglais séparés par des virgules, incluant les genres, l'humeur, les instruments, les directives rythmiques extraites ET l'exigence de qualité vocale MANDATOIRE." : 'A comma-separated English string of keywords, including genres, mood, instruments, extracted rhythmic directives AND the MANDATORY vocal quality requirement.'}
2. **antiPrompt** : "${DEFAULT_ANTI_PROMPT}"
3. **lyrics** : ${isFr ? 'Les paroles avec des balises de structure en anglais [Verse], [Chorus], [Bridge], [Outro].' : 'Lyrics with English structure tags [Verse], [Chorus], [Bridge], [Outro].'}
   ${isFr ? 'CONTRAINTES DE FORMATAGE (MANDATOIRE)' : 'FORMATTING CONSTRAINTS (MANDATORY)'} :
   - ${isFr ? 'Intégrer le STYLE de musique et les INSTRUMENTS directement avec leurs motifs rythmiques dans les paroles en utilisant exclusivement des crochets [ ].' : 'Integrate the music STYLE and INSTRUMENTS directly with their rhythmic patterns in the lyrics using ONLY square brackets [ ].'}
   - ${isFr ? 'Format exigé' : 'Required format'} : [Style Instrument_Name Rhythm_Pattern] (example: [Rock Guitar ti ti ta chack]).
   - ${isFr ? 'NE JAMAIS utiliser de parenthèses ( ) pour le style ou toute autre annotation.' : 'NEVER use parentheses ( ) for style or any other annotation.'}
   - ${mimicInstruction}

${isFr ? 'Réponds uniquement au format JSON suivant' : 'Respond only in the following JSON format'} :
{
  "style": "...",
  "antiPrompt": "...",
  "lyrics": "..."
}`;

  return { systemInstruction, userPrompt };
}

async function callGeminiProvider(
  systemInstruction: string,
  userPrompt: string,
  thinkingLevelChoice: GeminiThinkingLevel
): Promise<SunoResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('MISSING_GEMINI_KEY');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const thinkingLevel =
    thinkingLevelChoice === 'LOW'
      ? ThinkingLevel.LOW
      : thinkingLevelChoice === 'MEDIUM'
        ? ThinkingLevel.MEDIUM
        : ThinkingLevel.HIGH;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel,
      },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          style: { type: Type.STRING, description: 'Suno AI style prompt' },
          antiPrompt: { type: Type.STRING, description: 'Suno AI negative prompt' },
          lyrics: { type: Type.STRING, description: 'Structured Suno AI lyrics with bracketed rhythm tags' },
        },
        required: ['style', 'antiPrompt', 'lyrics'],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('EMPTY_MODEL_RESPONSE');
  }

  return cleanAndParseJson(rawText);
}

async function callDeepSeekProvider(
  systemInstruction: string,
  userPrompt: string,
  model: DeepSeekModel,
  temperature: number
): Promise<SunoResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('MISSING_DEEPSEEK_KEY');
  }

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
  };

  if (model === 'deepseek-chat') {
    payload.response_format = { type: 'json_object' };
    payload.temperature = temperature;
  }

  const apiResponse = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000),
  });

  if (!apiResponse.ok) {
    const status = apiResponse.status;
    if (status === 401 || status === 403) {
      throw new Error('INVALID_DEEPSEEK_KEY');
    }
    if (status === 402) {
      throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
    }
    if (status === 429) {
      throw new Error('DEEPSEEK_RATE_LIMITED');
    }
    throw new Error(`DEEPSEEK_UPSTREAM_ERROR_${status}`);
  }

  const data = (await apiResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new Error('EMPTY_MODEL_RESPONSE');
  }

  return cleanAndParseJson(rawText);
}

async function ensureEnvPasswordInitialized(): Promise<void> {
  const existing = readLockStore();
  if (existing) {
    // Ensure recoveryEmail is persisted in .engine-lock.json
    try {
      const raw = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8')) as Partial<EngineLockStore>;
      if (!raw.recoveryEmail || !isValidEmail(raw.recoveryEmail)) {
        writeLockStore({
          ...existing,
          recoveryEmail: DEFAULT_RECOVERY_EMAIL,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {}
    return;
  }

  const envPass = process.env.ENGINE_ACCESS_PASSWORD?.trim();
  if (!envPass || envPass.length < 6) return;
  const { salt, hash } = await hashPassword(envPass);
  writeLockStore({
    salt,
    hash,
    hmacSecret: crypto.randomBytes(32).toString('hex'),
    tokenVersion: 1,
    recoveryEmail: DEFAULT_RECOVERY_EMAIL,
    updatedAt: new Date().toISOString(),
  });
}

async function startServer() {
  await ensureEnvPasswordInitialized();
  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
    next();
  });

  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Safely expose availability flags only — never keys or hashes
  app.get('/api/providers', (_req: Request, res: Response) => {
    res.json({
      gemini: {
        configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        model: 'gemini-4-hydrogen',
      },
      deepseek: {
        configured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
        models: ['deepseek-chat', 'deepseek-reasoner'],
      },
    });
  });

  // --- AI ENGINE PASSWORD PROTECTION ROUTES ---
  app.get('/api/engine-auth/status', (req: Request, res: Response) => {
    const store = readLockStore();
    const delivery = getEmailTransportStatus();
    if (!store) {
      res.json({
        passwordConfigured: false,
        unlocked: false,
        expiresAt: null,
        recoveryEmail: null,
        recoveryEmailMasked: maskEmail(DEFAULT_RECOVERY_EMAIL),
        emailDeliveryConfigured: delivery.configured,
        emailDeliveryMode: delivery.mode,
      });
      return;
    }

    const token = req.header('x-engine-token');
    const check = verifyEngineToken(token, store);
    res.json({
      passwordConfigured: true,
      unlocked: check.valid,
      expiresAt: check.expiresAt,
      recoveryEmail: check.valid ? store.recoveryEmail : null,
      recoveryEmailMasked: maskEmail(store.recoveryEmail),
      emailDeliveryConfigured: delivery.configured,
      emailDeliveryMode: delivery.mode,
    });
  });

  app.post('/api/engine-auth/setup', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(authRateMap, clientIp, 5 * 60_000, 10)) {
      res.status(429).json({
        code: 'AUTH_RATE_LIMITED',
        error: 'Too many authentication attempts. Please wait a few minutes.',
      });
      return;
    }

    try {
      const existing = readLockStore();
      if (existing) {
        res.status(409).json({
          code: 'PASSWORD_ALREADY_SET',
          error: 'A privacy password is already configured. Unlock or change it instead.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const password = typeof body?.password === 'string' ? body.password : '';
      if (password.length < 6 || password.length > 128) {
        res.status(400).json({
          code: 'WEAK_PASSWORD',
          error: 'Password must be between 6 and 128 characters.',
        });
        return;
      }

      const rawEmail = typeof body?.recoveryEmail === 'string' ? body.recoveryEmail.trim().toLowerCase() : '';
      const recoveryEmail = rawEmail ? rawEmail : DEFAULT_RECOVERY_EMAIL;
      if (!isValidEmail(recoveryEmail)) {
        res.status(400).json({
          code: 'INVALID_RECOVERY_EMAIL',
          error: 'Invalid recovery email address.',
        });
        return;
      }

      const { salt, hash } = await hashPassword(password);
      const store: EngineLockStore = {
        salt,
        hash,
        hmacSecret: crypto.randomBytes(32).toString('hex'),
        tokenVersion: 1,
        recoveryEmail,
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(store);

      const { token, expiresAt } = issueEngineToken(store);
      const delivery = getEmailTransportStatus();
      res.status(201).json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
        recoveryEmail: store.recoveryEmail,
        recoveryEmailMasked: maskEmail(store.recoveryEmail),
        emailDeliveryConfigured: delivery.configured,
        emailDeliveryMode: delivery.mode,
      });
    } catch (err) {
      console.error('Setup password error:', err);
      res.status(500).json({
        code: 'SETUP_FAILED',
        error: 'Failed to create privacy password.',
      });
    }
  });

  app.post('/api/engine-auth/unlock', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(authRateMap, clientIp, 5 * 60_000, 10)) {
      res.status(429).json({
        code: 'AUTH_RATE_LIMITED',
        error: 'Too many authentication attempts. Please wait a few minutes.',
      });
      return;
    }

    try {
      const store = readLockStore();
      if (!store) {
        res.status(404).json({
          code: 'PASSWORD_NOT_CONFIGURED',
          error: 'No privacy password has been created yet.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!password || password.length > 128) {
        res.status(401).json({
          code: 'INVALID_PASSWORD',
          error: 'Incorrect password.',
        });
        return;
      }

      const ok = await verifyPassword(password, store.salt, store.hash);
      if (!ok) {
        res.status(401).json({
          code: 'INVALID_PASSWORD',
          error: 'Incorrect password.',
        });
        return;
      }

      const { token, expiresAt } = issueEngineToken(store);
      const delivery = getEmailTransportStatus();
      res.json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
        recoveryEmail: store.recoveryEmail,
        recoveryEmailMasked: maskEmail(store.recoveryEmail),
        emailDeliveryConfigured: delivery.configured,
        emailDeliveryMode: delivery.mode,
      });
    } catch (err) {
      console.error('Unlock password error:', err);
      res.status(500).json({
        code: 'UNLOCK_FAILED',
        error: 'Failed to verify password.',
      });
    }
  });

  app.post('/api/engine-auth/change-password', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(authRateMap, clientIp, 5 * 60_000, 10)) {
      res.status(429).json({
        code: 'AUTH_RATE_LIMITED',
        error: 'Too many authentication attempts. Please wait a few minutes.',
      });
      return;
    }

    try {
      const store = readLockStore();
      if (!store) {
        res.status(404).json({
          code: 'PASSWORD_NOT_CONFIGURED',
          error: 'No privacy password has been created yet.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

      if (!currentPassword || currentPassword.length > 128) {
        res.status(401).json({
          code: 'INVALID_PASSWORD',
          error: 'Current password is incorrect.',
        });
        return;
      }

      const ok = await verifyPassword(currentPassword, store.salt, store.hash);
      if (!ok) {
        res.status(401).json({
          code: 'INVALID_PASSWORD',
          error: 'Current password is incorrect.',
        });
        return;
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        res.status(400).json({
          code: 'WEAK_PASSWORD',
          error: 'New password must be between 6 and 128 characters.',
        });
        return;
      }

      const { salt, hash } = await hashPassword(newPassword);
      const updatedStore: EngineLockStore = {
        salt,
        hash,
        hmacSecret: store.hmacSecret,
        tokenVersion: store.tokenVersion + 1,
        recoveryEmail: store.recoveryEmail,
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(updatedStore);

      const { token, expiresAt } = issueEngineToken(updatedStore);
      const delivery = getEmailTransportStatus();
      res.json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
        recoveryEmail: updatedStore.recoveryEmail,
        recoveryEmailMasked: maskEmail(updatedStore.recoveryEmail),
        emailDeliveryConfigured: delivery.configured,
        emailDeliveryMode: delivery.mode,
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({
        code: 'CHANGE_PASSWORD_FAILED',
        error: 'Failed to update password.',
      });
    }
  });

  app.post('/api/engine-auth/recovery-email', (req: Request, res: Response) => {
    const store = readLockStore();
    if (!store) {
      res.status(404).json({
        code: 'PASSWORD_NOT_CONFIGURED',
        error: 'No privacy password has been created yet.',
      });
      return;
    }

    const tokenCheck = verifyEngineToken(req.header('x-engine-token'), store);
    if (!tokenCheck.valid) {
      res.status(401).json({
        code: 'ENGINE_LOCKED',
        error: 'Unlock the AI engine before modifying the recovery email.',
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const email = typeof body?.recoveryEmail === 'string' ? body.recoveryEmail.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      res.status(400).json({
        code: 'INVALID_RECOVERY_EMAIL',
        error: 'Please provide a valid email address.',
      });
      return;
    }

    const updatedStore: EngineLockStore = {
      ...store,
      recoveryEmail: email,
      updatedAt: new Date().toISOString(),
    };
    writeLockStore(updatedStore);

    res.json({
      recoveryEmail: updatedStore.recoveryEmail,
      recoveryEmailMasked: maskEmail(updatedStore.recoveryEmail),
    });
  });

  app.post('/api/engine-auth/forgot-password', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(resetRateMap, clientIp, 15 * 60_000, 5)) {
      res.status(429).json({
        code: 'RESET_RATE_LIMITED',
        error: 'Too many reset requests. Please wait 15 minutes.',
      });
      return;
    }

    try {
      const store = readLockStore();
      if (!store) {
        res.status(404).json({
          code: 'PASSWORD_NOT_CONFIGURED',
          error: 'No privacy password has been created yet.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const lang: 'fr' | 'en' = body?.lang === 'en' ? 'en' : 'fr';

      if (!isValidEmail(email) || !emailsEqualTimingSafe(email, store.recoveryEmail)) {
        res.status(400).json({
          code: 'RECOVERY_EMAIL_MISMATCH',
          error: 'This email does not match the registered recovery email.',
        });
        return;
      }

      if (!getEmailTransportStatus().configured) {
        res.status(503).json({
          code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
          error: 'Server email delivery is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS (or RESEND_API_KEY) in Settings > Secrets.',
        });
        return;
      }

      const resetCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const { salt: resetCodeSalt, hash: resetCodeHash } = await hashPassword(resetCode);

      const updatedStore: EngineLockStore = {
        ...store,
        resetCodeSalt,
        resetCodeHash,
        resetCodeExpiresAt: Date.now() + RESET_CODE_TTL_MS,
        resetAttempts: 0,
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(updatedStore);

      await sendPasswordResetEmail(store.recoveryEmail, resetCode, lang);

      res.json({
        sent: true,
        recoveryEmailMasked: maskEmail(store.recoveryEmail),
        expiresInMinutes: 15,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'EMAIL_SEND_FAILED';
      if (code === 'EMAIL_DELIVERY_NOT_CONFIGURED') {
        res.status(503).json({
          code,
          error: 'Server email delivery is not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS (or RESEND_API_KEY) in Settings > Secrets.',
        });
        return;
      }
      console.error('Forgot password error:', err);
      res.status(502).json({
        code: 'EMAIL_SEND_FAILED',
        error: 'Failed to send recovery email. Check your SMTP/Resend credentials.',
      });
    }
  });

  app.post('/api/engine-auth/reset-password', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(authRateMap, clientIp, 15 * 60_000, 10)) {
      res.status(429).json({
        code: 'AUTH_RATE_LIMITED',
        error: 'Too many authentication attempts. Please wait a few minutes.',
      });
      return;
    }

    try {
      const store = readLockStore();
      if (!store) {
        res.status(404).json({
          code: 'PASSWORD_NOT_CONFIGURED',
          error: 'No privacy password has been created yet.',
        });
        return;
      }

      const body = req.body as Record<string, unknown>;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
      const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

      if (!isValidEmail(email) || !emailsEqualTimingSafe(email, store.recoveryEmail)) {
        res.status(400).json({
          code: 'RECOVERY_EMAIL_MISMATCH',
          error: 'This email does not match the registered recovery email.',
        });
        return;
      }

      if (!store.resetCodeSalt || !store.resetCodeHash || !store.resetCodeExpiresAt) {
        res.status(400).json({
          code: 'NO_ACTIVE_RESET_CODE',
          error: 'No active reset code. Request a new recovery email first.',
        });
        return;
      }

      if (Date.now() > store.resetCodeExpiresAt) {
        writeLockStore({
          ...store,
          resetCodeSalt: undefined,
          resetCodeHash: undefined,
          resetCodeExpiresAt: undefined,
          resetAttempts: undefined,
          updatedAt: new Date().toISOString(),
        });
        res.status(400).json({
          code: 'RESET_CODE_EXPIRED',
          error: 'The verification code has expired. Request a new email.',
        });
        return;
      }

      const attempts = store.resetAttempts || 0;
      if (attempts >= 5) {
        writeLockStore({
          ...store,
          resetCodeSalt: undefined,
          resetCodeHash: undefined,
          resetCodeExpiresAt: undefined,
          resetAttempts: undefined,
          updatedAt: new Date().toISOString(),
        });
        res.status(429).json({
          code: 'RESET_TOO_MANY_ATTEMPTS',
          error: 'Too many incorrect codes. Request a new recovery email.',
        });
        return;
      }

      const codeOk = code.length > 0 && (await verifyPassword(code, store.resetCodeSalt, store.resetCodeHash));
      if (!codeOk) {
        const nextAttempts = attempts + 1;
        writeLockStore({
          ...store,
          resetCodeSalt: nextAttempts >= 5 ? undefined : store.resetCodeSalt,
          resetCodeHash: nextAttempts >= 5 ? undefined : store.resetCodeHash,
          resetCodeExpiresAt: nextAttempts >= 5 ? undefined : store.resetCodeExpiresAt,
          resetAttempts: nextAttempts >= 5 ? undefined : nextAttempts,
          updatedAt: new Date().toISOString(),
        });
        res.status(401).json({
          code: 'INVALID_RESET_CODE',
          error: 'Invalid verification code.',
        });
        return;
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        res.status(400).json({
          code: 'WEAK_PASSWORD',
          error: 'New password must be between 6 and 128 characters.',
        });
        return;
      }

      const { salt, hash } = await hashPassword(newPassword);
      const updatedStore: EngineLockStore = {
        salt,
        hash,
        hmacSecret: store.hmacSecret,
        tokenVersion: store.tokenVersion + 1,
        recoveryEmail: store.recoveryEmail,
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(updatedStore);

      const { token, expiresAt } = issueEngineToken(updatedStore);
      const delivery = getEmailTransportStatus();
      res.json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
        recoveryEmail: updatedStore.recoveryEmail,
        recoveryEmailMasked: maskEmail(updatedStore.recoveryEmail),
        emailDeliveryConfigured: delivery.configured,
        emailDeliveryMode: delivery.mode,
      });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({
        code: 'RESET_FAILED',
        error: 'Failed to reset password.',
      });
    }
  });

  app.post('/api/engine-auth/lock', (req: Request, res: Response) => {
    const store = readLockStore();
    const delivery = getEmailTransportStatus();
    if (store) {
      const check = verifyEngineToken(req.header('x-engine-token'), store);
      if (check.valid) {
        writeLockStore({
          ...store,
          tokenVersion: store.tokenVersion + 1,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    res.json({
      passwordConfigured: Boolean(store),
      unlocked: false,
      expiresAt: null,
      recoveryEmail: null,
      recoveryEmailMasked: maskEmail(store ? store.recoveryEmail : DEFAULT_RECOVERY_EMAIL),
      emailDeliveryConfigured: delivery.configured,
      emailDeliveryMode: delivery.mode,
    });
  });

  app.post('/api/generate', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(generateRateMap, clientIp, 60_000, 30)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        error: 'Too many requests. Please wait a minute before generating again.',
      });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ code: 'INVALID_BODY', error: 'Invalid request payload.' });
        return;
      }

      const provider: AiProvider = body.provider === 'deepseek' ? 'deepseek' : 'gemini';

      // Enforce privacy password lock on AI engine selection & execution (Gemini & DeepSeek)
      const store = readLockStore();
      if (!store) {
        res.status(403).json({
          code: 'PASSWORD_SETUP_REQUIRED',
          error: 'Create a privacy password before executing any AI engine.',
        });
        return;
      }
      const tokenCheck = verifyEngineToken(req.header('x-engine-token'), store);
      if (!tokenCheck.valid) {
        res.status(401).json({
          code: 'ENGINE_LOCKED',
          error: 'The AI engine is password-protected. Unlock it before executing.',
        });
        return;
      }

      const geminiThinkingLevel: GeminiThinkingLevel =
        body.geminiThinkingLevel === 'LOW'
          ? 'LOW'
          : body.geminiThinkingLevel === 'MEDIUM'
            ? 'MEDIUM'
            : 'HIGH';
      const deepseekModel: DeepSeekModel =
        body.deepseekModel === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
      const rawTemp = typeof body.deepseekTemperature === 'number' ? body.deepseekTemperature : 0.7;
      const deepseekTemperature = Math.max(0, Math.min(1.5, Number.isFinite(rawTemp) ? rawTemp : 0.7));
      const lang: 'fr' | 'en' = body.lang === 'en' ? 'en' : 'fr';

      if (!Array.isArray(body.tracks) || body.tracks.length === 0 || body.tracks.length > 24) {
        res.status(400).json({ code: 'INVALID_TRACKS', error: 'Invalid tracks array.' });
        return;
      }

      const tracks: TrackInput[] = body.tracks
        .map((item) => {
          const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            name: sanitizeText(t.name, 120, 'Instrument'),
            rhythm: sanitizeText(t.rhythm, 400, ''),
            positions: sanitizeText(t.positions, 120, 'AI'),
          };
        })
        .filter((t) => t.rhythm.length > 0);

      if (tracks.length === 0) {
        res.status(400).json({ code: 'NO_RHYTHM', error: 'At least one track must contain a rhythm pattern.' });
        return;
      }

      const validatedInput: GenerateRequestBody = {
        provider,
        geminiThinkingLevel,
        deepseekModel,
        deepseekTemperature,
        lang,
        tracks,
        style: sanitizeText(body.style, 800, 'Pop'),
        lyricsLanguage: sanitizeText(body.lyricsLanguage, 60, 'Français'),
        voice: sanitizeText(body.voice, 120, 'Auto'),
        voiceChar: sanitizeText(body.voiceChar, 120, 'Balanced'),
        timeSignature: sanitizeText(body.timeSignature, 80, '4/4'),
        theme: sanitizeText(body.theme, 500, ''),
        isLongFormat: Boolean(body.isLongFormat),
        keepRhythmAsLyrics: Boolean(body.keepRhythmAsLyrics),
      };

      const { systemInstruction, userPrompt } = buildSunoPrompts(validatedInput);

      const generated =
        provider === 'deepseek'
          ? await callDeepSeekProvider(systemInstruction, userPrompt, deepseekModel, deepseekTemperature)
          : await callGeminiProvider(systemInstruction, userPrompt, geminiThinkingLevel);

      res.json({
        ...generated,
        providerUsed: provider,
        modelUsed: provider === 'deepseek' ? deepseekModel : 'gemini-4-hydrogen',
      });
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : 'UNKNOWN_ERROR';

      if (code === 'MISSING_DEEPSEEK_KEY') {
        res.status(503).json({
          code,
          error: 'DEEPSEEK_API_KEY is not configured on the server. Add it in Settings > Secrets.',
        });
        return;
      }
      if (code === 'INVALID_DEEPSEEK_KEY') {
        res.status(401).json({
          code,
          error: 'DeepSeek API key was rejected. Check DEEPSEEK_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (code === 'DEEPSEEK_INSUFFICIENT_BALANCE') {
        res.status(402).json({
          code,
          error: 'DeepSeek account balance is insufficient.',
        });
        return;
      }
      if (code === 'DEEPSEEK_RATE_LIMITED') {
        res.status(429).json({
          code,
          error: 'DeepSeek API rate limit reached. Please try again shortly.',
        });
        return;
      }
      if (code === 'MISSING_GEMINI_KEY') {
        res.status(503).json({
          code,
          error: 'GEMINI_API_KEY is not configured on the server. Check Settings > Secrets.',
        });
        return;
      }

      console.error('Generation route error:', code);
      res.status(500).json({
        code: 'GENERATION_FAILED',
        error: 'Failed to generate arrangement. Please try again.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
