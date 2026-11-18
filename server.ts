import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const LOCK_FILE_PATH = path.join(__dirname, '.engine-lock.json');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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
  updatedAt: string;
}

const DEFAULT_ANTI_PROMPT =
  "Sibilance, breathy vocals, whispering, airy voice, hissing, background noise, low-fidelity, muffled, harsh treble, whistling 's'";

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
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        hmacSecret: parsed.hmacSecret,
        tokenVersion: parsed.tokenVersion,
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
  const envPass = process.env.ENGINE_ACCESS_PASSWORD?.trim();
  if (!envPass || envPass.length < 6) return;
  if (fs.existsSync(LOCK_FILE_PATH)) return;
  const { salt, hash } = await hashPassword(envPass);
  writeLockStore({
    salt,
    hash,
    hmacSecret: crypto.randomBytes(32).toString('hex'),
    tokenVersion: 1,
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
    if (!store) {
      res.json({
        passwordConfigured: false,
        unlocked: false,
        expiresAt: null,
      });
      return;
    }

    const token = req.header('x-engine-token');
    const check = verifyEngineToken(token, store);
    res.json({
      passwordConfigured: true,
      unlocked: check.valid,
      expiresAt: check.expiresAt,
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

      const { salt, hash } = await hashPassword(password);
      const store: EngineLockStore = {
        salt,
        hash,
        hmacSecret: crypto.randomBytes(32).toString('hex'),
        tokenVersion: 1,
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(store);

      const { token, expiresAt } = issueEngineToken(store);
      res.status(201).json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
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
      res.json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
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
        updatedAt: new Date().toISOString(),
      };
      writeLockStore(updatedStore);

      const { token, expiresAt } = issueEngineToken(updatedStore);
      res.json({
        passwordConfigured: true,
        unlocked: true,
        token,
        expiresAt,
      });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({
        code: 'CHANGE_PASSWORD_FAILED',
        error: 'Failed to update password.',
      });
    }
  });

  app.post('/api/engine-auth/lock', (req: Request, res: Response) => {
    const store = readLockStore();
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
