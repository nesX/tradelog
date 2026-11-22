# Task: Bloque colapsable (:::more) en notas vía directivas de markdown
2026-06-02

## Objetivo
Añadir soporte para contenido colapsable dentro de los bloques de texto y callout
de notas, usando la sintaxis de directiva `:::more`. Renderiza un título clicable;
al abrirlo se muestra el contenido. SIEMPRE arranca cerrado.

NO se modifica el esquema de BD. Vive solo en la capa de render; el contenido se
guarda como texto plano markdown, igual que ahora. SIN persistencia de estado
(comportamiento nativo de <details>: al recargar vuelve a cerrado).

## Sintaxis

:::more[Título del bloque]
Contenido markdown normal. Soporta **negrita**, listas, código,
tablas (remark-gfm), etc.

- item 1
- item 2
:::

Reglas:
- El título va entre [...] pegado a :::more. Si falta, usar "Ver más" como fallback.
- NO soportar anidamiento (un :::more dentro de otro). Si aparece, el interno se
  renderiza como texto sin romper el externo.

## Dependencias
Instalar: `remark-directive` y `remark-directive-rehype`

(remark-directive-rehype convierte la directiva en un nodo que react-markdown puede
mapear a un componente vía `components={...}`, sin necesidad de rehype-raw ni de
escribir un plugin manual.)

## Implementación

### 1. Componente MoreBlock
Crear `frontend/src/components/notes/MoreBlock.jsx`.

- Componente puramente presentacional. SIN estado propio, SIN useEffect, SIN
  localStorage.
- Usa `<details>`/`<summary>` nativos (accesibilidad por teclado + ARIA gratis).
- NUNCA pasar el atributo `open` → siempre arranca cerrado.
- Props inyectadas vía components mapping:
  - título: el label de la directiva (texto dentro de [...]). Si no llega, "Ver más".
  - children: el contenido ya renderizado por react-markdown.

Estructura aproximada:
  <details className="...">
    <summary className="...">{title}</summary>
    <div className="...">{children}</div>
  </details>

### 2. Estilos (Tailwind)
Coherente con NoteCalloutBlock.jsx (igualar tokens de color/espaciado):
- Borde sutil + radio redondeado.
- summary: cursor pointer, peso de fuente semibold, flecha que rota 90° en [open].
- Ocultar marcador nativo: list-style none + ::-webkit-details-marker { display:none }.
- Padding del contenido alineado con el resto de bloques.

### 3. Integrar en los renderizadores
En NoteTextBlock.jsx, NoteCalloutBlock.jsx y demás componentes que usen
react-markdown + remark-gfm:
- remarkPlugins: añadir `remarkDirective` y `remarkDirectiveRehype` (en ese orden,
  después de remarkGfm).
- components: mapear el nombre de la directiva al componente:
    components={{ more: MoreBlock }}
  remark-directive-rehype expone el label de la directiva; extraerlo dentro de
  MoreBlock para usarlo como título (revisar cómo lo pasa la librería: típicamente
  como primer hijo con data de directiveLabel, o como prop según config).
- NO añadir rehype-raw ni cambiar la sanitización. El HTML embebido en el texto
  sigue ignorándose (sin regresión de seguridad).

## Verificación
- [x] `:::more[X] ... :::` renderiza título clicable y contenido oculto por defecto. (render verificado vía react-dom/server)
- [x] Al hacer click se expande y muestra el contenido. (comportamiento nativo de `<details>`, sin estado custom)
- [x] El markdown interno (negrita, listas, código, tablas) se renderiza dentro. (verificado)
- [x] Al recargar la página, vuelve a estado cerrado (sin persistencia, esperado). (no se pasa `open`; nativo)
- [x] Título ausente → muestra "Ver más". (casos sinLabel y labelVacío verificados)
- [x] Texto markdown normal (sin :::) renderiza igual que antes (sin regresión). (verificado, incl. tablas gfm)
- [x] HTML embebido en el texto sigue ignorándose. (`<script>`/`<b>` se escapan; sin rehype-raw)
- [x] Funciona igual en NoteTextBlock y NoteCalloutBlock. (mismos plugins/components en ambos)

## Notas de implementación
- `remark-directive-rehype` NO expone el label de la directiva como prop (solo mapea
  `name`→tag y `{attrs}`→props). El label `[Título]` queda como primer hijo `paragraph`
  con `data.directiveLabel`, que se pierde al pasar a hast. Por eso se añadió un
  transformer mínimo `frontend/src/utils/remarkMore.js` que extrae el label a
  `data-more-title` y lo quita del contenido. Corre entre `remark-directive` y
  `remark-directive-rehype`. El título llega al componente como `node.properties.dataMoreTitle`.
- Orden de plugins: `[remarkGfm, remarkDirective, remarkMore, remarkDirectiveRehype]`.
- Nuevas deps: `remark-directive`, `remark-directive-rehype`, `unist-util-visit`.
- Anidamiento: `remark-directive` parsea el `:::more` interno y deja el `:::` de cierre
  sobrante como texto; el externo NO se rompe (regla dura cumplida).

## Orden de implementación
1. Instalar remark-directive y remark-directive-rehype
2. MoreBlock.jsx + estilos
3. Integrar en NoteTextBlock.jsx y probar
4. Integrar en NoteCalloutBlock.jsx y demás