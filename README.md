# Ya! ⚡

**¿Quién reacciona más rápido?** — Juego multijugador en tiempo real donde varios jugadores presionan un botón al mismo tiempo y la app registra el orden de llegada con precisión de milisegundos.

---

## ¿Cómo funciona?

### El flujo completo

```
Jugador A crea sala  →  comparte código  →  Jugadores B, C, D entran
           ↓
   Todos presionan ¡YA! al mismo tiempo
           ↓
  Firebase registra el timestamp exacto del servidor
           ↓
  El ranking se actualiza en tiempo real para todos
```

### Por qué usar Firebase Realtime Database

El mayor reto del juego es **evitar la trampa del reloj**: si se usara `Date.now()` del navegador, cualquier jugador podría adelantar la hora de su computadora y aparecer primero. La solución es usar **`serverTimestamp()`** de Firebase, que pide al servidor de Google que ponga la marca de tiempo en el momento en que recibe el dato. Así, el tiempo que cuenta es el del servidor, no el del dispositivo del jugador.

---

## Arquitectura

```
index.html (único archivo)
│
├── <style>          → Todo el CSS (variables, animaciones, responsive)
├── <script type="module">
│   ├── Firebase SDK (cargado desde CDN de Google)
│   ├── Estado global (currentRoom, currentUser, hasPressed)
│   ├── Funciones de UI (showLobby, showGame, toast, botón)
│   └── Funciones Firebase (registerClick, subscribeRanking, resetRoom)
└── <body>
    ├── #screen-lobby  → Pantalla de entrada (nombre + código de sala)
    └── #screen-game   → Pantalla del juego (botón + ranking lateral)
```

La app es una **SPA de una sola pantalla**: nunca recarga la página. Alterna entre dos `<div>` cambiando `display: flex / none` según el estado.

---

## Estructura de datos en Firebase

```
rooms/
└── {CÓDIGO_SALA}/          ← ej: "XK9P2"
    └── clicks/
        ├── {id_auto}/
        │   ├── user: "Flash"
        │   └── timestamp: 1718000000123   ← serverTimestamp de Firebase
        ├── {id_auto}/
        │   ├── user: "Turbo"
        │   └── timestamp: 1718000000287
        └── ...
```

Cada vez que alguien presiona **¡YA!**, se hace un `push()` a `rooms/{sala}/clicks` con el nombre del usuario y un `serverTimestamp()`. El listener `onValue()` en cada cliente detecta el cambio inmediatamente y re-renderiza el ranking.

---

## Lógica técnica paso a paso

### 1. Entrar a una sala

```js
// Se genera un código de 5 caracteres con un alfabeto sin caracteres ambiguos
// (sin I, O, 0, 1 para evitar confusiones)
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}
```

Al hacer clic en **"Entrar"**, la app simplemente guarda `currentRoom` y `currentUser` en variables de estado y cambia la pantalla visible. No hay autenticación: el "acceso" a la sala es simplemente saber el código.

### 2. Suscribirse al ranking en tiempo real

```js
// onValue() escucha cambios en Firebase en tiempo real (WebSocket interno)
const clicksRef = ref(db, `rooms/${roomCode}/clicks`);
rankingUnsub = onValue(clicksRef, (snapshot) => {
  const entries = Object.values(snapshot.val())
    .sort((a, b) => a.timestamp - b.timestamp);  // orden cronológico

  const firstTs = entries[0].timestamp;  // timestamp del ganador

  // Cada fila muestra el delta respecto al primero
  entries.map((entry, i) => {
    const delta = entry.timestamp - firstTs;  // ej: 0ms, +143ms, +892ms
    // ...render
  });
});
```

La función `rankingUnsub` es la función de "cancelar suscripción" que devuelve `onValue`. Se llama cuando el usuario sale de la sala para evitar memory leaks.

### 3. Registrar el clic de forma segura

```js
async function registerClick() {
  if (hasPressed) return;  // evita doble clic
  hasPressed = true;

  const clicksRef = ref(db, `rooms/${currentRoom}/clicks`);
  const newClick  = push(clicksRef);  // genera una key única automáticamente

  await set(newClick, {
    user:      currentUser,
    timestamp: serverTimestamp()  // ← el servidor pone la hora, no el cliente
  });
}
```

El flag `hasPressed` evita que el botón envíe múltiples registros. El botón también se deshabilita visualmente de inmediato para dar feedback instantáneo.

### 4. Reiniciar la sala

```js
async function resetRoom() {
  const clicksRef = ref(db, `rooms/${currentRoom}/clicks`);
  await remove(clicksRef);  // borra todos los clicks del nodo
  hasPressed = false;
  resetYaButton();  // vuelve a habilitar el botón ¡YA!
}
```

Al borrar el nodo `clicks`, el listener `onValue` detecta el cambio y muestra "Esperando participantes…" automáticamente en todos los dispositivos conectados.

---

## Pantallas

### Lobby (Pantalla de Entrada)

| Elemento | Función |
|---|---|
| Campo **Nombre** | Identifica al jugador en el ranking |
| Campo **Código de sala** | Sala a la que se quiere unir |
| Botón **🎲 Crear** | Genera un código aleatorio de 5 caracteres |
| Botón **Entrar a la Sala →** | Valida los campos y accede al juego |

### Sala de Juego

| Elemento | Función |
|---|---|
| Header → código de sala | Clic para copiar el código al portapapeles |
| Botón **¡YA!** (circular, dorado) | Registra el timestamp del jugador en Firebase |
| Panel **Ranking de velocidad** | Lista en tiempo real ordenada por velocidad |
| Botón **🔄 Reiniciar Sala** | Borra los clicks y empieza una nueva ronda |
| Botón **← Salir** | Vuelve al lobby y cancela la suscripción |

### El ranking muestra:
- 🥇🥈🥉 medallas para los tres primeros
- Nombre del jugador (con etiqueta **"tú"** para identificarse)
- Diferencia en ms respecto al ganador (`+143 ms`, `+2.31 s`)

---

## Instalación y configuración

### Paso 1 — Crear proyecto Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. **"Agregar proyecto"** → Nombre: `ya-app` → Crear
3. En el panel, haz clic en el ícono **`</>`** (Web) → Registra la app
4. Copia el objeto `firebaseConfig` que aparece

### Paso 2 — Activar Realtime Database

1. Menú lateral → **"Realtime Database"** → **"Crear base de datos"**
2. Selecciona una región (ej: `us-central1`)
3. Elige **"Iniciar en modo de prueba"** (válido 30 días)
4. Copia la URL de la base de datos

### Paso 3 — Pegar la config en index.html

Abre `index.html` y reemplaza el bloque marcado (~línea 24):

```js
const firebaseConfig = {
  apiKey:            "TU_API_KEY_AQUI",
  authDomain:        "TU_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://TU_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "TU_PROJECT_ID",
  storageBucket:     "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId:             "TU_APP_ID"
};
```

---

## Despliegue en Netlify

### Opción A — Drag & Drop (recomendado para empezar)

1. Ve a [app.netlify.com](https://app.netlify.com)
2. Arrastra **toda la carpeta `ya/`** al área de deploy
3. En segundos tendrás una URL pública como `https://nombre-aleatorio.netlify.app`

### Opción B — GitHub + deploy automático

1. Sube el proyecto a un repositorio de GitHub
2. En Netlify → **"Import from Git"** → conecta el repo
3. Configura:
   - Build command: *(dejar vacío — no hay build)*
   - Publish directory: `.`
4. Cada `git push` desplegará automáticamente

> El archivo `netlify.toml` ya está incluido con los headers de seguridad y caché correctos.

---

## Reglas de seguridad para producción

El modo de prueba de Firebase expira en 30 días. Para producción, ve a **Realtime Database → Reglas** y pega:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        "clicks": {
          ".read": true,
          ".write": true,
          "$clickId": {
            ".validate": "newData.hasChildren(['user', 'timestamp']) && newData.child('user').isString() && newData.child('user').val().length >= 1 && newData.child('user').val().length <= 24"
          }
        }
      }
    }
  }
}
```

Estas reglas permiten leer y escribir clics, pero validan que cada entrada tenga nombre (máx. 24 chars) y timestamp.

---

## Stack tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| HTML5 | — | Estructura semántica |
| CSS3 (Vanilla) | — | Diseño, animaciones, responsive |
| JavaScript ES6+ | — | Lógica de la app (`type="module"`) |
| Firebase SDK | 10.12.2 | Realtime Database via CDN |
| Google Fonts (Outfit) | — | Tipografía |

**Sin frameworks, sin bundlers, sin dependencias npm.** Un solo archivo `index.html` que funciona arrastrándolo a cualquier servidor estático.

---

## Estructura de archivos

```
ya/
├── index.html      ← Toda la app: HTML + CSS + JS
├── netlify.toml    ← Configuración de despliegue en Netlify
└── README.md       ← Esta documentación
```
