// Petites fonctions utilitaires partagées.

/** Alterne les éléments de plusieurs listes : [[1,2],[a,b]] → [1,a,2,b]. */
export function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** Entier aléatoire dans [0, max[ — comme random.randrange(max) en Python. */
export function randomInt(max) {
  return Math.floor(Math.random() * max);
}

/** Élément au hasard — comme random.choice() en Python. */
export function pick(list) {
  return list[randomInt(list.length)];
}

/**
 * Échappe un texte avant de l'insérer dans du HTML.
 * Indispensable : un titre contenant « < » ou « & » casserait la page.
 */
export function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
