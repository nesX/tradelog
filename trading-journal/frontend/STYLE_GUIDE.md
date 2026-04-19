# Style Guide — Trading Journal Frontend

Documento de referencia para replicar el sistema de diseño en otro proyecto web.
Está pensado para ser leído por un agente que implemente estos estilos desde cero.

---

## Stack base

- **Tailwind CSS v3** con `darkMode: 'class'`
- **@tailwindcss/typography** (para contenido markdown con clases `prose`)
- **React** (JSX) — los patrones de clase son directamente trasladables a cualquier framework
- **Lucide React** como librería de iconos

---

## 1. Configuración de Tailwind

### tailwind.config.js

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        profit: {
          light: '#dcfce7',
          DEFAULT: '#22c55e',
          dark: '#15803d',
        },
        loss: {
          light: '#fee2e2',
          DEFAULT: '#ef4444',
          dark: '#b91c1c',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
```

### Dark mode

El dark mode se activa añadiendo la clase `dark` al elemento `<html>`. El estado se guarda en `localStorage` bajo la clave `'theme'`. Si no hay preferencia guardada, se respeta `prefers-color-scheme`.

---

## 2. Estilos globales (globals.css)

Copiar literalmente en el archivo CSS principal del nuevo proyecto:

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
  .btn-primary   { @apply btn bg-blue-600  text-white hover:bg-blue-700  focus:ring-blue-500; }
  .btn-secondary { @apply btn bg-gray-200  text-gray-800 hover:bg-gray-300 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600; }
  .btn-danger    { @apply btn bg-red-600   text-white hover:bg-red-700   focus:ring-red-500; }
  .btn-success   { @apply btn bg-green-600 text-white hover:bg-green-700 focus:ring-green-500; }

  /* ── Inputs ── */
  .input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg
           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
           disabled:bg-gray-100 disabled:cursor-not-allowed;
    @apply dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100
           dark:disabled:bg-gray-700 dark:placeholder-gray-400;
  }
  .input-error { @apply border-red-500 focus:ring-red-500; }

  /* ── Labels ── */
  .label { @apply block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300; }

  /* ── Cards ── */
  .card { @apply bg-white rounded-xl shadow-sm border border-gray-200 p-6 dark:bg-gray-800 dark:border-gray-700; }

  /* ── Badges ── */
  .badge        { @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium; }
  .badge-blue   { @apply badge bg-blue-100   text-blue-800   dark:bg-blue-900   dark:text-blue-200; }
  .badge-purple { @apply badge bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200; }
  .badge-yellow { @apply badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200; }
  .badge-gray   { @apply badge bg-gray-100   text-gray-800   dark:bg-gray-700   dark:text-gray-300; }
  .badge-green  { @apply badge bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200; }
  .badge-red    { @apply badge bg-red-100    text-red-800    dark:bg-red-900    dark:text-red-200; }

  /* ── Tabla ── */
  .table-container { @apply overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700; }
  .table           { @apply min-w-full divide-y divide-gray-200 dark:divide-gray-700; }
  .table th        { @apply px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 dark:bg-gray-800 dark:text-gray-400; }
  .table td        { @apply px-4 py-3 text-sm text-gray-900 whitespace-nowrap dark:text-gray-100; }
  .table tbody tr  { @apply hover:bg-gray-50 transition-colors dark:hover:bg-gray-700; }
}

@layer utilities {
  .text-profit { @apply text-green-600 dark:text-green-400; }
  .text-loss   { @apply text-red-600   dark:text-red-400; }
  .bg-profit   { @apply bg-green-50    dark:bg-green-900/20; }
  .bg-loss     { @apply bg-red-50      dark:bg-red-900/20; }
}
```

---

## 3. Layout

### Estructura general

```jsx
<div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
  <Header />
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    {children}
  </main>
  <footer className="mt-auto py-4 text-center text-sm text-gray-500 dark:text-gray-400">
    App Name — {year}
  </footer>
</div>
```

### Header / Navbar

```jsx
<header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 transition-colors duration-200">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex items-center justify-between h-16">

      {/* Logo */}
      <a href="/" className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-gray-900 dark:text-white">Nombre App</span>
      </a>

      {/* Nav links */}
      <nav className="flex items-center space-x-1">
        {/* Inactive link */}
        <a href="/ruta" className="flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
          text-gray-600 hover:bg-gray-100 hover:text-gray-900
          dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white">
          <Icon className="w-4 h-4 mr-2" /> Página
        </a>

        {/* Active link */}
        <a href="/ruta" className="flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
          bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          <Icon className="w-4 h-4 mr-2" /> Activa
        </a>

        {/* Dark mode toggle */}
        <button className="ml-2 p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
          <SunOrMoonIcon className="w-5 h-5" />
        </button>
      </nav>
    </div>
  </div>
</header>
```

---

## 4. Componentes base

### Botón

Se usan las clases CSS definidas en globals.css. Tamaños:

| Size | Clases adicionales |
|------|-------------------|
| sm   | `text-sm px-3 py-1.5` |
| md   | `text-sm px-4 py-2` (por defecto) |
| lg   | `text-base px-5 py-2.5` |

```jsx
{/* Primario */}
<button className="btn-primary">Guardar</button>

{/* Secundario */}
<button className="btn-secondary">Cancelar</button>

{/* Peligro */}
<button className="btn-danger">Eliminar</button>

{/* Con icono */}
<button className="btn-primary flex items-center gap-2">
  <PlusIcon className="w-4 h-4" /> Nuevo
</button>

{/* Cargando */}
<button className="btn-primary" disabled>
  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
  Guardando...
</button>

{/* Ghost */}
<button className="btn bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
  Acción sutil
</button>
```

### Input de texto

```jsx
<div>
  <label className="label">
    Campo <span className="text-red-500 ml-1">*</span>
  </label>
  <input
    type="text"
    className="input"
    placeholder="Escribe aquí..."
  />
  {/* Estado error */}
  <input className="input input-error" />
  <p className="mt-1 text-sm text-red-600 dark:text-red-400">Mensaje de error</p>
  {/* Helper text */}
  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Texto de ayuda</p>
</div>
```

### Select

```jsx
<div>
  <label className="label">Selecciona</label>
  <select className="input">
    <option value="">Seleccionar...</option>
    <option value="a">Opción A</option>
  </select>
</div>
```

### Card

```jsx
{/* Card estándar */}
<div className="card">
  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Título</h2>
  <p className="text-sm text-gray-500 dark:text-gray-400">Contenido...</p>
</div>

{/* Card sin padding (para tablas, etc.) */}
<div className="card p-0 overflow-hidden">
  ...
</div>

{/* Card compacta */}
<div className="card p-4">
  ...
</div>
```

### Badge / Etiqueta

```jsx
<span className="badge-blue">Tipo A</span>
<span className="badge-green">Activo</span>
<span className="badge-red">Error</span>
<span className="badge-yellow">Pendiente</span>
<span className="badge-gray">Inactivo</span>
<span className="badge-purple">Especial</span>
```

---

## 5. Modal

```jsx
{isOpen && (
  <div className="fixed inset-0 z-50">
    {/* Overlay */}
    <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

    {/* Contenedor centrado */}
    <div className="flex min-h-full items-center justify-center p-4">
      {/* Caja del modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Título</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {children}
        </div>

        {/* Footer (opcional) */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary">Confirmar</button>
        </div>
      </div>
    </div>
  </div>
)}
```

**Tamaños disponibles:** `max-w-md` (sm) · `max-w-lg` (md) · `max-w-2xl` (lg) · `max-w-4xl` (xl)

**Comportamiento:** cerrar con Escape, bloquear scroll del body con `document.body.style.overflow = 'hidden'` al abrir.

---

## 6. Toast / Notificaciones

```jsx
{/* Contenedor fijo (arriba a la derecha) */}
<div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">

  {/* Toast success */}
  <div className="flex items-start p-4 rounded-lg border-l-4 shadow-lg
                  bg-green-50 border-green-500 dark:bg-green-900/50">
    <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
    <p className="ml-3 text-sm text-green-800 dark:text-green-200">Operación exitosa</p>
    <button className="ml-auto text-green-500 hover:opacity-70"><XIcon className="w-4 h-4" /></button>
  </div>

  {/* Toast error */}
  <div className="flex items-start p-4 rounded-lg border-l-4 shadow-lg
                  bg-red-50 border-red-500 dark:bg-red-900/50">
    <AlertCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
    <p className="ml-3 text-sm text-red-800 dark:text-red-200">Ocurrió un error</p>
  </div>

  {/* Toast warning */}
  <div className="flex items-start p-4 rounded-lg border-l-4 shadow-lg
                  bg-yellow-50 border-yellow-500 dark:bg-yellow-900/50">
    <AlertTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
    <p className="ml-3 text-sm text-yellow-800 dark:text-yellow-200">Atención</p>
  </div>

  {/* Toast info */}
  <div className="flex items-start p-4 rounded-lg border-l-4 shadow-lg
                  bg-blue-50 border-blue-500 dark:bg-blue-900/50">
    <InfoIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
    <p className="ml-3 text-sm text-blue-800 dark:text-blue-200">Información</p>
  </div>
</div>
```

Auto-dismiss a los **5000 ms**.

---

## 7. Página de Login

```jsx
<div className="min-h-screen flex items-center justify-center
                bg-gradient-to-br from-gray-50 to-gray-100
                dark:from-gray-900 dark:to-gray-800 px-4">
  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-8 w-full max-w-md">

    {/* Logo / branding */}
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nombre App</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Subtítulo o descripción breve</p>
      </div>
    </div>

    {/* Error */}
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p className="text-sm text-red-600 dark:text-red-400 text-center">Mensaje de error</p>
    </div>

    {/* Formulario */}
    <form className="space-y-4">
      <div>
        <label className="label">Email</label>
        <input type="email" className="input" />
      </div>
      <div>
        <label className="label">Contraseña</label>
        <input type="password" className="input" />
      </div>
      <button type="submit" className="btn-primary w-full mt-2">Entrar</button>
    </form>

    {/* Separador */}
    <div className="relative flex items-center">
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
      <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">o</span>
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
    </div>
  </div>
</div>
```

---

## 8. Cabeceras de página

```jsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Título de la página</h1>
    <p className="text-gray-500 dark:text-gray-400 mt-1">Descripción o subtítulo</p>
  </div>
  <div className="flex items-center space-x-3">
    <button className="btn-secondary">Acción secundaria</button>
    <button className="btn-primary flex items-center gap-2">
      <PlusIcon className="w-4 h-4" /> Acción principal
    </button>
  </div>
</div>
```

---

## 9. Tarjetas de estadísticas (KPI cards)

```jsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

  {/* Variante verde */}
  <div className="card flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Métrica</p>
      <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">$1,234</p>
      <p className="text-xs text-gray-400 mt-1">Subvalor</p>
    </div>
    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/30">
      <Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
    </div>
  </div>

  {/* Variante roja */}
  <div className="card flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Métrica</p>
      <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">-$456</p>
    </div>
    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/30">
      <Icon className="w-5 h-5 text-red-600 dark:text-red-400" />
    </div>
  </div>

  {/* Variante azul */}
  <div className="card flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Métrica</p>
      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">42</p>
    </div>
    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
      <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    </div>
  </div>

  {/* Variante amarilla */}
  <div className="card flex items-start justify-between">
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Métrica</p>
      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">78%</p>
    </div>
    <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/30">
      <Icon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
    </div>
  </div>
</div>
```

**Otras variantes de color para el icono:** purple (`bg-purple-50/dark:bg-purple-900/30`, `text-purple-600/dark:text-purple-400`).

---

## 10. Tabla

```jsx
<div className="card p-0 overflow-hidden">
  <div className="table-container">
    <table className="table">
      <thead>
        <tr>
          <th>Columna A</th>
          <th>Columna B</th>
          <th className="text-right">Valor</th>
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <td>Dato A</td>
          <td><span className="badge-green">Activo</span></td>
          <td className="text-right font-medium text-profit">+$100</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

---

## 11. Avatar con iniciales

```jsx
{/* Pequeño (header) */}
<div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
  JD
</div>

{/* Mediano */}
<div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-base font-medium">
  JD
</div>
```

---

## 12. Dropdown / Menú contextual

```jsx
<div className="relative">
  <button onClick={() => setOpen(v => !v)} className="btn-secondary">Abrir menú</button>

  {open && (
    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800
                    rounded-lg shadow-lg border border-gray-200 dark:border-gray-700
                    py-1 z-50">
      <button className="flex items-center w-full px-4 py-2 text-sm
                         text-gray-700 dark:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-gray-700">
        <EditIcon className="w-4 h-4 mr-3" /> Editar
      </button>
      <button className="flex items-center w-full px-4 py-2 text-sm
                         text-red-600 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-900/20">
        <TrashIcon className="w-4 h-4 mr-3" /> Eliminar
      </button>
    </div>
  )}
</div>
```

Siempre añadir detección de **click fuera** (`mousedown` listener en `document`) para cerrar el dropdown.

---

## 13. Empty state

```jsx
<div className="flex flex-col items-center justify-center py-16 text-center px-6">
  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
    <Icon className="w-8 h-8 text-gray-400" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sin resultados</h3>
  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-5">
    No hay elementos que mostrar todavía.
  </p>
  <button className="btn-primary flex items-center gap-2">
    <PlusIcon className="w-4 h-4" /> Crear primero
  </button>
</div>
```

---

## 14. Loading states

```jsx
{/* Spinner de página */}
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
</div>

{/* Spinner inline (botón) */}
<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />

{/* Skeleton de fila */}
<div className="animate-pulse flex gap-4 px-4 py-3">
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/5"></div>
</div>
```

---

## 15. Contenido Markdown (prose)

Requiere `@tailwindcss/typography` instalado.

```jsx
<div className="prose prose-sm dark:prose-invert max-w-none
                text-gray-800 dark:text-gray-200
                prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
                prose-code:bg-gray-100 dark:prose-code:bg-gray-700
                prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-code:text-sm prose-code:font-mono
                prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800
                prose-a:text-blue-600 dark:prose-a:text-blue-400">
  {/* Renderizar HTML o componente Markdown aquí */}
</div>
```

El contenedor editable (textarea en modo edición, `div` en modo preview) usa:

```jsx
{/* Modo preview — siempre con fondo */}
<div className="bg-gray-50 dark:bg-gray-700/30
                hover:bg-gray-100 dark:hover:bg-gray-700/60
                hover:ring-1 hover:ring-gray-200 dark:hover:ring-gray-600/50
                rounded-xl px-4 py-3 cursor-text transition-colors min-h-[44px]">
  ...
</div>

{/* Modo edición */}
<textarea className="w-full min-h-[80px] resize-none
                     bg-gray-50 dark:bg-gray-700/40
                     border border-blue-400 dark:border-blue-500
                     rounded-xl p-4
                     text-sm text-gray-900 dark:text-gray-100
                     font-mono leading-relaxed outline-none transition-colors" />
```

---

## 16. Paleta de colores resumida

| Uso | Light | Dark |
|-----|-------|------|
| Fondo de página | `bg-gray-50` | `dark:bg-gray-900` |
| Fondo de card/panel | `bg-white` | `dark:bg-gray-800` |
| Fondo hover fila/ítem | `hover:bg-gray-50` | `dark:hover:bg-gray-700` |
| Borde base | `border-gray-200` | `dark:border-gray-700` |
| Texto primario | `text-gray-900` | `dark:text-white` |
| Texto secundario | `text-gray-600` | `dark:text-gray-300` |
| Texto terciario/hint | `text-gray-500` | `dark:text-gray-400` |
| Acción primaria | `bg-blue-600` | (mismo) |
| Hover acción primaria | `hover:bg-blue-700` | (mismo) |
| Active nav | `bg-blue-50 text-blue-700` | `dark:bg-blue-900/50 dark:text-blue-300` |
| Positivo/éxito | `text-green-600` | `dark:text-green-400` |
| Negativo/error | `text-red-600` | `dark:text-red-400` |
| Advertencia | `text-yellow-600` | `dark:text-yellow-400` |
| Info / acento | `text-blue-600` | `dark:text-blue-400` |

---

## 17. Tipografía

| Elemento | Clases |
|----------|--------|
| H1 / título de página | `text-2xl font-bold text-gray-900 dark:text-white` |
| H2 / título de sección | `text-lg font-semibold text-gray-900 dark:text-white` |
| H3 / subtítulo card | `text-base font-semibold text-gray-800 dark:text-gray-100` |
| Cuerpo normal | `text-sm text-gray-700 dark:text-gray-300` |
| Texto secundario | `text-sm text-gray-500 dark:text-gray-400` |
| Metadata / helper | `text-xs text-gray-400 dark:text-gray-500` |
| Código inline | `font-mono text-sm bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded` |
| Cabecera de tabla | `text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400` |

---

## 18. Espaciado y radios

| Concepto | Valor |
|----------|-------|
| Radio botones / inputs | `rounded-lg` |
| Radio cards / panels grandes | `rounded-xl` |
| Radio logo / avatar cuadrado | `rounded-2xl` |
| Radio avatares circulares / badges | `rounded-full` |
| Sombra cards | `shadow-sm` |
| Sombra modales | `shadow-xl` |
| Sombra dropdowns | `shadow-lg` |
| Padding card | `p-6` |
| Padding card compacta | `p-4` |
| Separación entre secciones | `mb-6` |
| Separación entre grupos | `mb-4` |
| Gap en grids | `gap-4` o `gap-6` |
| Gap en filas de botones | `space-x-3` |

---

## 19. Jerarquía de z-index

| Elemento | z-index |
|----------|---------|
| Header sticky | `z-40` |
| Dropdowns | `z-50` |
| Modales y Toasts | `z-50` |
| Visor fullscreen | `z-[100]` |

---

## 20. Transiciones y animaciones

```css
/* Estándar para colores (hover, estados) */
transition-colors duration-200

/* Para todos los cambios */
transition-all

/* Opacidad */
transition-opacity

/* Carga infinita */
animate-spin      /* border-t-transparent trick */

/* Skeleton loading */
animate-pulse

/* Rotación de chevron en acordeón/menú */
transition-transform (+ rotate-180 condicionalmente)
```

---

## Notas para el agente implementador

1. **No reinventar la rueda**: copiar `globals.css` completo y `tailwind.config.js` exactamente como están en las secciones 1 y 2. Las clases `.btn`, `.card`, `.input`, `.badge-*` y `.table*` se referencian desde todos los componentes.

2. **Dark mode**: implementar el toggle guardando en `localStorage` y aplicando/quitando la clase `dark` en `document.documentElement`. Sin esta lógica el dark mode no funciona aunque Tailwind esté configurado.

3. **Iconos**: el proyecto original usa **Lucide** (`lucide-react`). Instalar con `npm install lucide-react` o usar equivalentes de otra librería respetando los tamaños (`w-4 h-4`, `w-5 h-5`, `w-8 h-8`).

4. **Spinner de carga**: siempre `border-2 border-{color} border-t-transparent rounded-full animate-spin`, NO usar `border-b-transparent` ni otro truco. Cambia el color según el fondo.

5. **Focus rings**: siempre `focus:ring-2 focus:ring-blue-500 focus:ring-offset-2` en elementos interactivos. Importante para accesibilidad.

6. **Markdown**: instalar `@tailwindcss/typography` + librería de renderizado markdown (en este proyecto: `react-markdown`). Aplicar las clases `prose` del apartado 15.
