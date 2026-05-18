/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Music, Share2, Send, Activity, Drum, Cpu, RefreshCw, AlertCircle, FileCode, LayoutDashboard, Copy, Check, Clock, Upload, Plus, Trash2, Mic2, Dices, Mic, Download, Info, Music4, Zap, Waves, Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURATION GEMINI ---
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Track {
  id: number;
  name: string;
  customName: string;
  rhythm: string;
  timelinePositions: string[];
  warningMsg: string;
  progress: number;
  processingState: 'idle' | 'decoding' | 'analyzing' | 'done';
  midiDataUrl: string | null;
  midiFileName: string;
}

// Helper to visualize rhythm patterns
const RhythmVisualizer = ({ rhythm }: { rhythm: string }) => {
  if (!rhythm || rhythm.trim() === "") return null;

  // Simple parsing: split by common separators but keep words
  const tokens = rhythm.split(/[\s,.]+/).filter(t => t.length > 0);

  return (
    <div className="flex flex-wrap items-end gap-1.5 min-h-[44px] p-4 bg-neutral-50/40 rounded-2xl border border-neutral-100 mt-2">
      {tokens.map((token, idx) => {
        let height = 8;
        let color = "bg-neutral-200";
        
        const cleanToken = token.toLowerCase();
        if (cleanToken.includes("dum")) {
          height = 28;
          color = "bg-gradient-to-t from-orange-600 to-orange-400 shadow-[0_4px_12px_rgba(234,88,12,0.25)]";
        } else if (cleanToken.includes("ta")) {
          height = 18;
          color = "bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_4px_10px_rgba(245,158,11,0.15)]";
        } else if (cleanToken.includes("ti")) {
          height = 12;
          color = "bg-gradient-to-t from-orange-400 to-orange-200 shadow-[0_4px_8px_rgba(251,146,60,0.1)]";
        } else if (cleanToken.includes("tch") || cleanToken.includes("k")) {
          height = 15;
          color = "bg-gradient-to-t from-yellow-500 to-yellow-200";
        }

        return (
          <div key={idx} className="flex flex-col items-center gap-1 group relative">
            <motion.div 
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: idx * 0.03, type: "spring", stiffness: 300, damping: 20 }}
              className={`w-3.5 rounded-full ${color} origin-bottom transition-all duration-300`}
              style={{ height: `${height}px` }}
            />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-10">
              <div className="bg-white text-neutral-900 shadow-2xl text-[10px] px-2 py-1 rounded-lg font-bold border border-neutral-100">
                {token}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Helper to get image URL based on instrument name
const getInstrumentImage = (name: string) => {
  const images: Record<string, string> = {
    // Français
    "Drum kit classique": "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&q=80&w=400",
    "Boîte à rythmes (808)": "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=80&w=400",
    "Piano à queue": "https://images.unsplash.com/photo-1520529618057-010375535384?auto=format&fit=crop&q=80&w=400",
    "Piano électrique": "https://images.unsplash.com/photo-1594623930572-300a3011d9ae?auto=format&fit=crop&q=80&w=400",
    "Synthétiseur": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400",
    "Guitare électrique": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=400",
    "Guitare acoustique": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=80&w=400",
    "Saxophone": "https://images.unsplash.com/photo-1528391061990-17d40393098b?auto=format&fit=crop&q=80&w=400",
    "Violon": "https://images.unsplash.com/photo-1460039230329-eb0f8a48f1f5?auto=format&fit=crop&q=80&w=400",
    "Violoncelle": "https://images.unsplash.com/photo-1516057759573-f73b183d363e?auto=format&fit=crop&q=80&w=400",
    "Trompette": "https://images.unsplash.com/photo-1573871666457-7c7329118cf9?auto=format&fit=crop&q=80&w=400",
    "Basse électrique": "https://images.unsplash.com/photo-1445314737020-7589ed9472e3?auto=format&fit=crop&q=80&w=400",
    "Shaker": "https://images.unsplash.com/photo-1543443258-92b04ad5ecf1?auto=format&fit=crop&q=80&w=400",
    "Triangle": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400",
    "Derbouka": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400",
    "Oud": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400",
    // English
    "Classic Drum Kit": "https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?auto=format&fit=crop&q=80&w=400",
    "Drum Machine (808)": "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=80&w=400",
    "Grand Piano": "https://images.unsplash.com/photo-1520529618057-010375535384?auto=format&fit=crop&q=80&w=400",
    "Electric Piano": "https://images.unsplash.com/photo-1594623930572-300a3011d9ae?auto=format&fit=crop&q=80&w=400",
    "Synthesizer": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400",
    "Electric Guitar": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=400",
    "Acoustic Guitar": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=80&w=400",
    "Electric Bass": "https://images.unsplash.com/photo-1445314737020-7589ed9472e3?auto=format&fit=crop&q=80&w=400",
    "Darbuka": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400"
  };
  return images[name] || "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=400";
};

const App = () => {
  const [currentLang, setCurrentLang] = useState<'fr' | 'en'>('fr');

  const t = {
    fr: {
      appName: "Application de Reconnaissance de Rythme Pro",
      help: "Aide",
      shareTitle: "Multi-Track Analyzer",
      shareText: "Analyseur de Rythme & Arrangements pour Suno AI",
      shareCopied: "Lien copié dans le presse-papier !",
      heroTitle: "Multi-Track Analyzer",
      heroSubtitle: "Expertise Rythmique & Arrangement pour Suno AI.",
      sequencerTitle: "Séquenceur d'Instruments",
      addTrack: "Ajouter une piste",
      trackNum: "Piste",
      instrumentChoice: "Choix de l'instrument",
      rhythmTools: "Motif Rythmique & Outils",
      rhythmPlaceholder: "Ex: DUM... ta:ta:ta...",
      randomRhythmTitle: "Générer un rythme au hasard",
      extractRhythmTitle: "Extraire le rythme d'un fichier audio",
      transcribeMidiTitle: "Transcrire l'audio en MIDI",
      positions: "Positions",
      posAI: "IA",
      posStart: "Début",
      posMiddle: "Milieu",
      posEnd: "Fin",
      posAll: "Tout",
      extractionMsg: "Extraction rapide du rythme en cours...",
      decodingMsg: "Décodage audio lourd pour le MIDI (étape 1/2)...",
      midiProcessingMsg: "Création du Fichier MIDI en cours (étape 2/2)...",
      extractionSuccess: "Rythme extrait avec succès !",
      midiSuccess: "Succès ! Transcription MIDI terminée.",
      midiLimitMsg: "Succès (Limité à 3 minutes pour préserver la mémoire).",
      midiDownload: "TÉLÉCHARGER MIDI",
      globalParams: "Paramètres Globaux du Morceau",
      longFormat: "Format Long",
      rhythmInLyrics: "Rythme dans paroles",
      measureTempo: "Mesure & Tempo",
      musicalStyle: "Style Musical",
      customStylePlaceholder: "Décrivez votre style (ex: Jazz-Punk, Techno-Flute...)",
      voiceType: "Type de Voie",
      characteristics: "Caractéristiques",
      lyricsLanguage: "Langue",
      themeLyrics: "Thème / Paroles",
      themePlaceholder: "Ex. L'Espace...",
      generateButton: "Générer l'Arrangement pour Suno AI",
      generating: "ANALYSE EXPERTE EN COURS...",
      errorWaitAudio: "Veuillez attendre la fin du traitement audio avant de générer.",
      errorNoRhythm: "Veuillez entrer au moins un motif rythmique pour l'un des instruments.",
      errorGemini: "Désolé, une erreur est survenue lors de la génération avec Gemini. Vérifiez votre connexion ou réessayez.",
      errorFileSize: "Fichier gigantesque ({{size}} Mo). La limite extrême de protection est de 150 Mo.",
      errorDecoding: "Erreur de décodage du fichier audio.",
      stylePrompt: "Style Prompt",
      antiPrompt: "Anti-Prompt (Négatif)",
      lyricsArrangement: "Paroles & Arrangement",
      reactionQuestion: "Que pensez-vous de cet arrangement ?",
      reactionFeedback: "Merci pour votre retour ! Style & Lyrics validés [réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261].",
      helpTitle: "Guide d'Utilisation",
      helpClose: "C'EST COMPRIS",
      help1Title: "Architecture Rythmique",
      help1Body: "Tapez vos motifs avec DUM (basse), ta (médium) et ti (aigu). Visualisez-les en temps réel grâce aux barres dynamiques.",
      help2Title: "Intelligence & Outils Rythmiques",
      help2BodyIntro: "Chaque piste dispose d'outils intelligents pour créer votre rythme :",
      help2Random: "Hasard : Génère une inspiration rythmique aléatoire.",
      help2Extract: "Audio → Rythme : Extrait le motif d'un fichier audio chargé.",
      help2Midi: "Audio → MIDI : Transcrit votre audio en fichier MIDI complet.",
      helpImportTitle: "Importation Complète (IA)",
      helpImportBody: "Utilisez le bouton 'Importer une musique complète' pour charger un fichier audio entier. L'IA analysera le morceau pour détecter automatiquement tous les instruments, extraire leurs patterns rythmiques et capturer les paroles.",
      help3Title: "Style, Voix & Émotion",
      help3Body: "Personnalisez l'âme de votre morceau : choisissez parmi des dizaines de Styles (Techno, Rock, Industrial Pop...), configurez le Chant (Duo, Robotique, Soul...) ainsi que les Caractéristiques voix (Grave, Aigu, Sensuel...).",
      help4Title: "Positionnement Temporel",
      help4Body: "Utilisez les cases à cocher sur chaque piste pour décider quand l'instrument intervient : Début, Milieu, Fin ou sur Tout le morceau. L'option IA laisse l'algorithme décider de l'arrangement idéal.",
      help5Title: "Langues & Paroles",
      help5Body: "Générez des paroles en Français, Anglais ou en version Bilingue. Cochez Rythme dans paroles pour que Suno intègre vos onomatopées rythmiques comme percussions vocales.",
      helpGeminiTitle: "Génération Gemini AI",
      helpGeminiBody: "L'IA fusionne toutes vos pistes et réglages pour créer un prompt Suno AI cohérent, structuré avec balises [Verse] / [Chorus] et des paroles thématiques.",
      importFullMusic: "Importer une musique complète",
      importingMusic: "Analyse intelligente de la musique...",
      importSuccess: "Analyse complète terminée ! Les pistes ont été configurées.",
      lyricsLabel: "Paroles du morceau (Extraites via IA)",
      joinedBy: "Rejoint par +12,400 compositeurs",
      sessions: "Vos Sessions",
      totalGenerations: "Générations Totales",
      copySuccess: "Copié !",
      noneRhythmDetected: "Aucun rythme clair détecté.",
      personnalise: "Personnalisé...",
      styleLaisseIA: "Laisse l'IA choisir le meilleur style",
      voixLaisseIA: "Laisse l'IA choisir la voix",
      charLaisseIA: "Par défaut (Équilibrée)",
      posLabels: {
        AI: "Géré par l'IA",
        Full: "Tout au long",
        Start: "Au début",
        Middle: "Au milieu",
        End: "À la fin"
      },
      reactions: [
        { emoji: "🔥", label: "Incendie" },
        { emoji: "💎", label: "Pépite" },
        { emoji: "🎹", label: "Mélodique" },
        { emoji: "🥁", label: "Rythmique" },
        { emoji: "👍", label: "Top" },
        { emoji: "😎", label: "Stylé" },
        { emoji: "😱", label: "Incroyable" }
      ],
      styleOptions: [
        { group: "Suno AI Auto", options: ["Laisse l'IA choisir le meilleur style"] },
        { group: "Électronique / Dance", options: ["Synthwave", "Techno", "House", "Trance", "Dubstep", "EDM", "Lo-Fi Beats", "Industrial Pop (Gesaffelstein style)"] },
        { group: "Rock / Metal", options: ["Pop-Rock", "Hard Rock", "Heavy Metal", "Nu-Metal", "Punk Rock", "Math Rock"] },
        { group: "Urbain / Hip-Hop", options: ["Hip-Hop Old School", "Trap", "Drill", "RnB", "Reggaeton", "Afrobeat"] },
        { group: "Pop / Variété", options: ["Pop", "Synth-Pop", "K-Pop", "Chanson Française", "Indie Pop"] },
        { group: "Acoustique / Traditionnel", options: ["Jazz", "Blues", "Folk", "Country", "Bossa Nova", "Classique Orchestral"] },
        { group: "Ambiance / Cinématique", options: ["Cinematic Epic", "Dark Ambient", "Synthwave Chill", "Musique de jeu vidéo (8-bit)"] },
        { group: "Monde / Oriental", options: ["Oriental / Moyen-Orient", "Chaâbi", "Rai", "Mahraganat"] },
        { group: "Autre", options: ["Personnalisé..."] }
      ],
      instrumentOptions: [
        { group: "Batterie & Percussions", options: ["Drum kit classique", "Boîte à rythmes (808)", "Percussions latines", "Timbales", "Shaker", "Triangle"] },
        { group: "Instruments Orientaux", options: ["Derbouka", "Oud", "Qanun", "Daf", "Ney", "Bendir"] },
        { group: "Basses", options: ["Basse électrique", "Contrebasse", "Synthé Bass", "Sub-bass"] },
        { group: "Claviers & Synthés", options: ["Piano à queue", "Piano électrique", "Synthétiseur", "Orgue"] },
        { group: "Guitares & Cordes", options: ["Guitare acoustique", "Guitare électrique", "Violon", "Violoncelle"] },
        { group: "Vents & Cuivres", options: ["Saxophone", "Trompette", "Flûte", "Cuivres (Brass)"] },
        { group: "Autre", options: ["Instrument Personnalisé..."] }
      ],
      voiceOptions: [
        { group: "Suno AI Auto", options: ["Laisse l'IA choisir la voix"] },
        { group: "Genre & Âge", options: ["Voix d'Homme", "Voix de Femme", "Voix d'Enfant", "Duo (Homme & Femme)", "Chorale"] },
        { group: "Styles Populaires", options: ["Claire (Pop standard)", "Éraillée / Rock (Raspy)", "Suave / Jazz (Smooth)", "Soul puissante"] },
        { group: "Styles Originaux & Effets", options: ["Robotique (Vocoder / Auto-tune)", "Lyrique / Opéra", "Murmure / Chuchotement", "Voix au Mégaphone", "Slam / Spoken Word"] }
      ],
      timeSignatureOptions: [
        { group: "Standard (Binaire)", options: ["4/4 (Standard Pop/Rock)", "2/4 (Marche / Rapide)"] },
        { group: "Rythmes Composés (Ternaire)", options: ["6/8 (Rythme composé / Balancement)", "12/8 (Blues / Slow Rock)", "9/8 (Composé complexe)"] },
        { group: "Danses & Asymétriques", options: ["3/4 (Valse)", "5/4 (Jazz asymétrique)", "7/8 (Prog Rock)"] }
      ],
      voiceCharOptions: [
        { group: "Suno AI Auto", options: ["Par défaut (Équilibrée)"] },
        { group: "Registres", options: ["Grave / Bass", "Bariton", "Ténor", "Alto", "Soprano / Aigu"] },
        { group: "Textures & Émotions", options: ["Douce & Délicate", "Énergique & Puissante", "Mélancolique", "Agressive", "Sensuelle", "Vibrante / Tremolo", "Sèche / Dry"] }
      ],
      languageOptions: [
        { label: "Français", value: "Français" },
        { label: "Italien", value: "Italien" },
        { label: "Espagnol", value: "Espagnol" },
        { label: "Portugais", value: "Portugais" },
        { label: "Anglais", value: "Anglais" },
        { label: "Allemand", value: "Allemand" },
        { label: "Néerlandais", value: "Néerlandais" },
        { label: "Arabe", value: "Arabe" },
        { label: "Turc", value: "Turc" },
        { label: "Chinois", value: "Chinois" },
        { label: "Japonais", value: "Japonais" },
        { label: "Russe", value: "Russe" },
        { label: "Polonais", value: "Polonais" },
        { label: "Tzigane", value: "Tzigane" },
        { label: "Indien", value: "Indien" },
        { label: "Coréen", value: "Coréen" },
        { label: "Indonésien", value: "Indonésien" },
        { label: "Philippin", value: "Philippin" }
      ]
    },
    en: {
      appName: "Pro Rhythm Recognition App",
      help: "Help",
      shareTitle: "Multi-Track Analyzer",
      shareText: "Rhythm Analyzer & Arrangements for Suno AI",
      shareCopied: "Link copied to clipboard!",
      heroTitle: "Multi-Track Analyzer",
      heroSubtitle: "Rhythmic Expertise & Arrangement for Suno AI.",
      sequencerTitle: "Instrument Sequencer",
      addTrack: "Add a track",
      trackNum: "Track",
      instrumentChoice: "Instrument Choice",
      rhythmTools: "Rhythmic Pattern & Tools",
      rhythmPlaceholder: "Ex: DUM... ta:ta:ta...",
      randomRhythmTitle: "Generate random rhythm",
      extractRhythmTitle: "Extract rhythm from audio file",
      transcribeMidiTitle: "Transcribe audio to MIDI",
      positions: "Positions",
      posAI: "AI",
      posStart: "Start",
      posMiddle: "Middle",
      posEnd: "End",
      posAll: "All",
      extractionMsg: "Fast rhythm extraction in progress...",
      decodingMsg: "Heavy audio decoding for MIDI (step 1/2)...",
      midiProcessingMsg: "MIDI file creation in progress (step 2/2)...",
      extractionSuccess: "Rhythm extracted successfully!",
      midiSuccess: "Success! MIDI transcription completed.",
      midiLimitMsg: "Success (Limited to 3 minutes to preserve memory).",
      midiDownload: "DOWNLOAD MIDI",
      globalParams: "Global Song Parameters",
      longFormat: "Long Format",
      rhythmInLyrics: "Rhythm in lyrics",
      measureTempo: "Measure & Tempo",
      musicalStyle: "Musical Style",
      customStylePlaceholder: "Describe your style (ex: Jazz-Punk, Techno-Flute...)",
      voiceType: "Voice Type",
      characteristics: "Characteristics",
      lyricsLanguage: "Language",
      themeLyrics: "Theme / Lyrics",
      themePlaceholder: "Ex. Outer Space...",
      generateButton: "Generate Suno AI Arrangement",
      generating: "EXPERT ANALYSIS IN PROGRESS...",
      errorWaitAudio: "Please wait for audio processing to finish before generating.",
      errorNoRhythm: "Please enter at least one rhythmic pattern for one of the instruments.",
      errorGemini: "Sorry, an error occurred during Gemini generation. Check your connection or try again.",
      errorFileSize: "Giant file ({{size}} MB). The extreme protection limit is 150 MB.",
      errorDecoding: "Error decoding audio file.",
      stylePrompt: "Style Prompt",
      antiPrompt: "Anti-Prompt (Negative)",
      lyricsArrangement: "Lyrics & Arrangement",
      reactionQuestion: "What do you think of this arrangement?",
      reactionFeedback: "Thank you for your feedback! Style & Lyrics validated [réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261].",
      helpTitle: "User Guide",
      helpClose: "UNDERSTOOD",
      help1Title: "Rhythmic Architecture",
      help1Body: "Type your patterns with DUM (bass), ta (mid), and ti (high). Visualize them in real-time with dynamic bars.",
      help2Title: "Rhythmic Intelligence & Tools",
      help2BodyIntro: "Each track has intelligent tools to create your rhythm:",
      help2Random: "Random: Generates random rhythmic inspiration.",
      help2Extract: "Audio → Rhythm: Extracts the pattern from an uploaded audio file.",
      help2Midi: "Audio → MIDI: Transcribes your audio into a full MIDI file.",
      helpImportTitle: "Full Import (AI)",
      helpImportBody: "Use the 'Import Full Music' button to load an entire audio file. The AI will analyze the track to automatically detect all instruments, extract their rhythmic patterns, and capture the lyrics.",
      help3Title: "Style, Voice & Emotion",
      help3Body: "Customize your song's soul: choose from dozens of Styles (Techno, Rock, Industrial Pop...), configure Vocals (Duo, Robotic, Soul...) and voice Characteristics (Deep, High, Sensual...).",
      help4Title: "Temporal Positioning",
      help4Body: "Use checkboxes on each track to decide when the instrument plays: Start, Middle, End or throughout the Whole song. The AI option lets the algorithm decide the ideal arrangement.",
      help5Title: "Languages & Lyrics",
      help5Body: "Generate lyrics in French, English, or Bilingual version. Check Rhythm in lyrics so Suno integrates your rhythmic onomatopoeia as vocal percussions.",
      helpGeminiTitle: "Gemini AI Generation",
      helpGeminiBody: "The AI fuses all your tracks and settings to create a coherent Suno AI prompt, structured with [Verse] / [Chorus] tags and thematic lyrics.",
      importFullMusic: "Import Full Music",
      importingMusic: "Intelligent music analysis...",
      importSuccess: "Full analysis complete! Tracks have been configured.",
      lyricsLabel: "Song Lyrics (Extracted via AI)",
      joinedBy: "Joined by +12,400 composers",
      sessions: "Your Sessions",
      totalGenerations: "Total Generations",
      copySuccess: "Copied!",
      noneRhythmDetected: "No clear rhythm detected.",
      personnalise: "Custom...",
      styleLaisseIA: "Let AI choose the best style",
      voixLaisseIA: "Let AI choose the voice",
      charLaisseIA: "Default (Balanced)",
      posLabels: {
        AI: "AI Managed",
        Full: "Throughout",
        Start: "At start",
        Middle: "In middle",
        End: "At end"
      },
      reactions: [
        { emoji: "🔥", label: "Fire" },
        { emoji: "💎", label: "Gem" },
        { emoji: "🎹", label: "Melodic" },
        { emoji: "🥁", label: "Rhythmic" },
        { emoji: "👍", label: "Top" },
        { emoji: "😎", label: "Cool" },
        { emoji: "😱", label: "Amazing" }
      ],
      styleOptions: [
        { group: "Suno AI Auto", options: ["Let AI choose the best style"] },
        { group: "Electronic / Dance", options: ["Synthwave", "Techno", "House", "Trance", "Dubstep", "EDM", "Lo-Fi Beats", "Industrial Pop (Gesaffelstein style)"] },
        { group: "Rock / Metal", options: ["Pop-Rock", "Hard Rock", "Heavy Metal", "Nu-Metal", "Punk Rock", "Math Rock"] },
        { group: "Urban / Hip-Hop", options: ["Old School Hip-Hop", "Trap", "Drill", "RnB", "Reggaeton", "Afrobeat"] },
        { group: "Pop / Variety", options: ["Pop", "Synth-Pop", "K-Pop", "French Variety", "Indie Pop"] },
        { group: "Acoustique / Traditional", options: ["Jazz", "Blues", "Folk", "Country", "Bossa Nova", "Classical Orchestral"] },
        { group: "Mood / Cinematic", options: ["Cinematic Epic", "Dark Ambient", "Chill Synthwave", "Video Game Music (8-bit)"] },
        { group: "World / Oriental", options: ["Oriental / Middle East", "Chaâbi", "Rai", "Mahraganat"] },
        { group: "Other", options: ["Custom..."] }
      ],
      instrumentOptions: [
        { group: "Drums & Percussions", options: ["Classic Drum Kit", "Drum Machine (808)", "Latin Percussions", "Timpani", "Shaker", "Triangle"] },
        { group: "Oriental Instruments", options: ["Darbuka", "Oud", "Qanun", "Daf", "Ney", "Bendir"] },
        { group: "Basses", options: ["Electric Bass", "Double Bass", "Synth Bass", "Sub-bass"] },
        { group: "Keyboards & Synths", options: ["Grand Piano", "Electric Piano", "Synthesizer", "Organ"] },
        { group: "Guitars & Strings", options: ["Acoustic Guitar", "Electric Guitar", "Violin", "Cello"] },
        { group: "Winds & Brass", options: ["Saxophone", "Trumpet", "Flute", "Brass"] },
        { group: "Other", options: ["Custom Instrument..."] }
      ],
      voiceOptions: [
        { group: "Suno AI Auto", options: ["Let AI choose the voice"] },
        { group: "Gender & Age", options: ["Male Voice", "Female Voice", "Child Voice", "Duet (Male & Female)", "Choir"] },
        { group: "Popular Styles", options: ["Clear (Standard Pop)", "Raspy (Rock style)", "Smooth (Jazz style)", "Powerful Soul"] },
        { group: "Original Styles & Effects", options: ["Robotic (Vocoder / Auto-tune)", "Lyric / Opera", "Whisper", "Megaphone Voice", "Slam / Spoken Word"] }
      ],
      timeSignatureOptions: [
        { group: "Standard (Binary)", options: ["4/4 (Standard Pop/Rock)", "2/4 (March / Fast)"] },
        { group: "Compound Rhythms (Ternary)", options: ["6/8 (Compound / Swinging)", "12/8 (Blues / Slow Rock)", "9/8 (Complex Compound)"] },
        { group: "Dances & Asymmetric", options: ["3/4 (Waltz)", "5/4 (Asymmetric Jazz)", "7/8 (Prog Rock)"] }
      ],
      voiceCharOptions: [
        { group: "Suno AI Auto", options: ["Default (Balanced)"] },
        { group: "Registers", options: ["Deep / Bass", "Baritone", "Tenor", "Alto", "Soprano / High"] },
        { group: "Textures & Emotions", options: ["Soft & Delicate", "Energetic & Powerful", "Melancholy", "Aggressive", "Sensual", "Vibrant / Tremolo", "Dry"] }
      ],
      languageOptions: [
        { label: "French", value: "Français" },
        { label: "Italian", value: "Italien" },
        { label: "Spanish", value: "Espagnol" },
        { label: "Portuguese", value: "Portugais" },
        { label: "English", value: "Anglais" },
        { label: "German", value: "Allemand" },
        { label: "Dutch", value: "Néerlandais" },
        { label: "Arabic", value: "Arabe" },
        { label: "Turkish", value: "Turc" },
        { label: "Chinese", value: "Chinois" },
        { label: "Japanese", value: "Japonais" },
        { label: "Russian", value: "Russe" },
        { label: "Polish", value: "Polonais" },
        { label: "Gypsy", value: "Tzigane" },
        { label: "Indian", value: "Indien" },
        { label: "Korean", value: "Coréen" },
        { label: "Indonesian", value: "Indonésien" },
        { label: "Filipino", value: "Philippin" }
      ]
    }
  };

  const cur = t[currentLang];

  const [instrumentTracks, setInstrumentTracks] = useState<Track[]>([
    { id: 1, name: "Drum kit classique", customName: "", rhythm: "", timelinePositions: ['AI'], warningMsg: "", progress: 0, processingState: 'idle', midiDataUrl: null, midiFileName: "" }
  ]);
  
  const [selectedStyle, setSelectedStyle] = useState(cur.styleLaisseIA);
  const [customStyle, setCustomStyle] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(cur.voixLaisseIA);
  const [selectedVoiceChar, setSelectedVoiceChar] = useState(cur.charLaisseIA);
  const [selectedLanguage, setSelectedLanguage] = useState("Français");
  const [timeSignature, setTimeSignature] = useState("4/4 (Standard Pop/Rock)");
  const [desiredTheme, setDesiredTheme] = useState("");
  const [isLongFormat, setIsLongFormat] = useState(false);
  const [keepRhythmAsLyrics, setKeepRhythmAsLyrics] = useState(false);
  const [importedLyrics, setImportedLyrics] = useState("");
  const [isImportingFull, setIsImportingFull] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ style: string; lyrics: string; antiPrompt: string } | null>(null);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [copiedStyle, setCopiedStyle] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Sync state values when language changes if they were defaults
  useEffect(() => {
    const prevLang = currentLang === 'fr' ? 'en' : 'fr';
    if (selectedStyle === t[prevLang].styleLaisseIA) setSelectedStyle(t[currentLang].styleLaisseIA);
    if (selectedVoice === t[prevLang].voixLaisseIA) setSelectedVoice(t[currentLang].voixLaisseIA);
    if (selectedVoiceChar === t[prevLang].charLaisseIA) setSelectedVoiceChar(t[currentLang].charLaisseIA);
  }, [currentLang]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: cur.shareTitle,
          text: cur.shareText,
          url: window.location.href,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error("Erreur lors du partage :", err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setError(cur.shareCopied);
        setTimeout(() => setError(null), 3000);
      } catch (err) {
        console.error("Erreur lors de la copie :", err);
      }
    }
  };

  const [activeAudioTrackId, setActiveAudioTrackId] = useState<number | null>(null);
  const [activeAudioAction, setActiveAudioAction] = useState<'rhythm' | 'midi' | null>(null); 
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fullImportInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const addTrack = () => {
    const newId = instrumentTracks.length > 0 ? Math.max(...instrumentTracks.map(t => t.id)) + 1 : 1;
    setInstrumentTracks([...instrumentTracks, { id: newId, name: "Piano à queue", customName: "", rhythm: "", timelinePositions: ['AI'], warningMsg: "", progress: 0, processingState: 'idle', midiDataUrl: null, midiFileName: "" }]);
  };

  const removeTrack = (id: number) => {
    if (instrumentTracks.length > 1) {
      setInstrumentTracks(instrumentTracks.filter(track => track.id !== id));
    }
  };

  const updateTrack = (id: number, field: keyof Track, value: any) => {
    setInstrumentTracks(prevTracks => prevTracks.map(track => 
      track.id === id ? { ...track, [field]: value } : track
    ));
  };

  const generateRandomRhythmForTrack = (trackId: number) => {
    const isCompound = timeSignature.includes("6/8") || timeSignature.includes("12/8") || timeSignature.includes("9/8");
    
    let randomRhythms = [];
    if (isCompound) {
      randomRhythms = [
        "Ta-ki-da, Ta-ki-da, DUM-pa-pa",
        "Boum-pa-pa, Tchak-pa-pa",
        "Ti-ti-ti, Ti-ti-ti, DUM",
        "DUM... ta-da, DUM... ta-da",
        "Poum-ta-ta, Poum-ta-ta, Tchak-ta-ta",
        "Tss-tss-tss, Tak-tss-tss"
      ];
    } else {
      randomRhythms = [
        "Boum tchak, boum-boum tchak", "Ti-ti-ta, ti-ti-ta, ti-ti-ta", "Tss-tss-tak, tss-tss-tak",
        "Tou-kou-tou-kou-pa", "Boom... Boom... Boom-boom-boom", "Da-da-da DUM",
        "Tchic-a-tchic-a-boum", "Oon-tss, oon-tss, oon-tss", "Tic... toc... scrritch... BOUM"
      ];
    }

    const randomIndex = Math.floor(Math.random() * randomRhythms.length);
    updateTrack(trackId, 'rhythm', randomRhythms[randomIndex]);
    updateTrack(trackId, 'warningMsg', ""); 
    updateTrack(trackId, 'midiDataUrl', null); 
  };

  const handleCopy = (text: string, type: 'style' | 'lyrics') => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'style') {
        setCopiedStyle(true); setTimeout(() => setCopiedStyle(false), 2000);
      } else {
        setCopiedLyrics(true); setTimeout(() => setCopiedLyrics(false), 2000);
      }
    }).catch(err => {
      console.error('Erreur de copie:', err);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  };

  // --- ALGORITHMES AUDIO ---
  const fastProcessAudioToRhythm = (audioBuffer: AudioBuffer) => {
    const rawData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const stepSize = Math.floor(sampleRate / 10); 
    let sunoRhythm = [];
    const threshold = 0.15;

    for (let i = 0; i < rawData.length; i += stepSize) {
        let maxAmp = 0;
        const sliceEnd = Math.min(i + stepSize, rawData.length);
        for (let j = i; j < sliceEnd; j += 50) { 
            if (Math.abs(rawData[j]) > maxAmp) maxAmp = Math.abs(rawData[j]);
        }
        
        if (maxAmp > threshold) {
            if (maxAmp > 0.6) sunoRhythm.push("DUM");
            else if (maxAmp > 0.3) sunoRhythm.push("ta");
            else sunoRhythm.push("ti");
        }
        if (sunoRhythm.length >= 32) break;
    }

    if (sunoRhythm.length === 0) return "Aucun rythme clair détecté.";
    
    let sunoFormatted = "";
    const groupSize = timeSignature.includes("6/8") || timeSignature.includes("12/8") ? 3 : 4;

    for(let i = 0; i < sunoRhythm.length; i++) {
        sunoFormatted += sunoRhythm[i];
        if (i % groupSize === (groupSize - 1)) sunoFormatted += ", ";
        else if (sunoRhythm[i] === "DUM") sunoFormatted += "... ";
        else sunoFormatted += "-";
    }
    return sunoFormatted.replace(/-\s*$/, '').replace(/,\s*$/, '').replace(/-\.\.\./g, '...');
  };

  const writeVarLength = (value: number) => {
    let buffer = [];
    buffer.push(value & 0x7f);
    while (value >>= 7) { buffer.push((value & 0x7f) | 0x80); }
    return buffer.reverse();
  };

  const autoCorrelate = (buffer: Float32Array, sampleRate: number) => {
    let SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) { rms += buffer[i] * buffer[i]; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.05) return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length;
    
    const c = new Float32Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
      for (let j = 0; j < SIZE - i; j++)
        c[i] = c[i] + buffer[j] * buffer[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) { if (c[i] > maxval) { maxval = c[i]; maxpos = i; } }
    let T0 = maxpos;
    return sampleRate / T0;
  };

  const frequencyToMidiNote = (frequency: number) => {
    if (frequency <= 0) return 0;
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  };

  const processAudioToMidiAndSuno = async (audioBuffer: AudioBuffer, trackId: number): Promise<{ sunoText: string, midiData: string | null, wasTruncated: boolean }> => {
    return new Promise((resolve) => {
        const rawData = audioBuffer.getChannelData(0); 
        const sampleRate = audioBuffer.sampleRate; 
        
        const maxDurationSec = 180; 
        const maxSamples = Math.min(rawData.length, sampleRate * maxDurationSec);
        const wasTruncated = rawData.length > maxSamples;
        
        const stepSize = Math.floor(sampleRate / 5); 
        
        let sunoRhythm: string[] = [];
        let midiEvents: any[] = [];
        let currentTimeMs = 0;
        let isNotePlaying = false;
        let lastMidiNote = -1;
        
        const threshold = 0.15; 

        const processChunk = (startIndex: number) => {
            const endIndex = Math.min(startIndex + (sampleRate * 2), maxSamples); 
            
            for (let i = startIndex; i < endIndex; i += stepSize) { 
                let maxAmp = 0;
                const sliceSize = Math.min(stepSize, maxSamples - i);
                const subSliceStep = Math.max(1, Math.floor(sliceSize / 500)); 
                
                for (let j = 0; j < sliceSize; j += subSliceStep) {
                    if (Math.abs(rawData[i + j]) > maxAmp) maxAmp = Math.abs(rawData[i + j]);
                }

                let currentMidiNote = -1;
                if (maxAmp > threshold) {
                    let sliceForPitch = rawData.slice(i, i + sliceSize);
                    let currentFreq = autoCorrelate(sliceForPitch, sampleRate);
                    currentMidiNote = currentFreq > 0 ? frequencyToMidiNote(currentFreq) : -1;
                    if (currentMidiNote > 108) currentMidiNote = 108;
                    if (currentMidiNote > 0 && currentMidiNote < 21) currentMidiNote = 21;
                }

                if (maxAmp > threshold) {
                    if (maxAmp > 0.6) sunoRhythm.push("DUM");
                    else if (maxAmp > 0.3) sunoRhythm.push("ta");
                    else sunoRhythm.push("ti");

                    if (!isNotePlaying && currentMidiNote > 0) {
                        midiEvents.push({ type: 'noteOn', note: currentMidiNote, time: currentTimeMs, velocity: Math.floor(maxAmp * 127) });
                        isNotePlaying = true;
                        lastMidiNote = currentMidiNote;
                    } else if (isNotePlaying && currentMidiNote > 0 && currentMidiNote !== lastMidiNote) {
                        midiEvents.push({ type: 'noteOff', note: lastMidiNote, time: currentTimeMs, velocity: 0 });
                        midiEvents.push({ type: 'noteOn', note: currentMidiNote, time: currentTimeMs, velocity: Math.floor(maxAmp * 127) });
                        lastMidiNote = currentMidiNote;
                    }
                } else {
                    if (isNotePlaying) {
                        midiEvents.push({ type: 'noteOff', note: lastMidiNote, time: currentTimeMs, velocity: 0 });
                        isNotePlaying = false;
                    }
                }
                currentTimeMs += 200; 
            }

            const progressPercent = 50 + Math.floor((endIndex / maxSamples) * 50);
            updateTrack(trackId, 'progress', progressPercent);

            if (endIndex < maxSamples) {
                setTimeout(() => processChunk(endIndex), 0);
            } else {
                finalizeProcessing();
            }
        };

        const finalizeProcessing = () => {
            if (isNotePlaying) midiEvents.push({ type: 'noteOff', note: lastMidiNote, time: currentTimeMs, velocity: 0 });

            if (sunoRhythm.length === 0) {
                resolve({ sunoText: "Aucun rythme clair détecté.", midiData: null, wasTruncated });
                return;
            }
            
            let sunoFormatted = "";
            const maxSunoBeats = Math.min(sunoRhythm.length, 40); 
            const groupSize = timeSignature.includes("6/8") || timeSignature.includes("12/8") ? 3 : 4;

            for(let i = 0; i < maxSunoBeats; i++) {
                sunoFormatted += sunoRhythm[i];
                if (i % groupSize === (groupSize - 1)) sunoFormatted += ", ";
                else if (sunoRhythm[i] === "DUM") sunoFormatted += "... ";
                else sunoFormatted += "-";
            }
            sunoFormatted = sunoFormatted.replace(/-\s*$/, '').replace(/,\s*$/, '').replace(/-\.\.\./g, '...');
            if (sunoRhythm.length > 40) sunoFormatted += "... (boucle)";

            if (midiEvents.length === 0) {
                resolve({ sunoText: sunoFormatted, midiData: null, wasTruncated });
                return;
            }

            const headerChunk = [ 0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x60 ];
            let trackEvents: number[] = [];
            let lastTime = 0;
            const ticksPerMs = 96 / 500; 
            trackEvents.push(0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20);

            midiEvents.forEach(ev => {
                let deltaTicks = Math.round((ev.time - lastTime) * ticksPerMs);
                trackEvents.push(...writeVarLength(deltaTicks));
                if (ev.type === 'noteOn') { trackEvents.push(0x90, ev.note, ev.velocity); } 
                else { trackEvents.push(0x80, ev.note, 0x00); }
                lastTime = ev.time;
            });
            trackEvents.push(0x00, 0xFF, 0x2F, 0x00);

            const trackLength = trackEvents.length;
            const trackChunkHeader = [ 0x4D, 0x54, 0x72, 0x6B, (trackLength >> 24) & 0xFF, (trackLength >> 16) & 0xFF, (trackLength >> 8) & 0xFF, trackLength & 0xFF ];
            const midiBytes = new Uint8Array([...headerChunk, ...trackChunkHeader, ...trackEvents]);
            
            let binary = '';
            const bytes = new Uint8Array(midiBytes);
            for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
            const base64Midi = window.btoa(binary);

            resolve({ 
                sunoText: sunoFormatted, 
                midiData: `data:audio/midi;base64,${base64Midi}`,
                wasTruncated: wasTruncated
            });
        };

        processChunk(0);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || activeAudioTrackId === null || activeAudioAction === null) return;
    
    const fileSizeMB = file.size / (1024 * 1024);
    const trackId = activeAudioTrackId;
    const action = activeAudioAction; 
    
    if (fileSizeMB > 150) {
      setError(`Fichier gigantesque (${fileSizeMB.toFixed(1)} Mo). La limite extrême de protection est de 150 Mo.`);
      return;
    }

    setError(null);
    updateTrack(trackId, 'processingState', 'decoding');
    updateTrack(trackId, 'progress', 0);
    updateTrack(trackId, 'rhythm', "");
    
    if (action === 'midi') {
      updateTrack(trackId, 'midiDataUrl', null);
      updateTrack(trackId, 'midiFileName', "");
    }

    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
        fakeProgress += (50 - fakeProgress) * 0.1; 
        if (fakeProgress > 49) clearInterval(progressInterval);
        updateTrack(trackId, 'progress', Math.floor(fakeProgress));
    }, 500);

    if (action === 'rhythm') updateTrack(trackId, 'warningMsg', "Extraction rapide du rythme en cours...");
    else updateTrack(trackId, 'warningMsg', `Décodage audio lourd pour le MIDI (étape 1/2)...`);

    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      clearInterval(progressInterval);

      if (action === 'rhythm') {
          updateTrack(trackId, 'progress', 100);
          const extractedText = fastProcessAudioToRhythm(audioBuffer);
          updateTrack(trackId, 'rhythm', extractedText);
          updateTrack(trackId, 'processingState', 'done');
          updateTrack(trackId, 'warningMsg', "Rythme extrait avec succès !");
          setTimeout(() => {
              setInstrumentTracks(prev => prev.map(t => t.id === trackId ? { ...t, warningMsg: "", processingState: 'idle' } : t));
          }, 3000);
      } else {
          updateTrack(trackId, 'processingState', 'analyzing');
          updateTrack(trackId, 'progress', 50);
          updateTrack(trackId, 'warningMsg', "Création du Fichier MIDI en cours (étape 2/2)...");

          const result = await processAudioToMidiAndSuno(audioBuffer, trackId);
          updateTrack(trackId, 'rhythm', result.sunoText);
          updateTrack(trackId, 'processingState', 'done');
          updateTrack(trackId, 'progress', 100);
          
          if (result.midiData) {
            updateTrack(trackId, 'midiDataUrl', result.midiData);
            updateTrack(trackId, 'midiFileName', `Transcription_${file.name.replace(/\.[^/.]+$/, "")}.mid`);
          }
          if (result.wasTruncated) updateTrack(trackId, 'warningMsg', "Succès (Limité à 3 minutes pour préserver la mémoire).");
          else updateTrack(trackId, 'warningMsg', "Succès ! Transcription MIDI terminée.");
          
          setTimeout(() => {
              setInstrumentTracks(prev => prev.map(t => t.id === trackId ? { ...t, warningMsg: "", processingState: 'idle' } : t));
          }, 8000);
      }
    } catch (err) {
      clearInterval(progressInterval);
      console.error("Erreur d'import", err);
      updateTrack(trackId, 'processingState', 'idle');
      updateTrack(trackId, 'progress', 0);
      setError("Erreur de décodage du fichier audio.");
    } finally {
      setActiveAudioTrackId(null);
      setActiveAudioAction(null);
      if(fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerFileInput = (trackId: number, action: 'rhythm' | 'midi') => {
    setActiveAudioTrackId(trackId);
    setActiveAudioAction(action); 
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFullAudioImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingFull(true);
    setError(null);

    // Simulation d'une analyse complète (IA multimodale)
    try {
      // On simule un délai de traitement (ASR et démixtion)
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Données simulées adaptées selon la langue
      const instrumentsFr = [
        { name: "Drum kit classique", rhythm: "DUM... ta... DUM... ta, DUM... ta... DUM... ta", positions: ["Full"] },
        { name: "Basse électrique", rhythm: "DUM... DUM... DUM... DUM", positions: ["Full"] },
        { name: "Derbouka", rhythm: "DUM ta-ta DUM ta, DUM ta-ta DUM ta", positions: ["Middle", "End"] },
        { name: "Oud", rhythm: "DUM--ti--ti... DUM--ti--ti", positions: ["Start", "End"] },
        { name: "Synthétiseur", rhythm: "ti... ti... ta... ti, ti... ti... ta... ti", positions: ["Middle"] },
        { name: "Guitare électrique", rhythm: "ta..ta..ta..ta--ti..ti..ti..ti", positions: ["End"] },
        { name: "Shaker", rhythm: "ti-ti-ti-ti-ti-ti-ti-ti", positions: ["Full"] }
      ];

      const instrumentsEn = [
        { name: "Classic Drum Kit", rhythm: "DUM... ta... DUM... ta, DUM... ta... DUM... ta", positions: ["Full"] },
        { name: "Electric Bass", rhythm: "DUM... DUM... DUM... DUM", positions: ["Full"] },
        { name: "Darbuka", rhythm: "DUM ta-ta DUM ta, DUM ta-ta DUM ta", positions: ["Middle", "End"] },
        { name: "Oud", rhythm: "DUM--ti--ti... DUM--ti--ti", positions: ["Start", "End"] },
        { name: "Synthesizer", rhythm: "ti... ti... ta... ti, ti... ti... ta... ti", positions: ["Middle"] },
        { name: "Electric Guitar", rhythm: "ta..ta..ta..ta--ti..ti..ti..ti", positions: ["End"] },
        { name: "Shaker", rhythm: "ti-ti-ti-ti-ti-ti-ti-ti", positions: ["Full"] }
      ];

      const selectedInstruments = currentLang === 'fr' ? instrumentsFr : instrumentsEn;

      const simulatedData = {
        instruments: selectedInstruments,
        lyrics: currentLang === 'fr' 
          ? "[Verse 1]\nDans le silence de la nuit, les beats s'éveillent.\nUn écho de cristal qui traverse le temps.\n[Chorus]\nOn danse sous les étoiles artificielles.\nMulti-Track Analyzer, le coeur qui bat.\n[Verse 2]\nLes pistes s'entremêlent, les rythmes s'alignent.\nLa symphonie digitale vient de commencer."
          : "[Verse 1]\nIn the silence of the night, the beats awaken.\nA crystal echo crossing through time.\n[Chorus]\nWe dance under artificial stars.\nMulti-Track Analyzer, the beating heart.\n[Verse 2]\nThe tracks intertwine, the rhythms align.\nThe digital symphony has just begun."
      };

      // Mise à jour de l'interface
      const newTracks = simulatedData.instruments.map((inst, index) => ({
        id: Date.now() + index,
        name: inst.name,
        customName: "",
        rhythm: inst.rhythm,
        timelinePositions: inst.positions,
        warningMsg: "",
        progress: 100,
        processingState: 'idle' as const,
        midiDataUrl: null,
        midiFileName: ""
      }));

      setInstrumentTracks(newTracks);
      setImportedLyrics(simulatedData.lyrics);
      setError(cur.importSuccess);
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      console.error("Full import error:", err);
      setError("Erreur lors de l'analyse automatique.");
    } finally {
      setIsImportingFull(false);
      if (fullImportInputRef.current) fullImportInputRef.current.value = "";
    }
  };

  const toggleTimelinePosition = (trackId: number, position: string) => {
    setInstrumentTracks(prevTracks => prevTracks.map(track => {
      if (track.id !== trackId) return track;
      
      let newPositions = [...track.timelinePositions];
      
      if (position === 'AI') {
        newPositions = ['AI'];
      } else {
        newPositions = newPositions.filter(p => p !== 'AI');
        
        if (newPositions.includes(position)) {
          newPositions = newPositions.filter(p => p !== position);
        } else {
          // If checking 'Full', maybe clear others? Or just let them coexist. 
          // Let's be smart: if 'Full' is checked, it overrides Start/Middle/End.
          if (position === 'Full') {
            newPositions = ['Full'];
          } else {
            newPositions = newPositions.filter(p => p !== 'Full');
            newPositions.push(position);
          }
        }
        
        if (newPositions.length === 0) newPositions = ['AI'];
      }
      
      return { ...track, timelinePositions: newPositions };
    }));
  };

  const [visitCount, setVisitCount] = useState(0);
  const [sessionStartTime] = useState(Date.now());

  // Gestion du compteur de visites
  useEffect(() => {
    const savedVisits = localStorage.getItem('suno_composer_visits');
    const count = savedVisits ? parseInt(savedVisits) + 1 : 1;
    localStorage.setItem('suno_composer_visits', count.toString());
    setVisitCount(count);
  }, []);

  const analyzeRhythm = async () => {
    if (instrumentTracks.some(t => t.processingState === 'decoding' || t.processingState === 'analyzing')) {
      setError("Veuillez attendre la fin du traitement audio avant de générer.");
      return;
    }

    const hasAtLeastOneRhythm = instrumentTracks.some(t => t.rhythm.trim() !== "");
    if (!hasAtLeastOneRhythm) {
      setError("Veuillez entrer au moins un motif rythmique pour l'un des instruments.");
      return;
    }

    setLoading(true);
    setError(null);
    setActiveReaction(null);

    const instrumentsInfo = instrumentTracks.map(t => {
      const name = t.name === cur.personnalise ? t.customName : t.name;
      const posLabels = t.timelinePositions.map(pos => {
        return cur.posLabels[pos as keyof typeof cur.posLabels] || pos;
      }).join(', ');
      return `- ${name}: [${t.rhythm}] (${currentLang === 'fr' ? 'Position' : 'Position'}: ${posLabels})`;
    }).join('\n');

    let styleToUse = selectedStyle === cur.personnalise ? customStyle : selectedStyle;
    if (selectedStyle === "Industrial Pop (Gesaffelstein style)") {
      styleToUse = "A dark, hypnotic industrial pop track inspired by Gesaffelstein, featuring aggressive, distorted analog synthesizers, sharp rhythmic stabs, and a heavy, thumping techno-inflected beat. The production is clinically precise with cavernous reverb on metallic percussive hits, creating a cold, menacing atmosphere with high-fidelity, polished urban soundscapes.";
    }

    const systemPrompt = currentLang === 'fr' 
      ? `Tu es un expert en composition musicale et un pro du logiciel Suno AI. Ta mission est de transformer ces structures rythmiques en un prompt de STYLE et des PAROLES optimisées pour Suno AI.`
      : `You are a music composition expert and a Suno AI pro. Your mission is to transform these rhythmic structures into a STYLE prompt and optimized LYRICS for Suno AI.`;

    const prompt = `${systemPrompt}

${currentLang === 'fr' ? 'DONNÉES D\'ENTRÉE' : 'INPUT DATA'} :
- ${currentLang === 'fr' ? 'Rythmes par instruments' : 'Rhythms by instruments'} : 
${instrumentsInfo}
- ${currentLang === 'fr' ? 'Style sélectionné' : 'Selected style'} : ${styleToUse}
- ${currentLang === 'fr' ? 'Langue des paroles' : 'Lyrics language'} : ${selectedLanguage}
- ${currentLang === 'fr' ? 'Exigence de qualité Vocale (MANDATOIRE)' : 'Vocal Quality Requirement (MANDATORY)'} : "Studio-grade polished vocals, clinically clean voice, powerful forward projection, heavy de-essing, no sibilance, zero breathiness, dry vocal mix, crisp articulation, high-fidelity recording."
- ${currentLang === 'fr' ? 'Voix souhaitée' : 'Desired voice'} : ${selectedVoice}
- ${currentLang === 'fr' ? 'Caractéristiques de la voix' : 'Voice characteristics'} : ${selectedVoiceChar}
- ${currentLang === 'fr' ? 'Signature rythmique (Measure)' : 'Time Signature (Measure)'} : ${timeSignature}
- ${currentLang === 'fr' ? 'Thème ou émotion' : 'Theme or emotion'} : ${desiredTheme || 'Non spécifié'}
- ${currentLang === 'fr' ? 'Format long (Full length)' : 'Long format (Full length)'} : ${isLongFormat ? (currentLang === 'fr' ? 'Oui' : 'Yes') : (currentLang === 'fr' ? 'Non' : 'No')}

${currentLang === 'fr' ? 'INSTRUCTIONS D\'OUTPUT' : 'OUTPUT INSTRUCTIONS'} :
${currentLang === 'fr' ? 'Génère une réponse structurée ainsi :' : 'Generate a structured response as follows:'}
1. **Suno Style Prompt** : ${currentLang === 'fr' ? 'Une chaîne de mots-clés séparés par des virgules, incluant les genres, l\'humeur, les instruments, les directives rythmiques extraites ET l\'exigence de qualité vocale MANDATOIRE fournie ci-dessus.' : 'A comma-separated string of keywords, including genres, mood, instruments, extracted rhythmic directives AND the MANDATORY vocal quality requirement provided above.'} Max 20 character limit.
2. **Suno Anti-Prompt** : ${currentLang === 'fr' ? 'Utilise exactement cette chaîne pour exclure les défauts vocaux' : 'Use exactly this string to exclude vocal defects'} : "Sibilance, breathy vocals, whispering, airy voice, hissing, background noise, low-fidelity, muffled, harsh treble, whistling 's'".
3. **Suno Lyrics** : ${currentLang === 'fr' ? 'Les paroles avec des balises de structure [Verse], [Chorus], [Bridge], [Outro].' : 'Lyrics with structure tags [Verse], [Chorus], [Bridge], [Outro].'}
   ${currentLang === 'fr' ? 'CONTRAINTES DE FORMATAGE (MANDATOIRE)' : 'FORMATTING CONSTRAINTS (MANDATORY)'} :
   - ${currentLang === 'fr' ? 'Intégrer le STYLE de musique et les INSTRUMENTS directement avec leurs motifs rythmiques dans les paroles en utilisant exclusivement des crochets.' : 'Integrate the music STYLE and INSTRUMENTS directly with their rhythmic patterns in the lyrics using ONLY brackets.'} 
   - ${currentLang === 'fr' ? 'Format exigé' : 'Required format'} : [Style Nom_Instrument Motif_Rythmique] (example : [Rock Guitare ti ti ta chack]).
   - ${currentLang === 'fr' ? 'NE JAMAIS utiliser de parenthèses ( ) pour le style ou toute autre annotation.' : 'NEVER use parentheses ( ) for style or any other annotation.'}
   - ${currentLang === 'fr' ? 'Intégrer les onomatopées rythmiques fournies (comme "DUM", "ta", "ti") de manière fluide dans le texte des paroles ou en balises de structure.' : 'Integrate the provided rhythmic onomatopoeia (like "DUM", "ta", "ti") fluidly into the lyrics text or structure tags.'}

${currentLang === 'fr' ? 'Réponds uniquement au format JSON suivant' : 'Respond only in the following JSON format'} :
{
  "style": "...",
  "antiPrompt": "...",
  "lyrics": "..."
}`;

    try {
      const response = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        setResult({
          ...parsed,
          style: `${parsed.style} [réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261]`,
          lyrics: `${parsed.lyrics}\n\n[réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261]`
        });
      } else {
        throw new Error("Aucune réponse de l'IA.");
      }
    } catch (err: any) {
      console.error("Erreur Gemini:", err);
      setError("Désolé, une erreur est survenue lors de la génération avec Gemini. Vérifiez votre connexion ou réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-neutral-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Background with metallic texture feel */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none bg-[radial-gradient(circle_at_center,_#3a3a3a_0%,_#1a1a1a_100%)]">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')]" />
      </div>

      <div className="relative max-w-6xl mx-auto py-8 px-4">
        {/* Main Console Container */}
        <div className="bg-[#c2c2ce] rounded-[2.5rem] border-t-2 border-white/50 border-b-2 border-black/30 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_2px_5px_rgba(255,255,255,0.8)] overflow-hidden">
          
          {/* Top Title Bar (mimicking the OS-like bar in the image) */}
          <div className="h-12 bg-gradient-to-b from-[#dedede] to-[#b8b8b8] border-b border-black/20 grid grid-cols-3 items-center px-6">
            <div className="flex items-center gap-3 justify-start">
              <span className="text-sm font-bold text-neutral-700 tracking-tight">{cur.appName}</span>
            </div>
            
            {/* Center: Help icon - larger and more visible */}
            <div className="flex justify-center items-center gap-4">
              <div 
                onClick={() => setIsHelpOpen(true)}
                className="px-6 py-1 rounded-lg bg-white/80 border border-black/10 flex items-center gap-2 cursor-pointer shadow-sm group hover:bg-white transition-all scale-110"
              >
                <Info className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
                <span className="text-[14px] font-black text-blue-950 uppercase tracking-tighter">{cur.help}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 justify-end">
              <RefreshCw 
                onClick={() => window.location.reload()}
                className="w-4 h-4 text-neutral-600 hover:text-blue-600 cursor-pointer transition-all" 
              />
              <div 
                onClick={handleShare}
                className="w-6 h-6 rounded-md bg-[#e2741c] flex items-center justify-center cursor-pointer shadow-sm hover:bg-orange-600 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5 text-white" />
              </div>

              {/* Language Switcher */}
              <div className="flex bg-black/10 rounded-xl p-1 border border-black/5 gap-1">
                <button 
                  onClick={() => setCurrentLang('fr')}
                  className={`px-3 py-1.5 rounded-lg text-[20px] transition-all flex items-center justify-center ${currentLang === 'fr' ? 'bg-white shadow-md scale-125 z-10' : 'opacity-80 hover:opacity-100 hover:scale-110 hover:bg-white/30'}`}
                  title="Français"
                >
                  🇫🇷
                </button>
                <button 
                  onClick={() => setCurrentLang('en')}
                  className={`px-3 py-1.5 rounded-lg text-[20px] transition-all flex items-center justify-center ${currentLang === 'en' ? 'bg-white shadow-md scale-125 z-10' : 'opacity-80 hover:opacity-100 hover:scale-110 hover:bg-white/30'}`}
                  title="English"
                >
                  🇬🇧
                </button>
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12">
            {/* Hero Section */}
            <header className="mb-12 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#f0f0f0] to-[#d0d0d0] border border-white shadow-xl flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 rounded-2xl border-2 border-black/5 pointer-events-none" />
                <Activity className="w-10 h-10 text-neutral-800" />
              </div>
              <h1 className="text-5xl font-black text-neutral-900 tracking-tight mb-2 italic">{cur.heroTitle}</h1>
              <p className="text-[20px] font-black text-blue-600 uppercase tracking-[0.3em] mb-4">by DJ-R LAIEB</p>
              <p className="text-blue-950 text-lg font-bold opacity-70">{cur.heroSubtitle}</p>
            </header>

            <div className="space-y-8">
              {/* Instrument Sequencer Section */}
              <section className="bg-[#a8a8b8] rounded-[2rem] border border-white/40 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1),0_5px_15px_rgba(0,0,0,0.1)] p-6">
                <div className="flex items-center justify-between mb-8 border-b border-black/5 pb-4">
                  <div className="flex items-center gap-3">
                    <Drum className="w-6 h-6 text-neutral-800" />
                    <h2 className="text-2xl font-black text-neutral-900 tracking-tight">{cur.sequencerTitle}</h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button 
                      onClick={() => fullImportInputRef.current?.click()}
                      disabled={isImportingFull}
                      className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {isImportingFull ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {isImportingFull ? cur.importingMusic : cur.importFullMusic}
                    </button>
                    <button 
                      onClick={addTrack}
                      className="flex items-center gap-2 px-6 py-2.5 bg-[#eee] hover:bg-white text-neutral-800 rounded-xl text-sm font-black transition-all border border-black/10 shadow-[0_2px_4px_rgba(0,0,0,0.1)] active:shadow-inner"
                    >
                      <Plus className="w-4 h-4" />
                      {cur.addTrack}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {instrumentTracks.map((track, trackIndex) => (
                      <motion.div 
                        key={track.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="bg-gradient-to-r from-[#d8d8e5] to-[#c8c8d8] rounded-2xl border border-white/60 p-5 shadow-[0_4px_10px_rgba(0,0,0,0.05)] relative"
                      >
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#c2c2d2] border-2 border-white shadow-md flex items-center justify-center font-black text-xs text-neutral-700">
                          {trackIndex + 1}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                          {/* Instrument Selection */}
                          <div className="lg:col-span-3 space-y-2">
                            <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.instrumentChoice}</label>
                            <select 
                              className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-sm shadow-inner"
                              value={track.name}
                              onChange={(e) => updateTrack(track.id, 'name', e.target.value)}
                            >
                              {cur.instrumentOptions.map(group => (
                                <optgroup key={group.group} label={group.group}>
                                  {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </div>

                          {/* Rhythm Input & Actions */}
                          <div className="lg:col-span-6 space-y-2">
                            <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.rhythmTools}</label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <div className="flex-1 flex items-center bg-[#f5f5f7] rounded-xl px-4 border-2 border-black/5 focus-within:border-blue-400 shadow-inner group transition-all">
                                <input 
                                  type="text"
                                  placeholder={cur.rhythmPlaceholder}
                                  className="w-full bg-transparent text-neutral-900 py-3 text-sm focus:outline-none font-bold"
                                  value={track.rhythm}
                                  onChange={(e) => updateTrack(track.id, 'rhythm', e.target.value)}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => generateRandomRhythmForTrack(track.id)}
                                  title={cur.randomRhythmTitle}
                                  className="flex items-center justify-center p-3 bg-[#d0d0df] hover:bg-[#c2c2d2] rounded-xl transition-all border border-black/5 shadow-sm active:shadow-inner"
                                >
                                  <Dices className="w-5 h-5 text-neutral-700" />
                                </button>
                                <button 
                                  onClick={() => triggerFileInput(track.id, 'rhythm')}
                                  title={cur.extractRhythmTitle}
                                  className="flex items-center justify-center p-3 bg-[#d0d0df] hover:bg-[#c2c2d2] rounded-xl transition-all border border-black/5 shadow-sm active:shadow-inner"
                                >
                                  <Music4 className="w-5 h-5 text-neutral-700" />
                                </button>
                                <button 
                                  onClick={() => triggerFileInput(track.id, 'midi')}
                                  title={cur.transcribeMidiTitle}
                                  className={`flex items-center justify-center p-3 rounded-xl transition-all border border-black/5 shadow-sm active:shadow-inner ${track.midiDataUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-[#7ba68e] text-white'}`}
                                >
                                  <Zap className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Timeline Position Selection */}
                          <div className="lg:col-span-2 space-y-2">
                            <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.positions}</label>
                            <div className="flex flex-wrap gap-1 p-1 bg-[#f5f5f7] rounded-xl border-2 border-black/5 shadow-inner min-h-[50px] items-center justify-center">
                              {[
                                { id: 'AI', label: cur.posAI },
                                { id: 'Start', label: cur.posStart },
                                { id: 'Middle', label: cur.posMiddle },
                                { id: 'End', label: cur.posEnd },
                                { id: 'Full', label: cur.posAll }
                              ].map(pos => (
                                <button
                                  key={pos.id}
                                  onClick={() => toggleTimelinePosition(track.id, pos.id)}
                                  className={`px-1.5 py-1 rounded-lg text-[9px] font-bold transition-all border ${
                                    track.timelinePositions.includes(pos.id)
                                      ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                                      : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'
                                  }`}
                                >
                                  {pos.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Delete */}
                          <div className="lg:col-span-1 flex justify-end">
                            <button 
                              onClick={() => removeTrack(track.id)}
                              className="p-3 text-neutral-400 hover:text-red-500 hover:bg-white/40 rounded-xl transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* Visualization & Feedback */}
                        {(track.rhythm || track.warningMsg || track.processingState !== 'idle') && (
                          <div className="mt-4 pt-4 border-t border-white/20">
                            <RhythmVisualizer rhythm={track.rhythm} />
                            
                            {track.warningMsg && (
                              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-blue-950">
                                <Activity className="w-3.5 h-3.5 animate-pulse" />
                                {track.warningMsg}
                              </div>
                            )}

                            {track.processingState !== 'idle' && (
                              <div className="mt-2 overflow-hidden h-2 bg-black/10 rounded-full border border-white/30">
                                <motion.div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${track.progress}%` }}
                                />
                              </div>
                            )}

                            {track.midiDataUrl && (
                              <div className="mt-3 flex justify-end">
                                <a 
                                  href={track.midiDataUrl}
                                  download={track.midiFileName}
                                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-[10px] font-black shadow-lg shadow-blue-500/30"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  {cur.midiDownload}
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>

              {/* Imported Lyrics Section */}
              {importedLyrics && (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#a8a8b8] rounded-[2rem] border border-white/40 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1),0_5px_15px_rgba(0,0,0,0.1)] p-6"
                >
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-black/5">
                    <div className="flex items-center gap-3">
                      <Mic2 className="w-5 h-5 text-neutral-800" />
                      <h3 className="text-lg font-black text-neutral-900 uppercase tracking-widest">{cur.lyricsLabel}</h3>
                    </div>
                    <button 
                      onClick={() => setImportedLyrics("")}
                      className="text-neutral-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-[#f5f5f7] p-6 rounded-2xl border border-black/5 shadow-inner">
                    <textarea 
                      className="w-full bg-transparent text-neutral-800 font-medium text-sm leading-relaxed focus:outline-none min-h-[150px] resize-y italic"
                      value={importedLyrics}
                      onChange={(e) => setImportedLyrics(e.target.value)}
                    />
                  </div>
                </motion.section>
              )}

              {/* Global Parameters Section */}
              <section className="bg-[#a8a8b8] rounded-[2rem] border border-white/40 shadow-[inset_0_2px_5px_rgba(0,0,0,0.1),0_5px_15px_rgba(0,0,0,0.1)] p-6">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-black/5">
                  <h3 className="text-lg font-black text-neutral-900 uppercase tracking-widest">{cur.globalParams}</h3>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-3 px-4 py-2 bg-[#d8d8e5] rounded-full cursor-pointer hover:bg-white transition-all shadow-sm">
                      <div className="w-6 h-6 rounded-full border-2 border-neutral-400 bg-white shadow-inner flex items-center justify-center p-1 relative">
                        <Activity className="w-3 h-3 text-neutral-400" />
                      </div>
                      <span className="text-[14px] font-black text-blue-950">{cur.longFormat}</span>
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={isLongFormat}
                          onChange={() => setIsLongFormat(!isLongFormat)} 
                        />
                        <div className="w-10 h-5 bg-[#bbb] rounded-full peer-checked:bg-blue-600 transition-all border border-black/10" />
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:left-6" />
                      </div>
                    </label>

                    <label className="flex items-center gap-3 px-4 py-2 bg-[#d8d8e5] rounded-full cursor-pointer hover:bg-white transition-all shadow-sm">
                      <Music className="w-3.5 h-3.5 text-blue-950" />
                      <span className="text-[14px] font-black text-blue-950">{cur.rhythmInLyrics}</span>
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={keepRhythmAsLyrics}
                          onChange={() => setKeepRhythmAsLyrics(!keepRhythmAsLyrics)} 
                        />
                        <div className="w-10 h-5 bg-[#bbb] rounded-full peer-checked:bg-blue-600 transition-all border border-black/10" />
                        <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all peer-checked:left-6" />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                  <div className="space-y-2">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.measureTempo}</label>
                    <select 
                      className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner text-left"
                      value={timeSignature}
                      onChange={(e) => setTimeSignature(e.target.value)}
                    >
                      {cur.timeSignatureOptions.map(group => (
                        <optgroup key={group.group} label={group.group}>
                          {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.musicalStyle}</label>
                    <select 
                      className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner text-left"
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                    >
                      {cur.styleOptions.map(group => (
                        <optgroup key={group.group} label={group.group}>
                          {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {selectedStyle === cur.personnalise && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2"
                      >
                        <input
                          type="text"
                          placeholder={cur.customStylePlaceholder}
                          className="w-full bg-white text-neutral-800 rounded-xl px-4 py-2 border-2 border-blue-200 focus:outline-none focus:border-blue-500 font-medium text-xs shadow-sm"
                          value={customStyle}
                          onChange={(e) => setCustomStyle(e.target.value)}
                        />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.voiceType}</label>
                    <select 
                      className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner text-left"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                    >
                      {cur.voiceOptions.map(group => (
                        <optgroup key={group.group} label={group.group}>
                          {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.characteristics}</label>
                    <select 
                      className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner text-left"
                      value={selectedVoiceChar}
                      onChange={(e) => setSelectedVoiceChar(e.target.value)}
                    >
                      {cur.voiceCharOptions.map(group => (
                        <optgroup key={group.group} label={group.group}>
                          {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.lyricsLanguage}</label>
                    <select 
                      className="w-full bg-[#f5f5f7] text-neutral-800 rounded-xl px-4 py-3 border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner text-left"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                    >
                      {cur.languageOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 md:col-span-1">
                    <label className="text-[14px] font-black text-blue-950 uppercase tracking-widest px-1">{cur.themeLyrics}</label>
                    <input 
                      type="text"
                      placeholder={cur.themePlaceholder}
                      className="w-full bg-[#f5f5f7] text-neutral-800 px-4 py-3 rounded-xl border-2 border-black/5 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-inner"
                      value={desiredTheme}
                      onChange={(e) => setDesiredTheme(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Main Generation Button */}
              <button 
                onClick={analyzeRhythm}
                disabled={loading}
                className="w-full relative group h-20 bg-gradient-to-b from-[#2b4b7a] to-[#1a2b4b] hover:from-[#3b5b8a] hover:to-[#2a3b5b] disabled:opacity-50 disabled:cursor-not-allowed rounded-3xl flex items-center justify-center gap-4 text-xl font-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all active:scale-[0.98] border-t-2 border-blue-400/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin" />
                    {cur.generating}
                  </>
                ) : (
                  <>
                    <Send className="w-6 h-6 rotate-45 transform" />
                    {cur.generateButton}
                  </>
                )}
                <div className="absolute inset-0 rounded-3xl border-2 border-white/5 opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-red-100 border-2 border-red-200 rounded-[2rem] flex items-center gap-4 text-red-800 shadow-sm"
                >
                  <AlertCircle className="w-6 h-6 flex-shrink-0" />
                  <p className="font-black text-sm tracking-tight">{error}</p>
                </motion.div>
              )}
            </div>
            
            {/* Results Section */}
            <AnimatePresence mode="wait">
              {result && (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8"
                >
                  <div className="bg-[#d8d8e5] rounded-[2rem] border border-white p-8 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <Music4 className="w-5 h-5 text-neutral-800" />
                        <h4 className="font-black text-neutral-900 uppercase">{cur.stylePrompt}</h4>
                      </div>
                      <button 
                        onClick={() => handleCopy(result.style, 'style')}
                        className="p-3 bg-white/60 hover:bg-white rounded-xl transition-all shadow-sm border border-black/5"
                      >
                        {copiedStyle ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-neutral-600" />}
                      </button>
                    </div>
                    <div className="bg-[#f5f5f7] p-6 rounded-2xl border border-black/5 font-mono text-xs leading-relaxed text-neutral-800 shadow-inner min-h-[80px] mb-6">
                      {result.style}
                    </div>

                    <div className="flex items-center justify-between mb-4 mt-6 pt-6 border-t border-black/10">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-4 h-4 text-orange-600" />
                        <h4 className="font-black text-neutral-900 text-sm uppercase">{cur.antiPrompt}</h4>
                      </div>
                      <button 
                        onClick={() => handleCopy(result.antiPrompt, 'style')}
                        className="p-2 bg-white/60 hover:bg-white rounded-lg transition-all shadow-sm border border-black/5"
                      >
                        <Copy className="w-3.5 h-3.5 text-neutral-600" />
                      </button>
                    </div>
                    <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 font-mono text-[10px] leading-relaxed text-orange-950 shadow-inner italic">
                      {result.antiPrompt}
                    </div>
                  </div>

                  <div className="bg-[#d8d8e5] rounded-[2rem] border border-white p-8 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <Mic className="w-5 h-5 text-neutral-800" />
                        <h4 className="font-black text-neutral-900 uppercase">{cur.lyricsArrangement}</h4>
                      </div>
                      <button 
                        onClick={() => handleCopy(result.lyrics, 'lyrics')}
                        className="p-3 bg-white/60 hover:bg-white rounded-xl transition-all shadow-sm border border-black/5"
                      >
                        {copiedLyrics ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-neutral-600" />}
                      </button>
                    </div>
                    <div className="bg-[#f5f5f7] p-6 rounded-2xl border border-black/5 text-sm leading-relaxed text-neutral-800 shadow-inner min-h-[200px] max-h-[400px] overflow-y-auto whitespace-pre-wrap italic">
                      {result.lyrics}
                    </div>
                  </div>

                  {/* Reactions Bar */}
                  <div className="md:col-span-2 flex flex-col items-center gap-4 py-8 bg-white/30 rounded-[2rem] border border-white/50 shadow-sm backdrop-blur-sm">
                    <p className="text-[10px] font-black text-blue-950/40 uppercase tracking-[0.2em]">{cur.reactionQuestion}</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {cur.reactions.map((item) => (
                        <button
                          key={item.emoji}
                          onClick={() => setActiveReaction(item.emoji)}
                          className={`group relative w-12 h-12 flex items-center justify-center text-2xl rounded-2xl transition-all border-2 ${
                            activeReaction === item.emoji 
                              ? 'bg-white border-blue-500 shadow-lg scale-110' 
                              : 'bg-[#e2e2ee] border-transparent hover:bg-white hover:border-blue-300 hover:scale-105'
                          }`}
                        >
                          <span className={activeReaction === item.emoji ? 'animate-bounce' : 'group-hover:animate-pulse'}>
                            {item.emoji}
                          </span>
                          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="text-[9px] font-black text-blue-900 bg-white px-2 py-1 rounded shadow-sm whitespace-nowrap">
                              {item.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {activeReaction && (
                      <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-bold text-blue-600 italic px-8 text-center"
                      >
                        {cur.reactionFeedback}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
            onClick={() => setIsHelpOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 md:p-10 overflow-y-auto">
                <div className="flex items-center justify-between mb-6 md:mb-8">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Info className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-neutral-900 leading-tight">{cur.helpTitle}</h2>
                  </div>
                  <button 
                    onClick={() => setIsHelpOpen(false)}
                    className="p-2 hover:bg-neutral-100 rounded-xl transition-all"
                  >
                    <RefreshCw className="w-6 h-6 text-neutral-400 rotate-45" />
                  </button>
                </div>

                <div className="space-y-6 text-blue-950">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">1</div>
                    <div>
                      <h3 className="font-bold text-neutral-900 mb-1">{cur.help1Title}</h3>
                      <p className="text-sm leading-relaxed">{cur.help1Body}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">2</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-neutral-900 mb-2">{cur.help2Title}</h3>
                      <div className="text-sm leading-relaxed space-y-3">
                        <p className="opacity-80">{cur.help2BodyIntro}</p>
                        <div className="grid grid-cols-1 gap-2">
                           <div className="flex items-center gap-3 p-3 bg-white/50 rounded-2xl border border-black/5 shadow-sm">
                             <div className="w-10 h-10 bg-[#d0d0df] rounded-xl flex items-center justify-center shadow-inner">
                               <Dices className="w-5 h-5 text-neutral-700" />
                             </div>
                             <span className="font-bold text-xs text-blue-950">{cur.help2Random}</span>
                           </div>
                           <div className="flex items-center gap-3 p-3 bg-white/50 rounded-2xl border border-black/5 shadow-sm">
                             <div className="w-10 h-10 bg-[#d0d0df] rounded-xl flex items-center justify-center shadow-inner">
                               <Music4 className="w-5 h-5 text-neutral-700" />
                             </div>
                             <span className="font-bold text-xs text-blue-950">{cur.help2Extract}</span>
                           </div>
                           <div className="flex items-center gap-3 p-3 bg-[#7ba68e]/10 rounded-2xl border border-[#7ba68e]/30 shadow-sm">
                             <div className="w-10 h-10 bg-[#7ba68e] rounded-xl flex items-center justify-center shadow-lg shadow-[#7ba68e]/20">
                               <Zap className="w-5 h-5 text-white" />
                             </div>
                             <span className="font-bold text-xs text-[#2a4636]">{cur.help2Midi}</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">3</div>
                    <div>
                      <h3 className="font-bold text-neutral-900 mb-1">{cur.helpImportTitle}</h3>
                      <p className="text-sm leading-relaxed opacity-80">{cur.helpImportBody}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">4</div>
                    <div>
                      <h3 className="font-bold text-neutral-900 mb-1">{cur.help3Title}</h3>
                      <p className="text-sm leading-relaxed">{cur.help3Body}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">5</div>
                    <div>
                      <h3 className="font-bold text-neutral-900 mb-1">{cur.help4Title}</h3>
                      <p className="text-sm leading-relaxed">{cur.help4Body}</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex flex-shrink-0 items-center justify-center font-bold text-sm">6</div>
                    <div>
                      <h3 className="font-bold text-neutral-900 mb-1">{cur.help5Title}</h3>
                      <p className="text-sm leading-relaxed">{cur.help5Body}</p>
                    </div>
                  </div>

                  <div className="mt-8 p-6 bg-orange-50 rounded-2xl border border-orange-100">
                    <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-orange-600" />
                      {cur.helpGeminiTitle}
                    </h4>
                    <p className="text-xs leading-relaxed text-orange-800 italic">{cur.helpGeminiBody}</p>
                  </div>
                </div>

                <div className="mt-8 md:mt-10 flex justify-center">
                  <button 
                    onClick={() => setIsHelpOpen(false)}
                    className="w-full md:w-auto px-8 py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/10"
                  >
                    {cur.helpClose}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden"
          accept="audio/*"
          onChange={handleFileUpload}
        />

        <input 
          type="file" 
          ref={fullImportInputRef}
          className="hidden"
          accept="audio/*"
          onChange={handleFullAudioImport}
        />

        {/* Footer */}
        <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-black/10 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-neutral-200 overflow-hidden shadow-sm">
                    <img src={`https://i.pravatar.cc/100?u=user${i + 42}`} alt="User" className="w-full h-full object-cover grayscale opacity-80" />
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-black text-blue-950/40 uppercase tracking-tighter">
                {cur.joinedBy}
              </p>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-lime-500 uppercase tracking-widest">{cur.sessions}</span>
                <span className="text-2xl font-black text-lime-500 tabular-nums leading-none">
                  {visitCount.toString().padStart(3, '0')}
                </span>
              </div>
              <div className="h-10 w-[2px] bg-black/5"></div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-lime-500 uppercase tracking-widest">{cur.totalGenerations}</span>
                <span className="text-2xl font-black text-lime-500 tabular-nums leading-none">
                  {(158241 + visitCount * 3).toLocaleString(currentLang === 'fr' ? 'fr-FR' : 'en-US')}
                </span>
              </div>
            </div>

            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-blue-950/30 uppercase tracking-widest">© 2026 Multi-Track AI Analyzer by DJ-R LAIEB</p>
              <div className="flex items-center justify-end gap-3 text-[10px] font-bold text-blue-950/40 uppercase tracking-tight">
                <span className="hover:text-blue-600 cursor-pointer transition-colors">{currentLang === 'fr' ? 'RGPD' : 'GDPR'}</span>
                <span className="hover:text-blue-600 cursor-pointer transition-colors">Support</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
  );
};

export default App;
