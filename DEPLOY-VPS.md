# Déployer sur un VPS (Hostinger ou autre)

Ce guide déploie l'application complète (front React + backend Express + génération IA) sur un VPS avec Docker. L'app tourne 24 h/24 → **aucun cold start**.

## Prérequis

- Un VPS avec Ubuntu/Debian (Hostinger : panneau **hPanel → VPS → SSH**).
- Connaître l'**IP du VPS** et pouvoir se connecter en SSH.

## 1. Se connecter au VPS

```bash
ssh root@IP_DU_VPS
```

## 2. Installer Docker + Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
# Vérifier :
docker --version
docker compose version
```

## 3. Récupérer le code et configurer la clé

```bash
git clone https://github.com/RACHID63/nalyseur-multipiste.git
cd nalyseur-multipiste

# Créer le fichier de secrets (ignoré par Git, jamais publié)
cat > .env <<'EOF'
DEEPSEEK_API_KEY="sk-votre-cle-ici"
# GEMINI_API_KEY=""
EOF
```

> Remplacez `sk-votre-cle-ici` par votre vraie clé DeepSeek.

## 4. Construire et lancer

```bash
docker compose up -d --build
```

Vérifier que ça tourne :

```bash
docker compose ps
docker compose logs -f app
```

## 5. Tester

Ouvrez dans votre navigateur : `http://IP_DU_VPS:3000`

L'interface s'affiche et la génération IA fonctionne (backend inclus).

## 6. (Recommandé) Mettre un nom de domaine + HTTPS

Pour accéder à l'app en `https://` (port 80/443) et avec votre propre domaine :

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Créez `/etc/nginx/sites-available/nalyseur` :

```nginx
server {
    listen 80;
    server_name VOTRE_DOMAINE;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Puis :

```bash
ln -s /etc/nginx/sites-available/nalyseur /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d VOTRE_DOMAINE
```

## Mettre à jour l'app plus tard

```bash
cd nalyseur-multipiste
git pull
docker compose up -d --build
```

## Déployer SANS Docker (alternative)

Si vous préférez sans Docker :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
cd nalyseur-multipiste
npm install
npm run build
npm install -g pm2
# .env avec DEEPSEEK_API_KEY déjà créé
NODE_ENV=production pm2 start "npx tsx server.ts" --name nalyseur
pm2 save && pm2 startup
```
