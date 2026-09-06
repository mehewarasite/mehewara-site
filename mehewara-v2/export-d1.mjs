import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = 'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/3bfa5b514d239e1d8b748c0689d19f658f2fdefab521a98f0d2b4ab8af76cea8.sqlite';
const db = new Database(dbPath);

const tables = ['legacy_id_map', 'subjects', 'papers', 'gallery_items', 'study_materials', 'questions', 'question_options'];
let sql = '';

for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  for (const row of rows) {
    const values = Object.values(row).map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return "'" + v.replace(/'/g, "''") + "'";
      return "'" + String(v).replace(/'/g, "''") + "'";
    });
    sql += `INSERT INTO ${table} VALUES(${values.join(',')});\n`;
  }
}

fs.writeFileSync('data_only_better.sql', sql);
console.log('Exported ' + sql.split('\n').length + ' lines.');
