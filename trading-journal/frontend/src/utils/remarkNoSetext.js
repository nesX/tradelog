/**
 * Desactiva los encabezados setext de Markdown.
 *
 * Un encabezado setext es una línea de texto "subrayada" con `===` (→ `<h1>`) o
 * con `---` (→ `<h2>`). El problema: eso secuestra el `---`. Cuando el usuario
 * escribe una línea de texto y debajo `---` para dibujar un separador, Markdown
 * lo interpreta como el subrayado del texto de arriba (un `<h2>`) y el `---`
 * desaparece como regla horizontal.
 *
 * Al desactivar el constructo `setextUnderline` del parser (micromark), `---`
 * pasa a ser SIEMPRE una regla horizontal (`<hr>`), que es el significado
 * intuitivo en estas notas. Los encabezados ATX (`# Título`) no se ven
 * afectados, así que no se pierde nada de uso real.
 */
export default function remarkNoSetext() {
  const data = this.data();
  const extensions = data.micromarkExtensions || (data.micromarkExtensions = []);
  extensions.push({ disable: { null: ['setextUnderline'] } });
}
