// Page détail d'une œuvre : grande image, informations, tableau d'inspiration,
// palette de couleurs et difficulté.

import { esc } from '../utils.js';
import { analyze, LEVELS } from '../analysis.js';
import { STATUSES, getFavorite, addFavorite, removeFavorite, updateFavorite } from '../favorites.js';

const TYPE_LABELS = { peinture: 'Peinture', dessin: 'Dessin', autre: '—' };

/**
 * @param {HTMLElement} container
 * @param {object} art         œuvre au format commun
 * @param {{backHref: string, backLabel: string, onSurprise?: Function}} options
 */
export function renderDetail(container, art, { backHref, backLabel, onSurprise }) {
  const tags = art.tags.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('');

  container.innerHTML = `
    <article class="detail">
      <nav class="detail-nav">
        <a class="btn" href="${esc(backHref)}">← ${esc(backLabel)}</a>
        ${onSurprise ? '<button type="button" class="btn btn-accent" id="again">🎲 Une autre</button>' : ''}
      </nav>

      <figure class="detail-figure">
        <a href="${esc(art.hdUrl)}" target="_blank" rel="noopener" title="Ouvrir l'image en grand">
          <img src="${esc(art.imageUrl)}" alt="${esc(art.title)}">
        </a>
      </figure>

      <div class="detail-info">
        <h1>${esc(art.title)}</h1>
        <p class="detail-artist">${esc(art.artist)}</p>

        <section class="fav-box" aria-label="Mon tableau"></section>

        <section class="analysis" aria-label="Couleurs et difficulté">
          <p class="muted">Analyse des couleurs…</p>
        </section>

        <dl>
          ${art.date ? `<dt>Date</dt><dd>${esc(art.date)}</dd>` : ''}
          ${art.medium ? `<dt>Technique</dt><dd>${esc(art.medium)}</dd>` : ''}
          <dt>Type</dt><dd>${TYPE_LABELS[art.type] || '—'}</dd>
          <dt>Musée</dt><dd>${esc(art.sourceLabel)}</dd>
        </dl>
        ${tags ? `<ul class="tags" aria-label="Mots-clés">${tags}</ul>` : ''}
        <p class="detail-links">
          <a href="${esc(art.hdUrl)}" target="_blank" rel="noopener">Image haute définition ↗</a>
          <a href="${esc(art.pageUrl)}" target="_blank" rel="noopener">Notice du musée ↗</a>
        </p>
      </div>
    </article>`;

  container.querySelector('#again')?.addEventListener('click', onSurprise);
  container.querySelector('.detail-figure img').addEventListener('error', (e) => {
    e.target.replaceWith(Object.assign(document.createElement('p'), {
      className: 'notice',
      textContent: 'Image indisponible pour le moment.',
    }));
  }, { once: true });

  renderFavoriteBox(container.querySelector('.fav-box'), art);
  analyze(art).then((result) => {
    const box = container.querySelector('.analysis');
    if (box) renderAnalysis(box, result); // la page a pu changer entre-temps
  });
}

// ---------------------------------------------------------------- Tableau d'inspiration

function renderFavoriteBox(box, art) {
  const fav = getFavorite(art.id);
  if (!fav) {
    box.innerHTML = '<button type="button" class="btn" data-action="add">☆ Ajouter à mon tableau</button>';
  } else {
    const statusButtons = Object.entries(STATUSES).map(([value, label]) => `
      <button type="button" class="seg ${fav.status === value ? 'is-on' : ''}"
              data-status="${value}" aria-pressed="${fav.status === value}">${label}</button>`).join('');
    box.innerHTML = `
      <div class="fav-head">
        <span>★ Dans mon tableau</span>
        <button type="button" class="link" data-action="remove">Retirer</button>
      </div>
      <div class="segmented" role="group" aria-label="Statut">${statusButtons}</div>
      <label class="notes">Notes
        <textarea rows="3" placeholder="Matériel, difficultés, ce que j'ai appris…">${esc(fav.notes)}</textarea>
      </label>`;
  }

  box.onclick = (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    if (target.dataset.action === 'add') addFavorite(art);
    if (target.dataset.action === 'remove') removeFavorite(art.id);
    if (target.dataset.status) updateFavorite(art.id, { status: target.dataset.status });
    renderFavoriteBox(box, art);
  };

  // Les notes sont enregistrées automatiquement, 0,5 s après la dernière frappe
  // (« debounce » : on évite d'écrire à chaque lettre).
  const textarea = box.querySelector('textarea');
  if (textarea) {
    let timer;
    textarea.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => updateFavorite(art.id, { notes: textarea.value }), 500);
    });
  }
}

// ---------------------------------------------------------------- Palette et difficulté

function renderAnalysis(box, result) {
  if (!result) {
    box.innerHTML = '<p class="muted">Analyse des couleurs impossible pour cette image.</p>';
    return;
  }
  const swatches = result.palette.map((c) => `
    <button type="button" class="swatch" data-hex="${c.hex}" title="Copier ${c.hex}">
      <span class="chip" style="background:${c.hex}"></span>
      <span class="hex">${c.hex}</span>
      <span class="share">${Math.round(c.share * 100)} %</span>
    </button>`).join('');

  box.innerHTML = `
    <h2>Palette dominante</h2>
    <div class="palette">${swatches}</div>
    <h2>Difficulté estimée</h2>
    <p><span class="level level-${result.level}">${LEVELS[result.level]}</span></p>
    <details>
      <summary>Comment c’est calculé ?</summary>
      <p>Score ${result.score.toFixed(2)} sur 1 : moyenne pondérée de deux mesures faites sur l’image réduite.</p>
      <ul>
        <li><strong>Couleurs :</strong> ${result.metrics.colors} nuances distinctes couvrent 90 % de l’image
          (2 = monochrome, 25 et plus = très coloré). Compte pour 40 %.</li>
        <li><strong>Contours :</strong> ${Math.round(result.metrics.edges * 100)} % des pixels sont sur un contour net
          (5 % = formes simples, 40 % et plus = beaucoup de détails). Compte pour 60 %.</li>
      </ul>
      <p>C’est une indication, pas une vérité : une peinture sombre aux nuances subtiles peut être plus dure qu’annoncé.</p>
    </details>`;

  box.querySelector('.palette').addEventListener('click', async (e) => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    try {
      await navigator.clipboard.writeText(swatch.dataset.hex);
      swatch.classList.add('copied');
      setTimeout(() => swatch.classList.remove('copied'), 1200);
    } catch { /* presse-papiers refusé : sans gravité */ }
  });
}
