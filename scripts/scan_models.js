const fs = require('fs');
const path = require('path');

const modelDir = '/Users/fengfan/Documents/newPro/doc/model';
const output = '/Users/fengfan/Documents/newPro/frontend/public/model_index.json';

const models = [];

function scan(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    console.error(`Error reading dir ${dir}:`, e);
    return;
  }

  let hasModel = false;

  // Check for model3.json (V3)
  // Some models might have multiple .model3.json files? Usually one main one.
  // We'll pick the one that matches folder name if possible, or just the first one.
  // The LS output showed "aijier_2.model3.json" inside "aijier_2".
  
  const model3Files = files.filter(f => f.endsWith('.model3.json'));
  if (model3Files.length > 0) {
    // Prefer one matching folder name
    const folderName = path.basename(dir);
    let chosen = model3Files.find(f => f === `${folderName}.model3.json`) || model3Files[0];
    
    const relPath = path.relative(modelDir, dir);
    // Convert windows path to forward slashes if needed, though on macOS it's fine.
    // Ideally path should use forward slashes for URL compatibility.
    const urlPath = relPath.split(path.sep).join('/');
    
    models.push({
      name: folderName,
      path: urlPath,
      configFile: chosen,
      version: 3
    });
    hasModel = true;
  }

  // Check for model.json (V2)
  if (!hasModel) {
    const model2 = files.find(f => f === 'model.json');
    if (model2) {
      const relPath = path.relative(modelDir, dir);
      const urlPath = relPath.split(path.sep).join('/');
      models.push({
        name: path.basename(dir),
        path: urlPath,
        configFile: model2,
        version: 2
      });
      hasModel = true;
    }
  }

  // Recurse
  files.forEach(f => {
    const full = path.join(dir, f);
    try {
      if (fs.statSync(full).isDirectory() && f !== '.git' && f !== 'node_modules') {
        scan(full);
      }
    } catch (e) {}
  });
}

console.log('Scanning models...');
scan(modelDir);
console.log(`Found ${models.length} models.`);

fs.writeFileSync(output, JSON.stringify(models, null, 2));
console.log(`Index written to ${output}`);
