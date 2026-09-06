const fs = require('fs');

let content = fs.readFileSync('data_only.sql', 'utf8');

content = content.replace(/unistr\('((?:[^']|'')*)'\)/g, (match, inner) => {
  let decoded = inner.replace(/\\u([0-9a-fA-F]{4})/g, (m, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  return "'" + decoded + "'";
});

fs.writeFileSync('data_only_fixed.sql', content);
console.log('Fixed unistr!');
