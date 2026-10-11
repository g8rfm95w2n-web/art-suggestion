# Modèles à copier

Site web perso pour trouver des peintures et dessins **du domaine public** à copier
pour s'entraîner. Les données viennent des API ouvertes du
[Metropolitan Museum of Art](https://metmuseum.github.io/) et de
l'[Art Institute of Chicago](https://api.artic.edu/docs/), appelées directement
depuis le navigateur. Le site est 100 % statique (HTML/CSS/JS) et 100 % gratuit.

## Lancer en local

```bash
python3 serve.py
```

Puis ouvrir <http://localhost:8000>. Un petit serveur est nécessaire, car les
navigateurs refusent les modules JavaScript (`import`) ouverts en `file://`.
`serve.py` est l'équivalent de `python3 -m http.server`, mais il désactive le
cache du navigateur : un simple rechargement montre tes dernières modifications.
Si le port 8000 est occupé : `python3 serve.py 8001`.

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
js/analysis.js         palette et difficulté (canvas, calcul local)
js/favorites.js        tableau d'inspiration (localStorage) + export/import
js/connectors/         un fichier par musée (aic.js, met.js) + index.js (registre)
js/ui/                 grille, page détail, « Mon tableau »
tests/                 tests de normalisation, sur de vraies réponses enregistrées
```

## Mon tableau (favoris)

Les favoris (statut à faire / en cours / terminé et notes) sont enregistrés
**dans le navigateur** (localStorage), pas sur un serveur : ils sont propres à
chaque appareil. Pour les sauvegarder ou les passer de l'ordinateur à la
tablette : « Exporter (JSON) » d'un côté, « Importer… » de l'autre. L'import
fusionne : pour une même œuvre, la version modifiée le plus récemment gagne.

## Palette et difficulté

Calculées dans le navigateur sur la miniature réduite à 160 px (`js/analysis.js`) :

- **Palette** : algorithme des k-moyennes (12 groupes de couleurs), puis fusion
  des teintes trop proches, pour obtenir au plus 6 couleurs vraiment distinctes.
  Toucher une couleur copie son code hexadécimal.
- **Difficulté** : moyenne pondérée de deux mesures, chacune ramenée entre 0 et 1 :
  - *couleurs* (40 %) : nombre de « cases » de couleur (512 au total) nécessaires
    pour couvrir 90 % de l'image (2 = monochrome → 25 = très coloré) ;
  - *contours* (60 %) : part des pixels où la luminosité varie fortement (filtre
    de Sobel), de 5 % (formes simples) à 40 % (beaucoup de détails).
  Score < 0,25 → débutant, < 0,5 → intermédiaire, sinon avancé. Les bornes ont
  été calibrées sur 35 œuvres du Met (constante `CALIBRATION`, à ajuster
  librement). Limite connue : une peinture très sombre et fondue sort trop
  « facile ».
- Les résultats sont gardés en cache (IndexedDB) : chaque image n'est analysée qu'une fois.
- Le filtre « Difficulté » s'applique aux résultats déjà chargés ; si trop peu
  correspondent, le site charge automatiquement jusqu'à 3 pages de plus.

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
