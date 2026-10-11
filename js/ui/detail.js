// Page détail d'une œuvre : grande image + informations.

import { esc } from '../utils.js';

const TYPE_LABELS = { peinture: 'Peinture', dessin: 'Dessin', autre: '—' };

/**
 * @param {HTMLElement} container
 * @param {object} art         œuvre au format commun
 * @param {{backHref: string, onSurprise?: Function}} options
 */
export function renderDetail(container, art, { backHref, onSurprise }) {
  const tags = art.tags.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('');

  container.innerHTML = `
    <article class="detail">
      <nav class="detail-nav">
        <a class="btn" href="${esc(backHref)}">← Résultats</a>
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
}
