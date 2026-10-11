# Modèles à copier

Site web perso pour trouver des peintures et dessins **du domaine public** à copier
pour s'entraîner. Les données viennent des API ouvertes du
[Metropolitan Museum of Art](https://metmuseum.github.io/) et de
l'[Art Institute of Chicago](https://api.artic.edu/docs/), appelées directement
depuis le navigateur. Le site est 100 % statique (HTML/CSS/JS) et 100 % gratuit.

## Lancer en local

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. Un petit serveur est nécessaire, car les
navigateurs refusent les modules JavaScript (`import`) ouverts en `file://`.

Tests (Node 18+, rien à installer) :

```bash
node --test
```

## Organisation

```
index.html             page unique
css/style.css          mise en page (tablette d'abord)
js/app.js              navigation grille ↔ détail (#/…)
js/search.js           interroge toutes les sources, fusionne, « Surprends-moi »
js/filters.js          thèmes, époques, supports (français → termes anglais des API)
js/net.js              fetch + cache + limite de requêtes simultanées + délai max
js/cache.js            cache IndexedDB (7 jours)
js/connectors/         un fichier par musée (aic.js, met.js) + index.js (registre)
js/ui/                 grille et page détail
tests/                 tests de normalisation, sur de vraies réponses enregistrées
```

## Mettre en ligne (GitHub Pages)

Une fois le dépôt sur GitHub : **Settings → Pages → Source : « Deploy from a branch »,
branche `main`, dossier `/ (root)` → Save**. L'adresse est
`https://<utilisateur>.github.io/<dépôt>/`. Chaque `git push` met le site à jour
en une minute environ.

## Ajouter une source

1. Créer `js/connectors/masource.js` qui exporte :
   - `id` (préfixe court, ex. `'rijks'`) et `label` (nom affiché) ;
   - `normalize(raw)` → objet au format commun (voir `js/connectors/index.js`),
     ou `null` si l'œuvre n'est pas libre de droits ou n'a pas d'image ;
   - `search(criteria, page, perPage)` → `{ total, items }` ;
   - `getById(localId)` → œuvre ou `null`.
   Utiliser `fetchJson()` de `js/net.js` pour bénéficier du cache.
2. L'ajouter au tableau `connectors` de `js/connectors/index.js`.
3. Enregistrer une vraie réponse dans `tests/fixtures/` et ajouter un test.

## Si une API bloque un jour les requêtes du navigateur (CORS)

Aujourd'hui, les deux API autorisent les appels directs
(`Access-Control-Allow-Origin: *`) et aucun proxy n'est nécessaire. Si cela
changeait, la solution gratuite serait un
[Cloudflare Worker](https://developers.cloudflare.com/workers/) qui relaie les
requêtes et ajoute l'en-tête CORS. Il suffirait alors de changer la constante
`API` du connecteur concerné.
