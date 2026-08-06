# Task 06 — Verificación

## Objetivo

Confirmar el flujo end-to-end antes de dar por cerrada la V1.

## Checklist

- [ ] `npm run lint` en backend y frontend sin errores nuevos.
- [ ] Backend levanta y el endpoint responde:
  - mover bloque text entre dos notas → 200, aparece al final del destino.
  - destino sección → 400; destino = misma nota → 400; nota de otro usuario → 404.
  - bloque reference de sub-nota → sub-nota reparentada en `/api/notes/tree`.
- [ ] UI: botón visible en hover, modal filtra y excluye destinos inválidos,
  bloque desaparece optimista y aparece en el destino.
- [ ] `docs/api/reference.md` actualizado con el endpoint nuevo.
