# Progreso — Mover bloques a otra nota

> Estado vivo del tablero. Las tareas terminadas se mueven a [`DONE.md`](DONE.md).

## En progreso

- (ninguna)

## Pendientes

- (ninguna — V1 completa, ver [`DONE.md`](DONE.md))

## Notas operativas

- El `node --watch` del contenedor `tradelog-backend` no detecta cambios hechos desde el
  host (los eventos inotify no cruzan el bind mount): tras tocar backend hay que
  reiniciar el contenedor (`sudo docker compose --env-file backend/.env restart backend`)
  para que la ruta nueva quede servida en el dev de :3088.
- Lint (`npm run lint`) está roto pre-existente en backend y frontend: no hay archivo de
  configuración de ESLint en el working tree. Fuera del alcance de este feature.

## Ideas V2 (fuera de alcance)

- Arrastrar el bloque directamente al árbol del sidebar (requiere unificar los DndContexts
  del editor y del `NoteTree`).
- Multi-selección de bloques para mover en lote.
- Elegir posición exacta en la nota destino (hoy: siempre al final).
- Toast con enlace "Ver en [nota destino]" + deshacer.
