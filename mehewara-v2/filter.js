const fs = require('fs');
let text = fs.readFileSync('dump2.sql', 'utf8');

text = text.replace(/BEGIN TRANSACTION;/g, '');
text = text.replace(/COMMIT;/g, '');
text = text.replace(/PRAGMA[^;]+;/g, '');
text = text.replace(/CREATE TABLE _cf_METADATA[\s\S]*?\);/g, '');
text = text.replace(/INSERT INTO "?_cf_METADATA"?[\s\S]*?;/g, '');
text = text.replace(/CREATE TABLE "?d1_migrations"?[\s\S]*?\);/g, '');
text = text.replace(/INSERT INTO "?d1_migrations"?[\s\S]*?;/g, '');
text = text.replace(/INSERT INTO "?sqlite_sequence"?[\s\S]*?;/g, '');

fs.writeFileSync('dump3.sql', text);
