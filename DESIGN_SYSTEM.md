# Design System — Trading Journal

Documento de referencia para replicar el sistema de diseño visual del frontend de **Trading Journal** en otros proyectos. El objetivo es que ambas apps compartan la misma estética para luego integrarse.

---

## Stack tecnológico

- **Framework:** React + Vite (ES Modules)
- **Estilos:** Tailwind CSS v3 con `darkMode: 'class'`
- **Iconos:** [Lucide React](https://lucide.dev/) — usar exclusivamente esta librería
- **Tipografía:** Sistema por defecto de Tailwind (sans-serif)
- **Plugin extra:** `@tailwindcss/typography`

---

## Colores

### Paleta base (Tailwind grays)

| Rol | Light mode | Dark mode |
|-----|-----------|-----------|
| Fondo de página | `gray-50` | `gray-900` |
| Fondo de card / panel | `white` | `gray-800` |
| Fondo de input | `white` | `gray-800` |
| Fondo de header | `white` | `gray-800` |
| Fondo hover item | `gray-100` | `gray-700` |
| Border principal | `gray-200` | `gray-700` |
| Border input | `gray-300` | `gray-600` |
| Texto principal | `gray-900` | `gray-100` / `white` |
| Texto secundario | `gray-600` | `gray-300` |
| Texto muted | `gray-500` | `gray-400` |
| Texto label | `gray-700` | `gray-300` |

### Color de acento principal: Azul

- Elemento activo de nav: `bg-blue-50 text-blue-700` / `dark:bg-blue-900/50 dark:text-blue-300`
- Botón primario: `bg-blue-600 hover:bg-blue-700`
- Focus ring: `ring-blue-500`
- Logo / iconos destacados: `bg-blue-600` con ícono blanco
- Spinner / loading: `text-blue-600`
- Enlace de acento: `text-blue-500`

### Colores semánticos personalizados

Definidos en `tailwind.config.js` como extensión:

```js
colors: {
  profit: {
    light: '#dcfce7',   // = green-100
    DEFAULT: '#22c55e', // = green-500
    dark: '#15803d',    // = green-700
  },
  loss: {
    light: '#fee2e2',   // = red-100
    DEFAULT: '#ef4444', // = red-500
    dark: '#b91c1c',    // = red-700
  },
}
```

Usar las clases utilitarias `.text-profit` / `.text-loss` y `.bg-profit` / `.bg-loss` (definidas en globals.css):

```css
.text-profit { @apply text-green-600 dark:text-green-400; }
.text-loss   { @apply text-red-600 dark:text-red-400; }
.bg-profit   { @apply bg-green-50 dark:bg-green-900/20; }
.bg-loss     { @apply bg-red-50 dark:bg-red-900/20; }
```

---

## globals.css — Clases de componente

Copiar en el proyecto nuevo bajo `src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900 antialiased;
    @apply dark:bg-gray-900 dark:text-gray-100;
  }
}

@layer components {
  /* ── Botones ── */
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 font-medium rounded-lg
           transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
           disabled:opacity-50 disabled:cursor-not-allowed;
    @apply dark:focus:ring-offset-gray-900;
  }
  .btn-primary   { @apply btn bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500; }
  .btn-secondary { @apply btn bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400
                          dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600; }
  .btn-danger    { @apply btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500; }
  .btn-success   { @apply btn bg-green-600 text-white hover:bg-green-700 focus:ring-green-500; }
  /* ghost: fondo transparente */
  /* .btn-ghost → inline: btn bg-transparent text-gray-600 hover:bg-gray-100 */

  /* ── Inputs / Select ── */
  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
           disabled:bg-gray-100 disabled:cursor-not-allowed;
    @apply dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
           dark:disabled:bg-gray-700 dark:placeholder-gray-400;
  }
  .input-error { @apply border-red-500 focus:ring-red-500; }

  /* ── Label ── */
  .label {
    @apply block text-sm font-medium text-gray-700 mb-1;
    @apply dark:text-gray-300;
  }

  /* ── Card ── */
  .card {
    @apply bg-white rounded-xl shadow-sm border border-gray-200 p-6;
    @apply dark:bg-gray-800 dark:border-gray-700;
  }

  /* ── Badges ── */
  .badge        { @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium; }
  .badge-long   { @apply badge bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200; }
  .badge-short  { @apply badge bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200; }
  .badge-open   { @apply badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200; }
  .badge-closed { @apply badge bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300; }
  .badge-profit { @apply badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200; }
  .badge-loss   { @apply badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200; }

  /* ── Tabla ── */
  .table-container { @apply overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700; }
  .table            { @apply min-w-full divide-y divide-gray-200 dark:divide-gray-700; }
  .table th {
    @apply px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50;
    @apply dark:bg-gray-800 dark:text-gray-400;
  }
  .table td {
    @apply px-4 py-3 text-sm text-gray-900 whitespace-nowrap;
    @apply dark:text-gray-100;
  }
  .table tbody tr { @apply hover:bg-gray-50 transition-colors dark:hover:bg-gray-700; }
}

@layer utilities {
  .text-profit { @apply text-green-600 dark:text-green-400; }
  .text-loss   { @apply text-red-600 dark:text-red-400; }
  .bg-profit   { @apply bg-green-50 dark:bg-green-900/20; }
  .bg-loss     { @apply bg-red-50 dark:bg-red-900/20; }
}

/* Animación de pulso para highlight */
@keyframes highlightPulse {
  0%, 100% { background-color: transparent; }
  50%       { background-color: rgb(251 191 36 / 0.2); }
}
.highlight-pulse {
  animation: highlightPulse 2.5s ease-in-out;
  border-radius: 0.5rem;
}
```

---

## tailwind.config.js

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        profit: { light: '#dcfce7', DEFAULT: '#22c55e', dark: '#15803d' },
        loss:   { light: '#fee2e2', DEFAULT: '#ef4444', dark: '#b91c1c' },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
```

---

## Layout

### Estructura general de página

```jsx
<div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
  <Header />
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    {children}
  </main>
  <footer className="mt-auto py-4 text-center text-sm text-gray-500 dark:text-gray-400">
    App © {year}
  </footer>
</div>
```

- `max-w-7xl` como ancho máximo del contenido
- Padding horizontal: `px-4 sm:px-6 lg:px-8`
- Padding vertical de contenido: `py-6`

### Header

```jsx
<header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 transition-colors duration-200">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex items-center justify-between h-16">
      {/* Logo */}
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
        <Icon className="w-5 h-5 text-white" />
      </div>

      {/* Nav link activo */}
      <a className="bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 flex items-center px-3 py-2 rounded-lg text-sm font-medium" />

      {/* Nav link inactivo */}
      <a className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white flex items-center px-3 py-2 rounded-lg text-sm font-medium" />
    </div>
  </div>
</header>
```

---

## Componentes

### Button

Variantes: `primary` | `secondary` | `danger` | `success` | `ghost`  
Tamaños: `sm` | `md` | `lg`

```jsx
// ghost (inline, no en globals.css):
className="btn bg-transparent text-gray-600 hover:bg-gray-100"

// Con ícono izquierdo:
<button className="btn-primary text-sm px-4 py-2">
  <Icon className="w-4 h-4 mr-2" />
  Texto
</button>

// Loading state:
<Loader2 className="w-4 h-4 animate-spin mr-2" />
```

### Input / Select

```jsx
<div>
  <label className="label">Nombre <span className="text-red-500 ml-1">*</span></label>
  <input className="input" />
  <p className="mt-1 text-sm text-red-600">Mensaje de error</p>
  <p className="mt-1 text-sm text-gray-500">Texto de ayuda</p>
</div>
```

### Card

```jsx
<div className="card">
  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Título</h3>
  {/* contenido */}
</div>
```

### Modal

```jsx
<div className="fixed inset-0 z-50 overflow-y-auto">
  {/* Overlay */}
  <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

  <div className="flex min-h-full items-center justify-center p-4">
    <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Título</h3>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* Body */}
      <div className="px-6 py-4">{children}</div>
    </div>
  </div>
</div>
```

Tamaños de modal: `max-w-md` | `max-w-lg` | `max-w-2xl` | `max-w-4xl`

### Toast / Notificaciones

Posición fija: `fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full`

Variantes con borde izquierdo de 4px:

| Tipo | Fondo | Borde | Texto |
|------|-------|-------|-------|
| success | `bg-green-50 dark:bg-green-900/50` | `border-green-500` | `text-green-800 dark:text-green-200` |
| error | `bg-red-50 dark:bg-red-900/50` | `border-red-500` | `text-red-800 dark:text-red-200` |
| warning | `bg-yellow-50 dark:bg-yellow-900/50` | `border-yellow-500` | `text-yellow-800 dark:text-yellow-200` |
| info | `bg-blue-50 dark:bg-blue-900/50` | `border-blue-500` | `text-blue-800 dark:text-blue-200` |

```jsx
<div className={`flex items-start p-4 rounded-lg border-l-4 shadow-lg ${bgColor} ${borderColor}`}>
  <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
  <p className={`ml-3 text-sm font-medium ${textColor} flex-1`}>{message}</p>
  <button className={`ml-4 ${iconColor} hover:opacity-70`}><X className="w-4 h-4" /></button>
</div>
```

### EmptyState

```jsx
<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-gray-400" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Título</h3>
  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">Descripción</p>
  <button className="btn-primary text-sm px-4 py-2">Acción</button>
</div>
```

### Loading

```jsx
{/* Inline */}
<div className="flex flex-col items-center justify-center py-8">
  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
  <p className="mt-2 text-sm text-gray-500">Cargando...</p>
</div>

{/* Full page */}
<div className="min-h-screen flex items-center justify-center">
  <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
</div>

{/* Skeleton de tabla */}
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
</div>
```

### Spinner inline (sin componente)

```jsx
<div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
```

---

## Tipografía

| Elemento | Clases |
|----------|--------|
| Título de página | `text-2xl font-bold text-gray-900 dark:text-white` |
| Subtítulo de página | `text-gray-500 dark:text-gray-400 mt-1` |
| Título de sección/card | `text-lg font-semibold text-gray-900 dark:text-white` |
| Título de modal | `text-lg font-semibold text-gray-900 dark:text-white` |
| Label de campo | `text-sm font-medium text-gray-700 dark:text-gray-300` |
| Texto de tabla (th) | `text-xs font-semibold text-gray-600 uppercase tracking-wider` |
| Texto de tabla (td) | `text-sm text-gray-900 dark:text-gray-100` |
| Texto pequeño / helper | `text-sm text-gray-500 dark:text-gray-400` |
| Error de campo | `text-sm text-red-600 dark:text-red-400` |
| Footer | `text-sm text-gray-500 dark:text-gray-400` |

---

## Espaciado y radios

| Elemento | Valor |
|----------|-------|
| Card border-radius | `rounded-xl` (12px) |
| Botones | `rounded-lg` (8px) |
| Inputs | `rounded-lg` (8px) |
| Modal | `rounded-xl` (12px) |
| Logo/avatar box | `rounded-lg` o `rounded-2xl` |
| Badge | `rounded-full` |
| Avatar / icono circular | `rounded-full` |
| Gap entre items de nav | `space-x-1` |
| Gap entre cards en grid | `gap-4` o `gap-6` |
| Padding interno de card | `p-6` |
| Padding de header modal | `px-6 py-4` |

---

## Dark Mode

El toggle se gestiona añadiendo/quitando la clase `dark` en el `<html>`. Persiste en `localStorage`. Implementar con un `ThemeContext`:

```jsx
const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme: () => setIsDark(v => !v) }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
```

Toggle button:
```jsx
<button onClick={toggleTheme} className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
  {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
</button>
```

---

## Página de Login

Estructura estándar centrada con gradiente de fondo:

```jsx
<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
  <div className="w-full max-w-md">
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-8">
      {/* Ícono con bg azul */}
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg">
        <AppIcon className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">App Name</h1>
      <p className="text-gray-600 dark:text-gray-400 mt-2">Descripción breve</p>
    </div>
  </div>
</div>
```

---

## Grids de stats / métricas

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div className="card flex items-center gap-4">
    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
      <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    </div>
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Título métrica</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">$1,234</p>
    </div>
  </div>
</div>
```

Colores de ícono en stat cards:

| Color | Fondo | Ícono |
|-------|-------|-------|
| green | `bg-green-100 dark:bg-green-900/30` | `text-green-600 dark:text-green-400` |
| red | `bg-red-100 dark:bg-red-900/30` | `text-red-600 dark:text-red-400` |
| blue | `bg-blue-100 dark:bg-blue-900/30` | `text-blue-600 dark:text-blue-400` |
| yellow | `bg-yellow-100 dark:bg-yellow-900/30` | `text-yellow-600 dark:text-yellow-400` |
| purple | `bg-purple-100 dark:bg-purple-900/30` | `text-purple-600 dark:text-purple-400` |

---

## Patrones recurrentes

### Divisor con texto centrado

```jsx
<div className="relative">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
  </div>
  <div className="relative flex justify-center text-sm">
    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      Texto
    </span>
  </div>
</div>
```

### Error en formulario / alert inline

```jsx
<div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
</div>
```

### Transición global de colores

Todos los contenedores principales de layout deben tener `transition-colors duration-200` para que el cambio de tema sea suave.

---

## Íconos frecuentes (Lucide React)

| Uso | Ícono |
|-----|-------|
| Cerrar / dismiss | `X` |
| Loading | `Loader2` con `animate-spin` |
| Éxito | `CheckCircle` |
| Error | `AlertCircle` |
| Warning | `AlertTriangle` |
| Info | `Info` |
| Theme toggle | `Sun` / `Moon` |
| Menú hamburguesa | `Menu` / `X` |
| Estado vacío | `FileX` |
| Gráfico / stats | `BarChart3`, `TrendingUp`, `TrendingDown` |
| Target / objetivo | `Target`, `Award` |

Tamaño estándar:
- Ícono de navegación: `w-4 h-4`
- Ícono en botón: `w-4 h-4`
- Ícono de header/toggle: `w-5 h-5`
- Ícono de estado vacío: `w-8 h-8`
- Ícono de logo grande: `w-8 h-8` en box de `w-16 h-16`
