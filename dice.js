// Dado reutilizable: <script src="dice.js"></script> al final del <body> agrega un botón
// flotante que tira un d6. El juego deja ~96px libres abajo para que no tape nada.
// Colores: --dice-accent, --dice-face, --dice-pip, --dice-text
// El dado 3D (Babylon + física Havok) se descarga recién en la primera tirada. Sin WebGL,
// con movimiento reducido o si falla la descarga, se usa el dado CSS.
// Tablero (opcional): el elemento con data-dice-tablero se inclina al abrir el dado 3D hasta
// quedar en el plano del piso, como si el dado cayera sobre él.
(() => {
  const BABYLON_URL = 'https://cdn.jsdelivr.net/npm/babylonjs@9.29.0/babylon.js';
  const HAVOK_URL = 'https://cdn.jsdelivr.net/npm/@babylonjs/havok@1.3.14/lib/umd/';

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
    .dice-die.loading { animation: dice-wobble .6s ease-in-out infinite alternate; }
    @keyframes dice-roll {
      0%   { transform: translate(-140px, -180px) rotate(-720deg) scale(0.5); }
      55%  { transform: translate(12px, 8px) rotate(25deg) scale(1.05); }
      75%  { transform: translate(-4px, -16px) rotate(-8deg); }
      100% { transform: none; }
    }
    @keyframes dice-wobble {
      from { transform: rotate(-10deg) scale(0.95); }
      to   { transform: rotate(10deg) scale(1.05); }
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
    /* Con el dado 3D el texto y los botones van al pie y el dado cae en el centro */
    dialog.dice-dialog.d3 { margin-bottom: 24px; }
    dialog.dice-dialog::backdrop { background: rgba(0,0,0,0.85); backdrop-filter: blur(3px); }
    /* Con tablero el fondo deja ver el tablero bajo la cuadrícula donde cae el dado y
       oscurece hacia los bordes */
    dialog.dice-dialog.tablero::backdrop {
      background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0.45), rgba(0,0,0,0.92) 75%);
      backdrop-filter: none;
    }
    [data-dice-tablero] { transition: transform .7s cubic-bezier(.3,.7,.4,1); }
    dialog.dice-dialog [hidden] { display: none; }
    dialog.dice-dialog h2 { margin: 18px 0 4px; }
    /* Dado 3D: canvas transparente a pantalla completa, detrás del texto del modal */
    .dice-canvas {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      pointer-events: none;
      outline: none;
    }
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
      <canvas class="dice-canvas" hidden></canvas>
      <h2></h2>
      <form method="dialog" class="dice-actions">
        <button type="button" class="dice-btn">Lanzar</button>
        <button class="dice-btn ghost">Cerrar</button>
      </form>
    </dialog>`);

  const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  const face = (el, n) => el.innerHTML = [...Array(9)].map((_, i) => `<i${PIPS[n - 1].includes(i) ? '' : ' class="off"'}></i>`).join('');
  const d6 = () => 1 + Math.floor(Math.random() * 6);

  const fab = document.querySelector('.dice-fab');
  const dialog = document.querySelector('.dice-dialog');
  const die = dialog.querySelector('.dice-die');
  const canvas = dialog.querySelector('canvas');
  const result = dialog.querySelector('h2');
  const again = dialog.querySelector('[type=button]');
  const tablero = document.querySelector('[data-dice-tablero]');
  face(fab.firstChild, 5);
  face(die, 5);

  const script = src => new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => err(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });

  // Escena: piso con cuadrícula que se desvanece, paredes invisibles alrededor y el dado con
  // física. tirar() lo deja caer desde arriba y resuelve con la cara que queda arriba.
  const crearEscena = havok => {
    const B = BABYLON;
    const css = getComputedStyle(canvas);
    const color = (v, def) => css.getPropertyValue(v).trim() || def;

    // Pasos de física de 33 ms como máximo: al retomar el render loop tras una pausa
    // el primer frame no da un salto gigante
    B.Scene.MaxDeltaTime = 1000 / 30;
    const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true }, true);
    engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 2));
    const scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0, 0, 0, 0);
    scene.enablePhysics(new B.Vector3(0, -30, 0), new B.HavokPlugin(true, havok));

    const cam = new B.ArcRotateCamera('cam', -Math.PI / 2, 0.7, 6, B.Vector3.Zero(), scene);
    cam.fov = 0.8;
    const cielo = new B.HemisphericLight('cielo', new B.Vector3(0.2, 1, -0.4), scene);
    cielo.intensity = 0.75;
    cielo.groundColor = new B.Color3(0.15, 0.15, 0.15);
    const sol = new B.DirectionalLight('sol', new B.Vector3(-0.4, -1, 0.5), scene);
    sol.intensity = 0.7;

    // Paredes invisibles: el piso es la bandeja y el dado no sale de la vista
    const T = 2, H = 8;
    const pared = (width, height, depth, x, y, z) => {
      const m = B.MeshBuilder.CreateBox('pared', { width, height, depth }, scene);
      m.position.set(x, y, z);
      m.isVisible = false;
      new B.PhysicsAggregate(m, B.PhysicsShapeType.BOX, { mass: 0, restitution: 0.45, friction: 0.8 }, scene);
    };
    pared(2 * T + 2, 1, 2 * T + 2, 0, -0.5, 0);
    pared(2 * T + 2, 1, 2 * T + 2, 0, H + 0.5, 0);
    pared(1, H, 2 * T, -T - 0.5, H / 2, 0);
    pared(1, H, 2 * T, T + 0.5, H / 2, 0);
    pared(2 * T, H, 1, 0, H / 2, -T - 0.5);
    pared(2 * T, H, 1, 0, H / 2, T + 0.5);

    // Caras pintadas en una tira de 6 celdas con los colores del tema
    const S = 128;
    const tex = new B.DynamicTexture('caras', { width: S * 6, height: S }, scene);
    const ctx = tex.getContext();
    PIPS.forEach((pips, i) => {
      const x = i * S;
      ctx.fillStyle = color('--dice-face', '#fafafa');
      ctx.fillRect(x, 0, S, S);
      for (const p of pips) {
        const cx = x + S * (0.27 + 0.23 * (p % 3)), cy = S * (0.27 + 0.23 * Math.floor(p / 3)), r = S * 0.085;
        // Punto hundido: borde de arriba más oscuro, como en un dado tallado
        const g = ctx.createRadialGradient(cx + r * 0.3, cy + r * 0.3, 0, cx, cy, r);
        g.addColorStop(0.6, color('--dice-pip', '#222'));
        g.addColorStop(1, 'rgba(0,0,0,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    tex.update();

    // Cubo de aristas redondeadas: cada cara es una grilla que se proyecta sobre una caja
    // con esquinas de radio R. [normal, eje u, eje v, valor], con u × v = normal para que
    // todas las caras queden hacia afuera; caras opuestas suman 7.
    const CARAS = [
      [[0, 0, 1], [1, 0, 0], [0, 1, 0], 1],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0], 6],
      [[1, 0, 0], [0, 0, -1], [0, 1, 0], 2],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0], 5],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1], 3],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1], 4],
    ];
    const h = 0.3, R = 0.08, M = 5, P = 4; // medio lado 0.3: dado de 0.6
    // Más vértices en el bisel (que cada cara cubre hasta 45°) que en la parte plana
    const bisel = [...Array(M)].map((_, k) => R * Math.tan((M - k) / M * Math.PI / 4));
    const pasos = [
      ...bisel.map(e => -(h - R) - e),
      ...[...Array(P + 1)].map((_, k) => (h - R) * (2 * k / P - 1)),
      ...bisel.toReversed().map(e => h - R + e),
    ];
    const N = pasos.length;
    const vd = Object.assign(new B.VertexData(), { positions: [], normals: [], uvs: [], indices: [] });
    for (const [n, du, dv, valor] of CARAS) {
      const base = vd.positions.length / 3;
      for (const b of pasos) for (const a of pasos) {
        const p = [0, 1, 2].map(k => n[k] * h + du[k] * a + dv[k] * b);
        const q = p.map(c => Math.max(R - h, Math.min(h - R, c)));
        const d = p.map((c, k) => c - q[k]);
        const len = Math.hypot(...d);
        vd.positions.push(...q.map((c, k) => c + d[k] / len * R));
        vd.normals.push(...d.map(c => c / len));
        vd.uvs.push((valor - 1 + (a + h) / (2 * h)) / 6, (b + h) / (2 * h));
      }
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const v = base + j * N + i;
        vd.indices.push(v, v + N, v + 1, v + 1, v + N, v + N + 1);
      }
    }
    const dado = new B.Mesh('dado', scene);
    vd.applyToMesh(dado);
    const mat = new B.StandardMaterial('dado', scene);
    mat.diffuseTexture = tex;
    mat.specularColor = new B.Color3(0.6, 0.6, 0.6);
    mat.specularPower = 48;
    dado.material = mat;

    const caras = CARAS.map(([n, , , valor]) => ({ normal: B.Vector3.FromArray(n), valor }));
    const caraArriba = () => {
      const m = dado.computeWorldMatrix(true);
      let mejor = { y: -2 };
      for (const c of caras) {
        const y = B.Vector3.TransformNormal(c.normal, m).y;
        if (y > mejor.y) mejor = { y, valor: c.valor };
      }
      return mejor;
    };

    // Piso: cuadrícula que se desvanece hacia los bordes y refleja el dado
    const L = 12, PX = 1024;
    const piso = B.MeshBuilder.CreateGround('piso', { width: L, height: L }, scene);
    const grilla = new B.DynamicTexture('grilla', PX, scene);
    const gctx = grilla.getContext();
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, PX, PX);
    gctx.strokeStyle = 'rgba(255,255,255,0.25)';
    gctx.lineWidth = 2;
    gctx.beginPath();
    for (let k = 0; k <= PX; k += PX / (L * 2)) {
      gctx.moveTo(k, 0); gctx.lineTo(k, PX);
      gctx.moveTo(0, k); gctx.lineTo(PX, k);
    }
    gctx.stroke();
    grilla.update();
    const fundido = new B.DynamicTexture('fundido', 256, scene);
    const fctx = fundido.getContext();
    const u = 256 / L; // px por unidad
    const fg = fctx.createRadialGradient(128, 128, 0.5 * u, 128, 128, 3.5 * u);
    fg.addColorStop(0, `rgba(0,0,0,${tablero ? 0.4 : 1})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 256, 256);
    fundido.hasAlpha = true;
    fundido.update();
    const espejo = new B.MirrorTexture('espejo', 512, scene, true);
    espejo.mirrorPlane = new B.Plane(0, -1, 0, 0);
    espejo.renderList = [dado];
    espejo.level = 0.35;
    const pisoMat = new B.StandardMaterial('piso', scene);
    pisoMat.diffuseColor = B.Color3.Black();
    pisoMat.specularColor = B.Color3.Black();
    pisoMat.emissiveTexture = grilla;
    pisoMat.opacityTexture = fundido;
    pisoMat.reflectionTexture = espejo;
    piso.material = pisoMat;

    dado.position.y = h; // apoyado en el centro hasta la primera tirada
    const cuerpo = new B.PhysicsAggregate(dado, B.PhysicsShapeType.BOX, { mass: 1, restitution: 0.45, friction: 0.5 }, scene).body;

    // Tirada en curso: se da por terminada tras 300 ms quieto, o a los 6 s pase lo que pase
    let fin = null, quieto = 0, total = 0, empujones = 0;
    scene.onAfterPhysicsObservable.add(() => {
      cuerpo.disablePreStep = true;
      if (!fin) return;
      const dt = Math.min(engine.getDeltaTime(), 50);
      total += dt;
      const lento = cuerpo.getLinearVelocity().length() < 0.05 && cuerpo.getAngularVelocity().length() < 0.1;
      quieto = lento ? quieto + dt : 0;
      if (quieto < 300 && total < 6000) return;
      const { y, valor } = caraArriba();
      // Quedó apoyado en una pared: un empujoncito hacia el centro
      if (y < 0.9 && empujones < 3 && total < 6000) {
        empujones++;
        quieto = 0;
        cuerpo.applyImpulse(new B.Vector3(-dado.position.x, 2, -dado.position.z), dado.position);
        return;
      }
      const ok = fin;
      parar();
      ok(valor);
    });

    // Pantalla vertical: se fija el ancho visible para que la bandeja entre de lado a lado
    const ajustar = () => {
      engine.resize();
      cam.fovMode = engine.getRenderWidth() < engine.getRenderHeight()
        ? B.Camera.FOVMODE_HORIZONTAL_FIXED : B.Camera.FOVMODE_VERTICAL_FIXED;
    };
    // Dibuja un cuadro con el dado quieto: al abrir el diálogo y al girar el celular.
    // La primera vez espera a que compilen los shaders, si no el cuadro sale vacío.
    const mostrar = () => {
      ajustar();
      scene.executeWhenReady(() => fin || scene.render());
    };
    addEventListener('resize', () => {
      if (dialog.open && !canvas.hidden) mostrar();
    });

    const parar = () => {
      fin = null;
      engine.stopRenderLoop();
    };
    const tirar = () => new Promise(ok => {
      ajustar();
      const r = () => Math.random() * 2 * Math.PI;
      const azar = s => (Math.random() - 0.5) * s;
      // Cae desde arriba y desde el fondo, fuera de cuadro, hacia la cámara y con mucho giro.
      // disablePreStep = false deja mover el cuerpo a mano hasta el próximo paso de física
      cuerpo.disablePreStep = false;
      dado.position.set(azar(2), 7, 0.7);
      dado.rotationQuaternion.copyFrom(B.Quaternion.FromEulerAngles(r(), r(), r()));
      cuerpo.setLinearVelocity(new B.Vector3(azar(3), -2, -0.5 - Math.random()));
      cuerpo.setAngularVelocity(new B.Vector3(azar(24), azar(24), azar(24)));
      fin = ok;
      quieto = total = empujones = 0;
      engine.stopRenderLoop();
      engine.runRenderLoop(() => scene.render());
    });
    // Cancelar a media tirada deja el dado quieto en el centro, no congelado en el aire
    const cancelar = () => {
      if (!fin) return;
      parar();
      cuerpo.disablePreStep = false;
      dado.position.set(0, h, 0);
      dado.rotationQuaternion.copyFrom(B.Quaternion.Identity());
      cuerpo.setLinearVelocity(B.Vector3.Zero());
      cuerpo.setAngularVelocity(B.Vector3.Zero());
    };
    // Distancia focal en px de la cámara: con ella y la inclinación de la cámara, un
    // perspective() + rotateX() de CSS calza con el plano del piso
    const enfoque = () => (cam.fovMode === B.Camera.FOVMODE_HORIZONTAL_FIXED ? canvas.clientWidth : canvas.clientHeight)
      / 2 / Math.tan(cam.fov / 2);
    return { tirar, cancelar, mostrar, enfoque, inclinacion: cam.beta };
  };

  let cargando3d, dado3d;
  const cargar3d = () => cargando3d ??= (async () => {
    const webgl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!webgl || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    await Promise.all([script(BABYLON_URL), script(HAVOK_URL + 'HavokPhysics_umd.js')]);
    const havok = await HavokPhysics({ locateFile: () => HAVOK_URL + 'HavokPhysics.wasm' });
    return dado3d = crearEscena(havok);
  })().catch(e => {
    console.warn('Dado 3D no disponible, se usa el dado CSS', e);
    return null;
  });

  // El botón siempre dice "Lanzar". Al abrir está listo; después de cada tirada queda
  // deshabilitado mientras rueda y 3 s después, con cuenta regresiva.
  const COOLDOWN = 3;
  let spin, rolling = false, esperando = false, tirada = 0;
  const cooldown = s => {
    esperando = s > 0;
    again.textContent = s ? `Lanzar (${s})` : 'Lanzar';
    if (s) setTimeout(() => cooldown(s - 1), 1000);
    else again.disabled = false;
  };
  const terminar = n => {
    face(die, n);
    result.textContent = `¡Sacaste ${n}!`;
    rolling = false;
    cooldown(COOLDOWN);
  };
  // Dado CSS: caras cambiando mientras rueda, el valor final al terminar la animación
  const rollCss = () => {
    result.textContent = 'Rodando…';
    die.classList.remove('rolling');
    void die.offsetWidth; // reinicia la animación
    die.classList.add('rolling');
    spin = setInterval(() => face(die, d6()), 80);
  };
  die.onanimationend = e => {
    if (e.animationName !== 'dice-roll') return;
    clearInterval(spin);
    terminar(d6());
  };
  // El tablero gira sobre el punto del centro de la pantalla, que es donde apunta la cámara
  const inclinar = on => {
    if (!tablero) return;
    dialog.classList.toggle('tablero', on);
    if (!on) return tablero.style.transform = '';
    const r = tablero.getBoundingClientRect();
    tablero.style.transformOrigin = `${innerWidth / 2 - r.left}px ${innerHeight / 2 - r.top}px`;
    tablero.style.transform = `perspective(${dado3d.enfoque()}px) rotateX(${dado3d.inclinacion}rad)`;
  };
  // Al abrir: descarga el dado 3D la primera vez (con "Lanzar" deshabilitado mientras
  // tanto) y lo muestra quieto, esperando la tirada
  const preparar = async () => {
    again.textContent = 'Lanzar';
    again.disabled = true;
    if (!cargando3d) {
      result.textContent = 'Cargando dado 3D…';
      die.classList.add('loading');
    }
    const d3 = await cargar3d();
    die.classList.remove('loading');
    if (!dialog.open || rolling) return; // se cerró mientras cargaba
    die.hidden = !!d3;
    canvas.hidden = !d3;
    dialog.classList.toggle('d3', !!d3);
    d3?.mostrar();
    inclinar(!!d3);
    result.textContent = 'Lanza el dado';
    again.disabled = false;
  };
  const roll = async () => {
    const id = ++tirada;
    rolling = again.disabled = true;
    clearInterval(spin);
    const d3 = await cargar3d();
    if (id !== tirada) return;
    if (!d3) return rollCss();
    result.textContent = 'Rodando…';
    const n = await d3.tirar();
    if (id === tirada) terminar(n);
  };
  // Cerrar a media tirada anula la tirada
  dialog.onclose = () => {
    inclinar(false);
    if (!rolling) return;
    tirada++;
    clearInterval(spin);
    dado3d?.cancelar();
    rolling = false;
  };
  // Reabrir durante la espera muestra el último resultado y la cuenta regresiva
  fab.onclick = () => {
    dialog.showModal();
    if (esperando) inclinar(!canvas.hidden);
    else if (!rolling) preparar();
  };
  again.onclick = roll;
})();
