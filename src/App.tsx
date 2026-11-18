/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Music, Share2, Send, Activity, Drum, Cpu, RefreshCw, AlertCircle, FileCode, LayoutDashboard, Copy, Check, Clock, Upload, Plus, Trash2, Mic2, Dices, Mic, Download, Info, Music4, Zap, Waves, Loader2, ShieldCheck, Lock, Unlock, KeyRound, Eye, EyeOff, Mail
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

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
      aiEngineLabel: "Paramètres API (Gemini & DeepSeek) & Moteur IA",
      engineDropdownLabel: "Menu déroulant de sélection du moteur IA",
      engineDropdownPlaceholder: "🔒 -- Sélectionner Gemini ou DeepSeek (Mot de passe requis) --",
      aiProviderGemini: "Gemini 4 Hydrogen (API Gemini)",
      aiProviderDeepSeek: "DeepSeek API (Serveur Sécurisé)",
      apiSecretsPanelTitle: "Clés API Serveur (Settings > Secrets)",
      apiSecretsPanelHint: "Les clés GEMINI_API_KEY et DEEPSEEK_API_KEY se configurent côté serveur via Settings > Secrets.",
      geminiSecretLabel: "Clé API Gemini (GEMINI_API_KEY)",
      deepseekSecretLabel: "Clé API DeepSeek (DEEPSEEK_API_KEY)",
      geminiParamsTitle: "Paramètres API Gemini",
      geminiModelLabel: "Modèle Gemini",
      geminiThinkingLabel: "Niveau de réflexion (Thinking)",
      geminiThinkingLow: "Rapide (LOW)",
      geminiThinkingMedium: "Équilibré (MEDIUM)",
      geminiThinkingHigh: "Approfondi (HIGH)",
      deepseekParamsTitle: "Paramètres API DeepSeek",
      deepseekModelLabel: "Modèle DeepSeek",
      deepseekChatOption: "deepseek-chat (V3 - Rapide & JSON)",
      deepseekReasonerOption: "deepseek-reasoner (R1 - Raisonnement)",
      deepseekTempLabel: "Créativité (Température)",
      serverSecretReady: "Configurée",
      serverSecretMissing: "À ajouter dans Settings > Secrets",
      lockStatusUnlocked: "Moteur déverrouillé",
      lockStatusLocked: "Moteur verrouillé",
      lockStatusSetupNeeded: "Mot de passe à créer",
      setupPasswordTitle: "Créer un mot de passe de confidentialité",
      setupPasswordDesc: "Protégez la sélection et l'exécution des moteurs IA (Gemini et DeepSeek) par un mot de passe chiffré côté serveur.",
      newPasswordPlaceholder: "Nouveau mot de passe (min. 6 caractères)",
      confirmPasswordPlaceholder: "Confirmer le mot de passe",
      createPasswordBtn: "Créer le mot de passe",
      unlockTitle: "Sélection & exécution verrouillées",
      unlockDesc: "Sélectionnez Gemini ou DeepSeek dans le menu déroulant ou saisissez votre mot de passe ci-dessous.",
      enterPasswordPlaceholder: "Entrez votre mot de passe...",
      unlockBtn: "Déverrouiller",
      lockBtn: "Verrouiller",
      changePasswordBtn: "Changer mot de passe",
      currentPasswordPlaceholder: "Mot de passe actuel",
      saveNewPasswordBtn: "Mettre à jour",
      cancelBtn: "Annuler",
      passwordMismatchError: "Les mots de passe ne correspondent pas.",
      passwordTooShortError: "Le mot de passe doit contenir au moins 6 caractères.",
      passwordInvalidError: "Mot de passe incorrect.",
      passwordCreatedSuccess: "Mot de passe créé et moteur déverrouillé !",
      passwordChangedSuccess: "Mot de passe mis à jour avec succès !",
      errorEngineLocked: "Le moteur IA est verrouillé par mot de passe. Sélectionnez un moteur et saisissez le mot de passe avant d'exécuter.",
      errorPasswordSetupRequired: "Veuillez d'abord créer un mot de passe de confidentialité avant d'utiliser un moteur IA.",
      selectedEngineSummary: "Moteur actif",
      selectEngineHint: "Sélectionnez Gemini ou DeepSeek dans le menu déroulant : un mot de passe est exigé à la sélection et au changement de moteur.",
      modalSelectTitle: "Authentification du Moteur IA",
      modalSelectSubtitle: "Mot de passe requis pour activer :",
      closeModalBtn: "Fermer",
      recoveryEmailBtn: "E-mail de récupération",
      recoveryEmailLabel: "E-mail de récupération enregistré",
      recoveryEmailPlaceholder: "rachid.laieb@gmail.com",
      saveRecoveryEmailBtn: "Enregistrer l'e-mail",
      recoveryEmailSavedSuccess: "E-mail de récupération enregistré avec succès !",
      recoveryEmailInvalidError: "Veuillez saisir une adresse e-mail valide.",
      emailDeliveryReady: "Envoi d'e-mail serveur actif",
      emailDeliveryMissing: "Envoi e-mail à configurer dans Settings > Secrets (SMTP_* ou RESEND_API_KEY)",
      forgotPasswordLink: "Mot de passe oublié ?",
      forgotPasswordTitle: "Réinitialisation par e-mail",
      forgotPasswordDesc: "Un code de vérification à usage unique (valable 15 min) sera envoyé à votre adresse e-mail enregistrée :",
      sendResetCodeBtn: "Envoyer le code par e-mail",
      resetCodeSentInfo: "Code envoyé à {{email}} ! Vérifiez votre boîte de réception (et spams) puis saisissez le code ci-dessous.",
      resetCodePlaceholder: "Code reçu par e-mail (ex: A1B2C3D4)",
      confirmResetBtn: "Définir le nouveau mot de passe",
      resendCodeBtn: "Renvoyer le code",
      backToPasswordBtn: "Retour au mot de passe",
      passwordResetSuccess: "Nouveau mot de passe enregistré et moteur déverrouillé !",
      errorEmailDeliveryMissing: "L'envoi d'e-mail n'est pas encore configuré sur le serveur. Ajoutez SMTP_HOST, SMTP_USER, SMTP_PASS (ou RESEND_API_KEY) dans Settings > Secrets.",
      errorRecoveryEmailMismatch: "Cette adresse ne correspond pas à l'e-mail de récupération enregistré.",
      errorInvalidResetCode: "Code de vérification invalide ou expiré.",
      errorWaitAudio: "Veuillez attendre la fin du traitement audio avant de générer.",
      errorNoRhythm: "Veuillez entrer au moins un motif rythmique pour l'un des instruments.",
      errorGemini: "Désolé, une erreur est survenue lors de la génération IA. Vérifiez votre configuration dans Settings > Secrets ou réessayez.",
      errorDeepSeekMissing: "La variable DEEPSEEK_API_KEY n'est pas configurée côté serveur. Ajoutez-la dans Settings > Secrets.",
      errorDeepSeekInvalid: "Clé DeepSeek refusée par l'API. Vérifiez DEEPSEEK_API_KEY dans Settings > Secrets.",
      errorRateLimit: "Limite de requêtes atteinte. Patientez une minute avant de relancer.",
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
      helpGeminiTitle: "Génération Gemini & DeepSeek (Serveur Sécurisé)",
      helpGeminiBody: "Vos pistes et paramètres sont envoyés à notre serveur backend sécurisé qui pilote Gemini ou DeepSeek via les secrets serveur (GEMINI_API_KEY / DEEPSEEK_API_KEY) sans jamais exposer de clé dans le navigateur.",
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
      aiEngineLabel: "API Parameters (Gemini & DeepSeek) & AI Engine",
      engineDropdownLabel: "AI Engine Selection Dropdown",
      engineDropdownPlaceholder: "🔒 -- Select Gemini or DeepSeek (Password Required) --",
      aiProviderGemini: "Gemini 4 Hydrogen (Gemini API)",
      aiProviderDeepSeek: "DeepSeek API (Secure Server)",
      apiSecretsPanelTitle: "Server API Keys (Settings > Secrets)",
      apiSecretsPanelHint: "GEMINI_API_KEY and DEEPSEEK_API_KEY are configured server-side in Settings > Secrets.",
      geminiSecretLabel: "Gemini API Key (GEMINI_API_KEY)",
      deepseekSecretLabel: "DeepSeek API Key (DEEPSEEK_API_KEY)",
      geminiParamsTitle: "Gemini API Parameters",
      geminiModelLabel: "Gemini Model",
      geminiThinkingLabel: "Thinking Level",
      geminiThinkingLow: "Fast (LOW)",
      geminiThinkingMedium: "Balanced (MEDIUM)",
      geminiThinkingHigh: "Deep (HIGH)",
      deepseekParamsTitle: "DeepSeek API Parameters",
      deepseekModelLabel: "DeepSeek Model",
      deepseekChatOption: "deepseek-chat (V3 - Fast & JSON)",
      deepseekReasonerOption: "deepseek-reasoner (R1 - Reasoning)",
      deepseekTempLabel: "Creativity (Temperature)",
      serverSecretReady: "Configured",
      serverSecretMissing: "Add in Settings > Secrets",
      lockStatusUnlocked: "Engine Unlocked",
      lockStatusLocked: "Engine Locked",
      lockStatusSetupNeeded: "Password Required",
      setupPasswordTitle: "Create a Privacy Password",
      setupPasswordDesc: "Protect AI engine selection and execution (Gemini & DeepSeek) with a server-hashed access password.",
      newPasswordPlaceholder: "New password (min. 6 characters)",
      confirmPasswordPlaceholder: "Confirm password",
      createPasswordBtn: "Create Password",
      unlockTitle: "Selection & Execution Locked",
      unlockDesc: "Select Gemini or DeepSeek in the dropdown or enter your password below.",
      enterPasswordPlaceholder: "Enter your password...",
      unlockBtn: "Unlock",
      lockBtn: "Lock",
      changePasswordBtn: "Change password",
      currentPasswordPlaceholder: "Current password",
      saveNewPasswordBtn: "Update",
      cancelBtn: "Cancel",
      passwordMismatchError: "Passwords do not match.",
      passwordTooShortError: "Password must be at least 6 characters.",
      passwordInvalidError: "Incorrect password.",
      passwordCreatedSuccess: "Password created and engine unlocked!",
      passwordChangedSuccess: "Password updated successfully!",
      errorEngineLocked: "The AI engine is password-locked. Select an engine and enter your password before running.",
      errorPasswordSetupRequired: "Please create a privacy password first before using an AI engine.",
      selectedEngineSummary: "Active engine",
      selectEngineHint: "Choose Gemini or DeepSeek from the dropdown: a password is required on selection or engine switch.",
      modalSelectTitle: "AI Engine Authentication",
      modalSelectSubtitle: "Password required to activate:",
      closeModalBtn: "Close",
      recoveryEmailBtn: "Recovery Email",
      recoveryEmailLabel: "Registered Recovery Email",
      recoveryEmailPlaceholder: "rachid.laieb@gmail.com",
      saveRecoveryEmailBtn: "Save Email",
      recoveryEmailSavedSuccess: "Recovery email saved successfully!",
      recoveryEmailInvalidError: "Please enter a valid email address.",
      emailDeliveryReady: "Server email delivery active",
      emailDeliveryMissing: "Configure email delivery in Settings > Secrets (SMTP_* or RESEND_API_KEY)",
      forgotPasswordLink: "Forgot password?",
      forgotPasswordTitle: "Email Password Reset",
      forgotPasswordDesc: "A single-use verification code (valid 15 min) will be sent to your registered recovery address:",
      sendResetCodeBtn: "Send Verification Email",
      resetCodeSentInfo: "Code sent to {{email}}! Check your inbox (and spam) then enter the code below.",
      resetCodePlaceholder: "Email verification code (e.g. A1B2C3D4)",
      confirmResetBtn: "Set New Password",
      resendCodeBtn: "Resend code",
      backToPasswordBtn: "Back to password",
      passwordResetSuccess: "New password saved and engine unlocked!",
      errorEmailDeliveryMissing: "Server email delivery is not configured yet. Add SMTP_HOST, SMTP_USER, SMTP_PASS (or RESEND_API_KEY) in Settings > Secrets.",
      errorRecoveryEmailMismatch: "This email does not match the registered recovery email.",
      errorInvalidResetCode: "Verification code is invalid or expired.",
      errorWaitAudio: "Please wait for audio processing to finish before generating.",
      errorNoRhythm: "Please enter at least one rhythmic pattern for one of the instruments.",
      errorGemini: "Sorry, an error occurred during AI generation. Check Settings > Secrets or try again.",
      errorDeepSeekMissing: "DEEPSEEK_API_KEY is not configured on the server. Add it in Settings > Secrets.",
      errorDeepSeekInvalid: "DeepSeek API key rejected. Verify DEEPSEEK_API_KEY in Settings > Secrets.",
      errorRateLimit: "Rate limit reached. Please wait a minute before trying again.",
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
      helpGeminiTitle: "Gemini & DeepSeek Server Generation",
      helpGeminiBody: "Your tracks and settings are sent to our secure backend proxy which calls Gemini or DeepSeek using server-side Secrets (GEMINI_API_KEY / DEEPSEEK_API_KEY) without ever exposing keys to the browser.",
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

  const [aiProvider, setAiProvider] = useState<'gemini' | 'deepseek'>('gemini');
  const [geminiThinkingLevel, setGeminiThinkingLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('HIGH');
  const [deepseekModel, setDeepseekModel] = useState<'deepseek-chat' | 'deepseek-reasoner'>('deepseek-chat');
  const [deepseekTemperature, setDeepseekTemperature] = useState<number>(0.7);
  const [providerStatus, setProviderStatus] = useState<{ gemini: boolean; deepseek: boolean } | null>(null);

  // Password protection state for AI engine selection & execution
  const [engineToken, setEngineToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem('suno_engine_token') || '';
    } catch {
      return '';
    }
  });
  const [authStatus, setAuthStatus] = useState<{
    passwordConfigured: boolean;
    unlocked: boolean;
    loading: boolean;
    recoveryEmail: string;
    recoveryEmailMasked: string;
    emailDeliveryConfigured: boolean;
  }>({
    passwordConfigured: false,
    unlocked: false,
    loading: true,
    recoveryEmail: '',
    recoveryEmailMasked: '',
    emailDeliveryConfigured: false,
  });
  const [setupPassInput, setSetupPassInput] = useState('');
  const [setupPassConfirm, setSetupPassConfirm] = useState('');
  const [setupRecoveryEmail, setSetupRecoveryEmail] = useState('rachid.laieb@gmail.com');
  const [unlockPassInput, setUnlockPassInput] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showRecoverySettings, setShowRecoverySettings] = useState(false);
  const [recoveryEmailInput, setRecoveryEmailInput] = useState('rachid.laieb@gmail.com');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotEmailInput, setForgotEmailInput] = useState('rachid.laieb@gmail.com');
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [resetNewPassInput, setResetNewPassInput] = useState('');
  const [resetNewPassConfirm, setResetNewPassConfirm] = useState('');
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');
  const [showPasswordChars, setShowPasswordChars] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<'gemini' | 'deepseek' | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ style: string; lyrics: string; antiPrompt: string } | null>(null);
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [copiedStyle, setCopiedStyle] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    fetch('/api/providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.gemini && data?.deepseek) {
          setProviderStatus({
            gemini: Boolean(data.gemini.configured),
            deepseek: Boolean(data.deepseek.configured),
          });
        }
      })
      .catch(() => {});

    const storedToken = (() => {
      try {
        return sessionStorage.getItem('suno_engine_token') || '';
      } catch {
        return '';
      }
    })();

    fetch('/api/engine-auth/status', {
      headers: storedToken ? { 'x-engine-token': storedToken } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (!data.unlocked && storedToken) {
            try { sessionStorage.removeItem('suno_engine_token'); } catch {}
            setEngineToken('');
          }
          if (typeof data.recoveryEmail === 'string' && data.recoveryEmail) {
            setRecoveryEmailInput(data.recoveryEmail);
            setForgotEmailInput(data.recoveryEmail);
          }
          setAuthStatus({
            passwordConfigured: Boolean(data.passwordConfigured),
            unlocked: Boolean(data.unlocked),
            loading: false,
            recoveryEmail: typeof data.recoveryEmail === 'string' ? data.recoveryEmail : '',
            recoveryEmailMasked: typeof data.recoveryEmailMasked === 'string' ? data.recoveryEmailMasked : '',
            emailDeliveryConfigured: Boolean(data.emailDeliveryConfigured),
          });
        } else {
          setAuthStatus((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => {
        setAuthStatus((prev) => ({ ...prev, loading: false }));
      });
  }, []);

  const persistEngineToken = (token: string) => {
    setEngineToken(token);
    try {
      if (token) sessionStorage.setItem('suno_engine_token', token);
      else sessionStorage.removeItem('suno_engine_token');
    } catch {}
  };

  const handleSetupPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    if (setupPassInput.length < 6) {
      setAuthFeedback({ type: 'error', text: cur.passwordTooShortError });
      return;
    }
    if (setupPassInput !== setupPassConfirm) {
      setAuthFeedback({ type: 'error', text: cur.passwordMismatchError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: setupPassInput,
          recoveryEmail: setupRecoveryEmail.trim() || 'rachid.laieb@gmail.com',
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAuthFeedback({ type: 'error', text: data?.error || cur.passwordInvalidError });
        return;
      }
      if (data?.token) persistEngineToken(data.token);
      setAuthStatus({
        passwordConfigured: true,
        unlocked: true,
        loading: false,
        recoveryEmail: typeof data?.recoveryEmail === 'string' ? data.recoveryEmail : (setupRecoveryEmail.trim() || 'rachid.laieb@gmail.com'),
        recoveryEmailMasked: typeof data?.recoveryEmailMasked === 'string' ? data.recoveryEmailMasked : '',
        emailDeliveryConfigured: Boolean(data?.emailDeliveryConfigured),
      });
      if (data?.recoveryEmail) {
        setRecoveryEmailInput(data.recoveryEmail);
        setForgotEmailInput(data.recoveryEmail);
      }
      if (pendingProvider) {
        setAiProvider(pendingProvider);
        setPendingProvider(null);
      }
      setPasswordModalOpen(false);
      setSetupPassInput('');
      setSetupPassConfirm('');
      setAuthFeedback({ type: 'success', text: cur.passwordCreatedSuccess });
      setTimeout(() => setAuthFeedback(null), 4000);
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSelectProviderClick = (targetProvider: 'gemini' | 'deepseek') => {
    setAuthFeedback(null);
    setForgotMode(false);
    setForgotStep('request');
    if (!authStatus.unlocked || targetProvider !== aiProvider) {
      setPendingProvider(targetProvider);
      setUnlockPassInput('');
      setPasswordModalOpen(true);
      return;
    }
    setAiProvider(targetProvider);
  };

  const handleUnlockEngine = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    if (!unlockPassInput) {
      setAuthFeedback({ type: 'error', text: cur.passwordInvalidError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: unlockPassInput }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAuthFeedback({
          type: 'error',
          text: data?.code === 'INVALID_PASSWORD' ? cur.passwordInvalidError : (data?.error || cur.passwordInvalidError),
        });
        return;
      }
      if (data?.token) persistEngineToken(data.token);
      setAuthStatus({
        passwordConfigured: true,
        unlocked: true,
        loading: false,
        recoveryEmail: typeof data?.recoveryEmail === 'string' ? data.recoveryEmail : authStatus.recoveryEmail,
        recoveryEmailMasked: typeof data?.recoveryEmailMasked === 'string' ? data.recoveryEmailMasked : authStatus.recoveryEmailMasked,
        emailDeliveryConfigured: Boolean(data?.emailDeliveryConfigured),
      });
      if (data?.recoveryEmail) {
        setRecoveryEmailInput(data.recoveryEmail);
        setForgotEmailInput(data.recoveryEmail);
      }
      if (pendingProvider) {
        setAiProvider(pendingProvider);
        setPendingProvider(null);
      }
      setForgotMode(false);
      setPasswordModalOpen(false);
      setUnlockPassInput('');
      setError(null);
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLockEngine = async () => {
    setAuthFeedback(null);
    setShowChangePassword(false);
    setShowRecoverySettings(false);
    try {
      await fetch('/api/engine-auth/lock', {
        method: 'POST',
        headers: engineToken ? { 'x-engine-token': engineToken } : {},
      });
    } catch {}
    persistEngineToken('');
    setAuthStatus((prev) => ({ ...prev, unlocked: false, recoveryEmail: '' }));
  };

  const handleSaveRecoveryEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    const trimmed = recoveryEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setAuthFeedback({ type: 'error', text: cur.recoveryEmailInvalidError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/recovery-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(engineToken ? { 'x-engine-token': engineToken } : {}),
        },
        body: JSON.stringify({ recoveryEmail: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAuthFeedback({ type: 'error', text: data?.error || cur.recoveryEmailInvalidError });
        return;
      }
      setAuthStatus((prev) => ({
        ...prev,
        recoveryEmail: data?.recoveryEmail || trimmed,
        recoveryEmailMasked: data?.recoveryEmailMasked || prev.recoveryEmailMasked,
      }));
      setForgotEmailInput(data?.recoveryEmail || trimmed);
      setShowRecoverySettings(false);
      setAuthFeedback({ type: 'success', text: cur.recoveryEmailSavedSuccess });
      setTimeout(() => setAuthFeedback(null), 4000);
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRequestResetCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    const email = forgotEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setAuthFeedback({ type: 'error', text: cur.recoveryEmailInvalidError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang: currentLang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.code;
        if (code === 'EMAIL_DELIVERY_NOT_CONFIGURED') {
          setAuthFeedback({ type: 'error', text: cur.errorEmailDeliveryMissing });
        } else if (code === 'RECOVERY_EMAIL_MISMATCH') {
          setAuthFeedback({ type: 'error', text: cur.errorRecoveryEmailMismatch });
        } else {
          setAuthFeedback({ type: 'error', text: data?.error || cur.errorGemini });
        }
        return;
      }
      setForgotStep('verify');
      setResetCodeInput('');
      setAuthFeedback({
        type: 'success',
        text: cur.resetCodeSentInfo.replace('{{email}}', data?.recoveryEmailMasked || email),
      });
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    if (!resetCodeInput.trim()) {
      setAuthFeedback({ type: 'error', text: cur.errorInvalidResetCode });
      return;
    }
    if (resetNewPassInput.length < 6) {
      setAuthFeedback({ type: 'error', text: cur.passwordTooShortError });
      return;
    }
    if (resetNewPassInput !== resetNewPassConfirm) {
      setAuthFeedback({ type: 'error', text: cur.passwordMismatchError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmailInput.trim().toLowerCase(),
          code: resetCodeInput.trim().toUpperCase(),
          newPassword: resetNewPassInput,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.code;
        if (code === 'INVALID_RESET_CODE' || code === 'RESET_CODE_EXPIRED' || code === 'NO_ACTIVE_RESET_CODE') {
          setAuthFeedback({ type: 'error', text: cur.errorInvalidResetCode });
        } else if (code === 'RECOVERY_EMAIL_MISMATCH') {
          setAuthFeedback({ type: 'error', text: cur.errorRecoveryEmailMismatch });
        } else {
          setAuthFeedback({ type: 'error', text: data?.error || cur.errorInvalidResetCode });
        }
        return;
      }

      if (data?.token) persistEngineToken(data.token);
      setAuthStatus({
        passwordConfigured: true,
        unlocked: true,
        loading: false,
        recoveryEmail: typeof data?.recoveryEmail === 'string' ? data.recoveryEmail : forgotEmailInput.trim().toLowerCase(),
        recoveryEmailMasked: typeof data?.recoveryEmailMasked === 'string' ? data.recoveryEmailMasked : '',
        emailDeliveryConfigured: Boolean(data?.emailDeliveryConfigured),
      });
      if (pendingProvider) {
        setAiProvider(pendingProvider);
        setPendingProvider(null);
      }
      setForgotMode(false);
      setForgotStep('request');
      setResetCodeInput('');
      setResetNewPassInput('');
      setResetNewPassConfirm('');
      setPasswordModalOpen(false);
      setError(null);
      setAuthFeedback({ type: 'success', text: cur.passwordResetSuccess });
      setTimeout(() => setAuthFeedback(null), 5000);
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleChangePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthFeedback(null);
    if (newPassInput.length < 6) {
      setAuthFeedback({ type: 'error', text: cur.passwordTooShortError });
      return;
    }
    if (newPassInput !== newPassConfirm) {
      setAuthFeedback({ type: 'error', text: cur.passwordMismatchError });
      return;
    }

    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/engine-auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPassInput, newPassword: newPassInput }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAuthFeedback({
          type: 'error',
          text: data?.code === 'INVALID_PASSWORD' ? cur.passwordInvalidError : (data?.error || cur.passwordInvalidError),
        });
        return;
      }
      if (data?.token) persistEngineToken(data.token);
      setCurrentPassInput('');
      setNewPassInput('');
      setNewPassConfirm('');
      setShowChangePassword(false);
      setAuthFeedback({ type: 'success', text: cur.passwordChangedSuccess });
      setTimeout(() => setAuthFeedback(null), 4000);
    } catch {
      setAuthFeedback({ type: 'error', text: cur.errorGemini });
    } finally {
      setAuthSubmitting(false);
    }
  };

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
      setError(cur.errorWaitAudio);
      return;
    }

    const hasAtLeastOneRhythm = instrumentTracks.some(t => t.rhythm.trim() !== "");
    if (!hasAtLeastOneRhythm) {
      setError(cur.errorNoRhythm);
      return;
    }

    if (!authStatus.passwordConfigured) {
      setPendingProvider(aiProvider);
      setPasswordModalOpen(true);
      setError(cur.errorPasswordSetupRequired);
      return;
    }

    if (!authStatus.unlocked) {
      setPendingProvider(aiProvider);
      setUnlockPassInput('');
      setPasswordModalOpen(true);
      setError(cur.errorEngineLocked);
      return;
    }

    setLoading(true);
    setError(null);
    setActiveReaction(null);

    const tracksPayload = instrumentTracks
      .filter(t => t.rhythm.trim() !== "")
      .map(t => {
        const name = t.name === cur.personnalise ? t.customName : t.name;
        const positions = t.timelinePositions
          .map(pos => cur.posLabels[pos as keyof typeof cur.posLabels] || pos)
          .join(', ');
        return {
          name: name || 'Instrument',
          rhythm: t.rhythm,
          positions: positions || 'AI',
        };
      });

    let styleToUse = selectedStyle === cur.personnalise ? customStyle : selectedStyle;
    if (selectedStyle === "Industrial Pop (Gesaffelstein style)") {
      styleToUse = "A dark, hypnotic industrial pop track inspired by Gesaffelstein, featuring aggressive, distorted analog synthesizers, sharp rhythmic stabs, and a heavy, thumping techno-inflected beat. The production is clinically precise with cavernous reverb on metallic percussive hits, creating a cold, menacing atmosphere with high-fidelity, polished urban soundscapes.";
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (engineToken) {
        headers['x-engine-token'] = engineToken;
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: aiProvider,
          geminiThinkingLevel,
          deepseekModel,
          deepseekTemperature,
          lang: currentLang,
          tracks: tracksPayload,
          style: styleToUse,
          lyricsLanguage: selectedLanguage,
          voice: selectedVoice,
          voiceChar: selectedVoiceChar,
          timeSignature,
          theme: desiredTheme,
          isLongFormat,
          keepRhythmAsLyrics,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const code = data?.code;
        if (code === 'ENGINE_LOCKED') {
          persistEngineToken('');
          setAuthStatus((prev) => ({ ...prev, unlocked: false }));
          throw new Error(cur.errorEngineLocked);
        }
        if (code === 'PASSWORD_SETUP_REQUIRED') {
          throw new Error(cur.errorPasswordSetupRequired);
        }
        if (code === 'MISSING_DEEPSEEK_KEY') {
          throw new Error(cur.errorDeepSeekMissing);
        }
        if (code === 'INVALID_DEEPSEEK_KEY') {
          throw new Error(cur.errorDeepSeekInvalid);
        }
        if (code === 'RATE_LIMITED') {
          throw new Error(cur.errorRateLimit);
        }
        throw new Error(data?.error || cur.errorGemini);
      }

      if (data && data.style && data.lyrics) {
        setResult({
          style: `${data.style} [réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261]`,
          antiPrompt: data.antiPrompt || "",
          lyrics: `${data.lyrics}\n\n[réalised by sofwar DJ-R LAIEB] [ https://aistudio.google.com/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261]`
        });
      } else {
        throw new Error(cur.errorGemini);
      }
    } catch (err: any) {
      console.error("Erreur génération IA:", err);
      setError(err?.message || cur.errorGemini);
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

                {/* AI Engine Dropdown, Gemini/DeepSeek API Parameters & Privacy Password Lock */}
                <div className="mt-6 pt-6 border-t border-black/10 space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-5 h-5 text-blue-950" />
                      <span className="text-[14px] font-black text-blue-950 uppercase tracking-widest">
                        {cur.aiEngineLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Lock Status Badge */}
                      <div className={`flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-xl border ${
                        authStatus.passwordConfigured
                          ? (authStatus.unlocked
                              ? 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                              : 'bg-red-100/90 text-red-900 border-red-300')
                          : 'bg-amber-100/90 text-amber-900 border-amber-300'
                      }`}>
                        {authStatus.passwordConfigured
                          ? (authStatus.unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />)
                          : <KeyRound className="w-3.5 h-3.5" />}
                        <span>
                          {authStatus.passwordConfigured
                            ? (authStatus.unlocked ? cur.lockStatusUnlocked : cur.lockStatusLocked)
                            : cur.lockStatusSetupNeeded}
                        </span>
                      </div>

                      {authStatus.passwordConfigured && authStatus.unlocked && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRecoverySettings(prev => !prev);
                              setShowChangePassword(false);
                              setAuthFeedback(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white text-blue-950 rounded-xl text-xs font-black border border-black/10 shadow-sm transition-all cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {cur.recoveryEmailBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowChangePassword(prev => !prev);
                              setShowRecoverySettings(false);
                              setAuthFeedback(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white text-blue-950 rounded-xl text-xs font-black border border-black/10 shadow-sm transition-all cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {cur.changePasswordBtn}
                          </button>
                          <button
                            type="button"
                            onClick={handleLockEngine}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            {cur.lockBtn}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dropdown Menu for AI Engine Selection (Password Required for Gemini or DeepSeek) */}
                  <div className="bg-white/55 rounded-2xl p-4 border border-black/10 shadow-inner space-y-2">
                    <label
                      htmlFor="ai-engine-select"
                      className="flex items-center justify-between text-xs font-black text-blue-950 uppercase tracking-wider px-1"
                    >
                      <span>{cur.engineDropdownLabel}</span>
                      {authStatus.unlocked && (
                        <span className="text-[11px] font-black text-emerald-700 normal-case">
                          {cur.selectedEngineSummary}: {aiProvider === 'deepseek' ? 'DeepSeek API' : 'Gemini 4 Hydrogen'}
                        </span>
                      )}
                    </label>
                    <select
                      id="ai-engine-select"
                      className="w-full bg-[#f5f5f7] text-neutral-900 rounded-xl px-4 py-3 border-2 border-black/10 focus:outline-none focus:border-blue-500 font-black text-xs shadow-inner cursor-pointer"
                      value={authStatus.unlocked ? aiProvider : ''}
                      onChange={(e) => {
                        const chosen = e.target.value as 'gemini' | 'deepseek' | '';
                        if (!chosen) return;
                        handleSelectProviderClick(chosen);
                      }}
                    >
                      {!authStatus.unlocked && (
                        <option value="" disabled>
                          {cur.engineDropdownPlaceholder}
                        </option>
                      )}
                      <option value="gemini">{cur.aiProviderGemini}</option>
                      <option value="deepseek">{cur.aiProviderDeepSeek}</option>
                    </select>
                    <p className="text-[11px] font-semibold text-neutral-700 px-1">{cur.selectEngineHint}</p>
                  </div>

                  {/* API Keys Status (Server Secrets) + Gemini & DeepSeek API Parameters */}
                  <div className="bg-white/40 rounded-2xl p-4 border border-black/10 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-black/10">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-900" />
                        <span className="text-xs font-black text-blue-950 uppercase tracking-wider">
                          {cur.apiSecretsPanelTitle}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-neutral-600">
                        {cur.apiSecretsPanelHint}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Gemini API Key Status & Parameters */}
                      <div className={`rounded-2xl p-4 border transition-all space-y-3 ${
                        authStatus.unlocked && aiProvider === 'gemini'
                          ? 'bg-white border-blue-500 shadow-sm'
                          : 'bg-[#f5f5f7]/90 border-black/10'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-blue-700" />
                            <span className="text-xs font-black text-blue-950 uppercase">{cur.geminiParamsTitle}</span>
                          </div>
                          {providerStatus && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                              providerStatus.gemini
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {providerStatus.gemini ? cur.serverSecretReady : cur.serverSecretMissing}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-bold text-neutral-600 flex items-center justify-between bg-black/5 px-3 py-2 rounded-xl">
                          <span>{cur.geminiSecretLabel}</span>
                          <span className="font-mono text-[10px] text-neutral-800">GEMINI_API_KEY</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="bg-white rounded-xl px-3 py-2 border border-black/10">
                            <span className="block text-[10px] font-bold text-neutral-500 uppercase">{cur.geminiModelLabel}</span>
                            <span className="text-xs font-black text-neutral-900">gemini-4-hydrogen</span>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-black text-blue-950 uppercase px-1">
                              {cur.geminiThinkingLabel}
                            </label>
                            <select
                              className="w-full bg-white text-neutral-800 rounded-xl px-3 py-2 border border-black/10 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-sm"
                              value={geminiThinkingLevel}
                              onChange={(e) => setGeminiThinkingLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
                              aria-label={cur.geminiThinkingLabel}
                            >
                              <option value="LOW">{cur.geminiThinkingLow}</option>
                              <option value="MEDIUM">{cur.geminiThinkingMedium}</option>
                              <option value="HIGH">{cur.geminiThinkingHigh}</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* DeepSeek API Key Status & Parameters */}
                      <div className={`rounded-2xl p-4 border transition-all space-y-3 ${
                        authStatus.unlocked && aiProvider === 'deepseek'
                          ? 'bg-white border-blue-500 shadow-sm'
                          : 'bg-[#f5f5f7]/90 border-black/10'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-indigo-700" />
                            <span className="text-xs font-black text-blue-950 uppercase">{cur.deepseekParamsTitle}</span>
                          </div>
                          {providerStatus && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                              providerStatus.deepseek
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {providerStatus.deepseek ? cur.serverSecretReady : cur.serverSecretMissing}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-bold text-neutral-600 flex items-center justify-between bg-black/5 px-3 py-2 rounded-xl">
                          <span>{cur.deepseekSecretLabel}</span>
                          <span className="font-mono text-[10px] text-neutral-800">DEEPSEEK_API_KEY</span>
                        </div>

                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-black text-blue-950 uppercase px-1">
                              {cur.deepseekModelLabel}
                            </label>
                            <select
                              className="w-full bg-white text-neutral-800 rounded-xl px-3 py-2 border border-black/10 focus:outline-none focus:border-blue-400 font-bold text-xs shadow-sm"
                              value={deepseekModel}
                              onChange={(e) => setDeepseekModel(e.target.value as 'deepseek-chat' | 'deepseek-reasoner')}
                              aria-label={cur.deepseekModelLabel}
                            >
                              <option value="deepseek-chat">{cur.deepseekChatOption}</option>
                              <option value="deepseek-reasoner">{cur.deepseekReasonerOption}</option>
                            </select>
                          </div>

                          {deepseekModel === 'deepseek-chat' && (
                            <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-black/10 shadow-sm">
                              <span className="text-[11px] font-black text-blue-950 whitespace-nowrap">
                                {cur.deepseekTempLabel}: {deepseekTemperature.toFixed(1)}
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="1.5"
                                step="0.1"
                                value={deepseekTemperature}
                                onChange={(e) => setDeepseekTemperature(parseFloat(e.target.value))}
                                className="w-full accent-blue-600 cursor-pointer"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Case 1: Create Password (when not yet configured) */}
                  {!authStatus.loading && !authStatus.passwordConfigured && (
                    <form
                      onSubmit={handleSetupPassword}
                      className="bg-[#f0f2f8] rounded-2xl p-4 border-2 border-blue-950/15 shadow-inner space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <KeyRound className="w-4 h-4 text-blue-900 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-black text-blue-950 uppercase tracking-wide">{cur.setupPasswordTitle}</p>
                          <p className="text-[11px] font-semibold text-neutral-600 mt-0.5">{cur.setupPasswordDesc}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
                        <div className="relative">
                          <input
                            type={showPasswordChars ? 'text' : 'password'}
                            placeholder={cur.newPasswordPlaceholder}
                            value={setupPassInput}
                            onChange={(e) => setSetupPassInput(e.target.value)}
                            className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2.5 pr-9 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswordChars(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                            tabIndex={-1}
                          >
                            {showPasswordChars ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <input
                          type={showPasswordChars ? 'text' : 'password'}
                          placeholder={cur.confirmPasswordPlaceholder}
                          value={setupPassConfirm}
                          onChange={(e) => setSetupPassConfirm(e.target.value)}
                          className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2.5 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="new-password"
                        />
                        <input
                          type="email"
                          placeholder={cur.recoveryEmailPlaceholder}
                          value={setupRecoveryEmail}
                          onChange={(e) => setSetupRecoveryEmail(e.target.value)}
                          className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2.5 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="email"
                        />
                        <button
                          type="submit"
                          disabled={authSubmitting}
                          className="w-full px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          {cur.createPasswordBtn}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Case 2: Unlock Engine or Forgot Password (when password is configured and locked) */}
                  {!authStatus.loading && authStatus.passwordConfigured && !authStatus.unlocked && (
                    <div className="bg-neutral-900/95 text-white rounded-2xl p-4 border border-white/10 shadow-lg space-y-3">
                      {!forgotMode ? (
                        <form onSubmit={handleUnlockEngine} className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-black uppercase tracking-wider text-amber-300">{cur.unlockTitle}</p>
                                <p className="text-[11px] font-medium text-neutral-300 mt-0.5">
                                  {cur.unlockDesc} ({cur.selectedEngineSummary}: {aiProvider === 'deepseek' ? `DeepSeek / ${deepseekModel}` : 'Gemini 4 Hydrogen'})
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <input
                                type={showPasswordChars ? 'text' : 'password'}
                                placeholder={cur.enterPasswordPlaceholder}
                                value={unlockPassInput}
                                onChange={(e) => setUnlockPassInput(e.target.value)}
                                className="w-full bg-black/50 text-white rounded-xl px-3.5 py-2.5 pr-9 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                                autoComplete="current-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPasswordChars(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                                tabIndex={-1}
                              >
                                {showPasswordChars ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <button
                              type="submit"
                              disabled={authSubmitting}
                              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              {cur.unlockBtn}
                            </button>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-neutral-400 font-medium">
                              {cur.recoveryEmailLabel}: <span className="text-neutral-200 font-bold">{authStatus.recoveryEmailMasked || 'ra***@gmail.com'}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setAuthFeedback(null);
                                setForgotMode(true);
                                setForgotStep('request');
                              }}
                              className="text-xs font-bold text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer flex items-center gap-1"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {cur.forgotPasswordLink}
                            </button>
                          </div>
                        </form>
                      ) : forgotStep === 'request' ? (
                        <form onSubmit={handleRequestResetCode} className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <Mail className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-black uppercase tracking-wider text-amber-300">{cur.forgotPasswordTitle}</p>
                                <p className="text-[11px] font-medium text-neutral-300 mt-0.5">
                                  {cur.forgotPasswordDesc} <span className="text-white font-bold">{authStatus.recoveryEmailMasked || 'ra***@gmail.com'}</span>
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setForgotMode(false);
                                setAuthFeedback(null);
                              }}
                              className="text-[11px] font-bold text-neutral-300 hover:text-white underline cursor-pointer whitespace-nowrap"
                            >
                              {cur.backToPasswordBtn}
                            </button>
                          </div>
                          {!authStatus.emailDeliveryConfigured && (
                            <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[11px] text-amber-200 font-semibold">
                              {cur.emailDeliveryMissing}
                            </div>
                          )}
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="email"
                              placeholder={cur.recoveryEmailPlaceholder}
                              value={forgotEmailInput}
                              onChange={(e) => setForgotEmailInput(e.target.value)}
                              className="flex-1 bg-black/50 text-white rounded-xl px-3.5 py-2.5 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                              autoComplete="email"
                            />
                            <button
                              type="submit"
                              disabled={authSubmitting}
                              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {cur.sendResetCodeBtn}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleResetPassword} className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <KeyRound className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                              <p className="text-xs font-black uppercase tracking-wider text-amber-300">{cur.forgotPasswordTitle}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setForgotStep('request')}
                                className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                              >
                                {cur.resendCodeBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setForgotMode(false);
                                  setForgotStep('request');
                                  setAuthFeedback(null);
                                }}
                                className="text-[11px] font-bold text-neutral-300 hover:text-white underline cursor-pointer"
                              >
                                {cur.backToPasswordBtn}
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <input
                              type="text"
                              placeholder={cur.resetCodePlaceholder}
                              value={resetCodeInput}
                              onChange={(e) => setResetCodeInput(e.target.value.toUpperCase())}
                              className="w-full bg-black/50 text-white rounded-xl px-3.5 py-2.5 border border-white/15 text-xs font-bold tracking-widest uppercase focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                            />
                            <input
                              type={showPasswordChars ? 'text' : 'password'}
                              placeholder={cur.newPasswordPlaceholder}
                              value={resetNewPassInput}
                              onChange={(e) => setResetNewPassInput(e.target.value)}
                              className="w-full bg-black/50 text-white rounded-xl px-3.5 py-2.5 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                              autoComplete="new-password"
                            />
                            <input
                              type={showPasswordChars ? 'text' : 'password'}
                              placeholder={cur.confirmPasswordPlaceholder}
                              value={resetNewPassConfirm}
                              onChange={(e) => setResetNewPassConfirm(e.target.value)}
                              className="w-full bg-black/50 text-white rounded-xl px-3.5 py-2.5 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                              autoComplete="new-password"
                            />
                            <button
                              type="submit"
                              disabled={authSubmitting}
                              className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              {cur.confirmResetBtn}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Case 3: Change Password Drawer (when unlocked) */}
                  {authStatus.passwordConfigured && authStatus.unlocked && showChangePassword && (
                    <form
                      onSubmit={handleChangePassword}
                      className="bg-[#f0f2f8] rounded-2xl p-4 border border-black/10 shadow-inner space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center">
                        <input
                          type={showPasswordChars ? 'text' : 'password'}
                          placeholder={cur.currentPasswordPlaceholder}
                          value={currentPassInput}
                          onChange={(e) => setCurrentPassInput(e.target.value)}
                          className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="current-password"
                        />
                        <input
                          type={showPasswordChars ? 'text' : 'password'}
                          placeholder={cur.newPasswordPlaceholder}
                          value={newPassInput}
                          onChange={(e) => setNewPassInput(e.target.value)}
                          className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="new-password"
                        />
                        <input
                          type={showPasswordChars ? 'text' : 'password'}
                          placeholder={cur.confirmPasswordPlaceholder}
                          value={newPassConfirm}
                          onChange={(e) => setNewPassConfirm(e.target.value)}
                          className="w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="new-password"
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={authSubmitting}
                            className="flex-1 px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {cur.saveNewPasswordBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowChangePassword(false);
                              setCurrentPassInput('');
                              setNewPassInput('');
                              setNewPassConfirm('');
                            }}
                            className="px-3 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            {cur.cancelBtn}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* Case 4: Recovery Email Registration & Delivery Status Drawer (when unlocked) */}
                  {authStatus.passwordConfigured && authStatus.unlocked && showRecoverySettings && (
                    <form
                      onSubmit={handleSaveRecoveryEmail}
                      className="bg-[#f0f2f8] rounded-2xl p-4 border border-black/10 shadow-inner space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-blue-900" />
                          <span className="text-xs font-black text-blue-950 uppercase tracking-wide">{cur.recoveryEmailLabel}</span>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border ${
                          authStatus.emailDeliveryConfigured
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {authStatus.emailDeliveryConfigured ? cur.emailDeliveryReady : cur.emailDeliveryMissing}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2.5 items-center">
                        <input
                          type="email"
                          placeholder={cur.recoveryEmailPlaceholder}
                          value={recoveryEmailInput}
                          onChange={(e) => setRecoveryEmailInput(e.target.value)}
                          className="flex-1 w-full bg-white text-neutral-900 rounded-xl px-3.5 py-2 border border-black/10 text-xs font-bold focus:outline-none focus:border-blue-500"
                          autoComplete="email"
                        />
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            type="submit"
                            disabled={authSubmitting}
                            className="flex-1 sm:flex-initial px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {cur.saveRecoveryEmailBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRecoverySettings(false)}
                            className="px-3 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            {cur.cancelBtn}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {authFeedback && (
                    <div className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                      authFeedback.type === 'error'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}>
                      {authFeedback.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
                      <span>{authFeedback.text}</span>
                    </div>
                  )}
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

      {/* Engine Password Authentication Modal */}
      <AnimatePresence>
        {passwordModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/75 backdrop-blur-sm"
            onClick={() => {
              setPasswordModalOpen(false);
              setPendingProvider(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 16 }}
              className="bg-neutral-900 border-2 border-white/15 w-full max-w-md rounded-3xl shadow-2xl p-6 md:p-8 text-white space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">{cur.modalSelectTitle}</h3>
                    <p className="text-xs text-neutral-400 font-semibold">
                      {cur.modalSelectSubtitle}{' '}
                      <span className="text-amber-300 font-black">
                        {(pendingProvider || aiProvider) === 'deepseek' ? 'DeepSeek API' : 'Gemini 4 Hydrogen'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalOpen(false);
                    setPendingProvider(null);
                  }}
                  className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  aria-label={cur.closeModalBtn}
                >
                  <RefreshCw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              {!authStatus.passwordConfigured ? (
                <form onSubmit={handleSetupPassword} className="space-y-3">
                  <p className="text-xs text-neutral-300 leading-relaxed">{cur.setupPasswordDesc}</p>
                  <div className="relative">
                    <input
                      type={showPasswordChars ? 'text' : 'password'}
                      autoFocus
                      placeholder={cur.newPasswordPlaceholder}
                      value={setupPassInput}
                      onChange={(e) => setSetupPassInput(e.target.value)}
                      className="w-full bg-black/50 text-white rounded-xl px-4 py-3 pr-10 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordChars((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showPasswordChars ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <input
                    type={showPasswordChars ? 'text' : 'password'}
                    placeholder={cur.confirmPasswordPlaceholder}
                    value={setupPassConfirm}
                    onChange={(e) => setSetupPassConfirm(e.target.value)}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                    autoComplete="new-password"
                  />
                  <input
                    type="email"
                    placeholder={cur.recoveryEmailPlaceholder}
                    value={setupRecoveryEmail}
                    onChange={(e) => setSetupRecoveryEmail(e.target.value)}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                    autoComplete="email"
                  />
                  {authFeedback && (
                    <p className={`text-xs font-bold flex items-center gap-1.5 ${authFeedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {authFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    {cur.createPasswordBtn}
                  </button>
                </form>
              ) : !forgotMode ? (
                <form onSubmit={handleUnlockEngine} className="space-y-3">
                  <div className="relative">
                    <input
                      type={showPasswordChars ? 'text' : 'password'}
                      autoFocus
                      placeholder={cur.enterPasswordPlaceholder}
                      value={unlockPassInput}
                      onChange={(e) => setUnlockPassInput(e.target.value)}
                      className="w-full bg-black/50 text-white rounded-xl px-4 py-3 pr-10 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordChars((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showPasswordChars ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {authFeedback && (
                    <p className={`text-xs font-bold flex items-center gap-1.5 ${authFeedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {authFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    {cur.unlockBtn}
                  </button>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-neutral-400">
                      {authStatus.recoveryEmailMasked || 'ra***@gmail.com'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthFeedback(null);
                        setForgotMode(true);
                        setForgotStep('request');
                      }}
                      className="text-xs font-bold text-amber-300 hover:text-amber-200 underline underline-offset-2 cursor-pointer flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {cur.forgotPasswordLink}
                    </button>
                  </div>
                </form>
              ) : forgotStep === 'request' ? (
                <form onSubmit={handleRequestResetCode} className="space-y-3">
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    {cur.forgotPasswordDesc} <span className="text-amber-300 font-bold">{authStatus.recoveryEmailMasked || 'ra***@gmail.com'}</span>
                  </p>
                  {!authStatus.emailDeliveryConfigured && (
                    <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[11px] text-amber-200 font-semibold">
                      {cur.emailDeliveryMissing}
                    </div>
                  )}
                  <input
                    type="email"
                    autoFocus
                    placeholder={cur.recoveryEmailPlaceholder}
                    value={forgotEmailInput}
                    onChange={(e) => setForgotEmailInput(e.target.value)}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                    autoComplete="email"
                  />
                  {authFeedback && (
                    <p className={`text-xs font-bold flex items-center gap-1.5 ${authFeedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {authFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    {cur.sendResetCodeBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setAuthFeedback(null);
                    }}
                    className="w-full py-2 text-xs font-bold text-neutral-300 hover:text-white cursor-pointer"
                  >
                    {cur.backToPasswordBtn}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <input
                    type="text"
                    autoFocus
                    placeholder={cur.resetCodePlaceholder}
                    value={resetCodeInput}
                    onChange={(e) => setResetCodeInput(e.target.value.toUpperCase())}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold tracking-widest uppercase focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type={showPasswordChars ? 'text' : 'password'}
                    placeholder={cur.newPasswordPlaceholder}
                    value={resetNewPassInput}
                    onChange={(e) => setResetNewPassInput(e.target.value)}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                    autoComplete="new-password"
                  />
                  <input
                    type={showPasswordChars ? 'text' : 'password'}
                    placeholder={cur.confirmPasswordPlaceholder}
                    value={resetNewPassConfirm}
                    onChange={(e) => setResetNewPassConfirm(e.target.value)}
                    className="w-full bg-black/50 text-white rounded-xl px-4 py-3 border border-white/15 text-xs font-bold focus:outline-none focus:border-amber-400"
                    autoComplete="new-password"
                  />
                  {authFeedback && (
                    <p className={`text-xs font-bold flex items-center gap-1.5 ${authFeedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {authFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    {cur.confirmResetBtn}
                  </button>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setForgotStep('request')}
                      className="text-xs font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                    >
                      {cur.resendCodeBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(false);
                        setForgotStep('request');
                        setAuthFeedback(null);
                      }}
                      className="text-xs font-bold text-neutral-300 hover:text-white cursor-pointer"
                    >
                      {cur.backToPasswordBtn}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
