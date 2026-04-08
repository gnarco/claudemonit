# claudemonit

Monitor de l'utilisation de ton abonnement Claude Max. Collecte les stats d'usage toutes les 5 minutes et les affiche sur un dashboard analytics.

## Ce qui est suivi

- **Fenetre 5h** : utilisation du quota glissant sur 5 heures
- **Fenetre 7j** : utilisation du quota glissant sur 7 jours
- **Credits extra usage** : consommation en euros des credits extra (centimes)

## Stack

- Node.js + Express
- SQLite (better-sqlite3) pour le stockage
- node-cron pour le polling toutes les 5 minutes
- Chart.js pour les graphiques

## Installation

```bash
npm install
```

## Lancement

### Avec pm2 (recommande, tourne en arriere-plan)

```bash
pm2 start server.js --name claudemonit
pm2 save
```

### Sans pm2

```bash
npm start
```

## Commandes pm2 utiles

```bash
pm2 status              # voir le statut
pm2 logs claudemonit    # voir les logs
pm2 restart claudemonit # redemarrer
pm2 stop claudemonit    # arreter
pm2 delete claudemonit  # supprimer
```

## Dashboard

Accessible sur **http://localhost:3377**

## API

- `GET /api/latest` - dernier snapshot
- `GET /api/snapshots?hours=24` - historique (defaut 24h)
- `POST /api/snapshot` - forcer un snapshot maintenant

## Configuration

- Port : variable d'env `PORT` (defaut `3377`)
- Token : lu automatiquement depuis `~/.claude/.credentials.json`
