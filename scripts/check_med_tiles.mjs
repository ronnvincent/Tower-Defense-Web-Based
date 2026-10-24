import fs from 'fs';
import path from 'path';

// Let's inspect medieval tiles:
const medTilesDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size/Tile');
const medTiles = fs.readdirSync(medTilesDir).filter(f => f.endsWith('.png'));
console.log('Total Medieval tiles:', medTiles.length);

// Also check structures:
const medStructDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size/Structure');
const medStructs = fs.readdirSync(medStructDir).filter(f => f.endsWith('.png'));
console.log('Total Medieval structures:', medStructs.length);

// Also check units:
const medUnitDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size/Unit');
const medUnits = fs.readdirSync(medUnitDir).filter(f => f.endsWith('.png'));
console.log('Total Medieval units:', medUnits.length);
