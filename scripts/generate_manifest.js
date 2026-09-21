import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.join(__dirname, '../public/models');
const MODELS_JSON_PATH = path.join(__dirname, '../public/data/models.json');

// Initialize base models.json structure
const manifest = {
  version: 2,
  chunkSizeMeters: 360,
  units: "meters",
  axes: {
    x: "east",
    y: "up",
    z: "south"
  },
  chunks: []
};

// Generate SHA256 hash for a file
function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

if (fs.existsSync(MODELS_DIR)) {
  const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.glb'));
  for (const file of files) {
    const filePath = path.join(MODELS_DIR, file);
    const stats = fs.statSync(filePath);
    const hash = getSha256(filePath);
    
    // Add to chunks array (basic implementation, you can enhance to parse bounding boxes later)
    manifest.chunks.push({
      url: `models/${file}`,
      bytes: stats.size,
      sha256: hash
    });
  }
}

fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(manifest, null, 2));
console.log(`✅ Cập nhật thành công ${manifest.chunks.length} asset vào models.json`);
