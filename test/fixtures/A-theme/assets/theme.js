(function () {
  const SPEC_URL = '/assets/a2-3000-specs.json';
  const HERO = '/assets/hero-banner.jpg';

  async function loadSpecs(root) {
    const res = await fetch(SPEC_URL);
    const data = await res.json();
    root.querySelectorAll('.spec-card').forEach((card, i) => {
      const row = data.rows[i];
      if (row) card.querySelector('.value').textContent = row.value;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.specs-compare').forEach(loadSpecs);
    const img = new Image();
    img.src = HERO;
  });
})();
