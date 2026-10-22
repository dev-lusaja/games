// Dado reutilizable: <script src="dice.js"></script> al final del <body> agrega un botón
// flotante que tira un d6. El juego deja ~96px libres abajo para que no tape nada.
// Colores: --dice-accent, --dice-face, --dice-pip, --dice-text
(() => {
  document.head.insertAdjacentHTML('beforeend', `<style>
    /* Cuadrícula 3×3, los puntos apagados se ocultan */
    .dice-die {
      display: inline-grid;
      grid-template: repeat(3, 1fr) / repeat(3, 1fr);
      width: 110px;
      aspect-ratio: 1;
      padding: 12%;
      background: var(--dice-face, #fafafa);
      border-radius: 18%;
      box-shadow: inset 0 -6px 0 rgba(0,0,0,0.15), 0 10px 30px rgba(0,0,0,0.5);
    }
    .dice-die i { margin: 12%; border-radius: 50%; background: var(--dice-pip, #222); }
    .dice-die i.off { visibility: hidden; }
    .dice-die.rolling { animation: dice-roll 1s cubic-bezier(.3,.7,.4,1); }
    @keyframes dice-roll {
      0%   { transform: translate(-140px, -180px) rotate(-720deg) scale(0.5); }
      55%  { transform: translate(12px, 8px) rotate(25deg) scale(1.05); }
      75%  { transform: translate(-4px, -16px) rotate(-8deg); }
      100% { transform: none; }
    }
    .dice-fab {
      position: fixed;
      right: 16px;
      bottom: 16px;
      padding: 10px;
      border: none;
      border-radius: 50%;
      background: var(--dice-accent, #c62828);
      box-shadow: 0 6px 20px rgba(0,0,0,0.6);
      cursor: pointer;
    }
    .dice-fab .dice-die { width: 40px; box-shadow: none; }
    dialog.dice-dialog {
      width: min(320px, 100% - 32px);
      margin: auto;
      padding: 20px;
      border: none;
      background: none;
      box-shadow: none;
      overflow: visible;
      text-align: center;
      color: var(--dice-text, #fff);
    }
    dialog.dice-dialog::backdrop { background: rgba(0,0,0,0.85); backdrop-filter: blur(3px); }
    dialog.dice-dialog h2 { margin: 18px 0 4px; }
    .dice-actions { display: flex; gap: 8px; margin-top: 14px; }
    .dice-btn {
      flex: 1;
      font: inherit;
      font-weight: 600;
      padding: 10px 12px;
      border: none;
      border-radius: 8px;
      color: var(--dice-face, #fafafa);
      background: var(--dice-accent, #c62828);
      cursor: pointer;
    }
    .dice-btn:disabled { opacity: 0.5; cursor: default; }
    .dice-btn.ghost {
      color: var(--dice-text, #fff);
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--dice-text, #fff) 40%, transparent);
    }
  </style>`);

  document.body.insertAdjacentHTML('beforeend', `
    <button class="dice-fab" aria-label="Tirar dado"><span class="dice-die"></span></button>
    <dialog class="dice-dialog">
      <div class="dice-die"></div>
      <h2></h2>
      <form method="dialog" class="dice-actions">
        <button type="button" class="dice-btn">Otra vez</button>
        <button class="dice-btn ghost">Cerrar</button>
      </form>
    </dialog>`);

  const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  const face = (el, n) => el.innerHTML = [...Array(9)].map((_, i) => `<i${PIPS[n - 1].includes(i) ? '' : ' class="off"'}></i>`).join('');
  const d6 = () => 1 + Math.floor(Math.random() * 6);

  const fab = document.querySelector('.dice-fab');
  const dialog = document.querySelector('.dice-dialog');
  const die = dialog.querySelector('.dice-die');
  const result = dialog.querySelector('h2');
  const again = dialog.querySelector('[type=button]');
  face(fab.firstChild, 5);

  // Caras cambiando mientras rueda, el valor final al terminar la animación.
  // "Otra vez" queda deshabilitado mientras rueda y 3 s después, con cuenta regresiva.
  const COOLDOWN = 3;
  let spin, rolling = false;
  const cooldown = s => {
    again.textContent = s ? `Otra vez (${s})` : 'Otra vez';
    if (s) setTimeout(() => cooldown(s - 1), 1000);
    else again.disabled = false;
  };
  const roll = () => {
    rolling = again.disabled = true;
    clearInterval(spin);
    result.textContent = 'Rodando…';
    die.classList.remove('rolling');
    void die.offsetWidth; // reinicia la animación
    die.classList.add('rolling');
    spin = setInterval(() => face(die, d6()), 80);
  };
  die.onanimationend = () => {
    clearInterval(spin);
    const n = d6();
    face(die, n);
    result.textContent = `¡Sacaste ${n}!`;
    rolling = false;
    cooldown(COOLDOWN);
  };
  // Cerrar a media tirada cancela la animación sin animationend: se anula la tirada
  dialog.onclose = () => {
    if (!rolling) return;
    clearInterval(spin);
    rolling = again.disabled = false;
  };
  // Reabrir durante la espera muestra el último resultado y la cuenta regresiva
  fab.onclick = () => { dialog.showModal(); if (!again.disabled) roll(); };
  again.onclick = roll;
})();
