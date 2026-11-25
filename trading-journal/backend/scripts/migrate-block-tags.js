#!/usr/bin/env node
/**
 * Migra notas-categoría a tags de bloque (spec tags-bloques.md §7, task 041).
 *
 *   node scripts/migrate-block-tags.js --map ./block-tags-map.json            # dry-run (por defecto)
 *   node scripts/migrate-block-tags.js --map ./block-tags-map.json --apply
 *   node scripts/migrate-block-tags.js --rollback ./reports/block-tags-<ts>.json
 *
 * Usa el pool del backend, así que necesita todas las variables de entorno de
 * config/env.js: correrlo dentro del contenedor
 * (`docker exec tradelog-backend node scripts/migrate-block-tags.js …`).
 *
 * El reporte queda en reports/block-tags-<timestamp>.json (.dryrun.json en
 * dry-run). En prod reports/ no es un volumen: copiarlo al host con `docker cp`
 * antes de recrear el contenedor, porque el rollback lo necesita.
 *
 * La lógica vive en src/services/blockTagsMigration.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../src/config/database.js';
import { migrateBlockTags, rollbackBlockTags, MappingError } from '../src/services/blockTagsMigration.js';

const REPORTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports');

const USAGE = `Uso:
  node scripts/migrate-block-tags.js --map <mapeo.json> [--apply]
  node scripts/migrate-block-tags.js --rollback <reporte.json>`;

const parseArgs = (argv) => {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--map') args.map = argv[++i];
    else if (arg === '--rollback') args.rollback = argv[++i];
    else throw new Error(`Argumento desconocido: ${arg}\n${USAGE}`);
  }
  if (Boolean(args.map) === Boolean(args.rollback)) throw new Error(USAGE);
  if (args.rollback && args.apply) throw new Error('--apply no va con --rollback');
  return args;
};

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

const writeReport = (report) => {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, '-');
  const file = path.join(REPORTS_DIR, `block-tags-${stamp}${report.mode === 'apply' ? '' : '.dryrun'}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
};

const printSummary = (report, file) => {
  const byStatus = report.references.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  console.log(`\n${report.mode === 'apply' ? 'APLICADO' : 'DRY-RUN (no se guardó nada)'} — usuario ${report.userId}`);
  for (const note of report.notes) {
    console.log(
      `  · ${note.note_title} (#${note.note_id}) → ${note.tags.join(', ')}: ` +
        `${note.blocks_tagged} bloques, ${note.assignments_created} asignaciones, ${note.references} referencias`
    );
  }
  console.log(`  Tags creados: ${report.created_tags.length} · Cambios de grupo: ${report.group_changes.length}`);
  console.log(
    `  Asignaciones nuevas: ${report.inserted_block_tags.length} de bloque, ${report.inserted_note_tags.length} de nota`
  );
  console.log(
    `  Referencias: ${byStatus.redundante || 0} redundantes, ${byStatus.rota || 0} rotas, ` +
      `${byStatus.apunta_a_nota || 0} apuntan a una nota`
  );
  for (const warning of report.warnings) console.log(`  ⚠ ${warning}`);
  console.log(`  Reporte: ${file}\n`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const client = await pool.connect();
  try {
    if (args.rollback) {
      if (args.rollback.endsWith('.dryrun.json')) {
        throw new MappingError(
          ['es de un dry-run: no insertó nada que deshacer'],
          'El reporte no sirve para el rollback'
        );
      }
      const result = await rollbackBlockTags(client, readJson(args.rollback));
      console.log(
        `\nROLLBACK — ${result.deleted_block_tags} asignaciones de bloque y ` +
          `${result.deleted_note_tags} de nota borradas.`
      );
      if (result.created_tags.length > 0 || result.group_changes.length > 0) {
        console.log('  No se tocan los tags; revertir a mano si hace falta:');
        for (const t of result.created_tags) console.log(`  · creado: "${t.name}" (#${t.id}, ${t.group_key})`);
        for (const g of result.group_changes) console.log(`  · grupo: "${g.name}" (#${g.tag_id}) ${g.from} → ${g.to}`);
      }
      return;
    }

    const report = await migrateBlockTags(client, readJson(args.map), { apply: args.apply });
    printSummary(report, writeReport(report));
  } finally {
    client.release();
    await closePool();
  }
};

main().catch((err) => {
  console.error(`\n${err instanceof MappingError ? err.message : err.stack || err.message}\n`);
  process.exit(1);
});
