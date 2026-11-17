import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

type AiProvider = 'gemini' | 'deepseek';
type DeepSeekModel = 'deepseek-chat' | 'deepseek-reasoner';

interface TrackInput {
  name: string;
  rhythm: string;
  positions: string;
}

interface GenerateRequestBody {
  provider: AiProvider;
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

const DEFAULT_ANTI_PROMPT =
  "Sibilance, breathy vocals, whispering, airy voice, hissing, background noise, low-fidelity, muffled, harsh treble, whistling 's'";

// Simple sliding-window rate limiter per IP for /api/generate
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitMap.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
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

  // Extract outermost JSON object if wrapped in commentary
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

async function callGeminiProvider(systemInstruction: string, userPrompt: string): Promise<SunoResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error('MISSING_GEMINI_KEY');
    throw err;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: userPrompt,
    config: {
      systemInstruction,
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
    const err = new Error('MISSING_DEEPSEEK_KEY');
    throw err;
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

async function startServer() {
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

  // Safely expose availability flags only — never keys or prefixes
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

  app.post('/api/generate', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(clientIp)) {
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
          : await callGeminiProvider(systemInstruction, userPrompt);

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
