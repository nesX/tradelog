/**
 * Ordena los archivos elegidos del más viejo al más reciente (`lastModified`).
 *
 * El selector de archivos del navegador no expone el orden en que se hizo click:
 * cada SO devuelve la lista a su manera (Windows, por ejemplo, pone primero el
 * último que marcaste). Para capturas de pantalla, `lastModified` es el momento
 * de la captura, así que el orden cronológico es el que uno espera al elegirlas.
 * A igual fecha, por nombre (las capturas llevan la hora en el nombre).
 *
 * Hay que llamarlo antes de comprimir: el archivo comprimido es nuevo y pierde
 * el `lastModified` original.
 */
export const sortByLastModified = (files) =>
  Array.from(files).sort(
    (a, b) =>
      (a.lastModified || 0) - (b.lastModified || 0) ||
      String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
  );
