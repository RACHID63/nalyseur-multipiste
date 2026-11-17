<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cdffb8f5-43de-45ac-9eaa-308108c0e261

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Déployer sur GitHub Pages

Ce projet est une application **Vite + React** : elle doit être *compilée* (`npm run build`) avant d'être publiée. GitHub Pages sert uniquement des fichiers statiques, donc le `index.html` source (qui pointe vers `/src/main.tsx`) affiche une page blanche tant qu'aucun build n'est publié.

Le fichier [.github/workflows/deploy.yml](.github/workflows/deploy.yml) compile automatiquement l'application et la publie sur GitHub Pages à chaque `git push` sur `main`.

**Étapes :**

1. Poussez ce dépôt sur GitHub (branche `main`).
2. Allez dans **Settings → Pages** et choisissez **Source : GitHub Actions**.
3. Le workflow s'exécute automatiquement ; le site est ensuite disponible sur `https://<votre-pseudo>.github.io/nalyseur-multipiste/`.

> ⚠️ **Limitation importante** : GitHub Pages est 100 % statique et ne peut pas exécuter le serveur Express ([server.ts](server.ts)). L'interface et les outils audio locaux (extraction de rythme, transcription MIDI, génération aléatoire) fonctionneront, mais la **génération IA via Gemini / DeepSeek** (endpoints `/api/*`) nécessite le backend et ne fonctionnera pas sur GitHub Pages. Pour cette fonctionnalité, déployez plutôt l'application sur AI Studio ou un hébergeur Node.js (Render, Railway, Vercel, Fly.io…).

## Déployer sur Render (front + backend, gratuit)

Le fichier [render.yaml](render.yaml) permet un déploiement **en 1 clic** sur [Render](https://render.com) (plan gratuit, sans carte bancaire), avec le backend Express **et** la génération IA.

**Étapes :**

1. Poussez ce dépôt sur GitHub (branche `main`).
2. Sur [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → sélectionnez le dépôt `nalyseur-multipiste`.
3. Render détecte [render.yaml](render.yaml) et crée le service automatiquement (build + démarrage inclus).
4. Dans **Environment** du service, renseignez les secrets `GEMINI_API_KEY` et `DEEPSEEK_API_KEY` (elles restent privées, jamais exposées au navigateur).
5. Vous obtenez une URL `https://nalyseur-multipiste.onrender.com`.

> L'instance gratuite se met en veille après ~15 min d'inactivité ; le premier chargement suivant peut prendre ~1 min (cold start).
