import fs from 'fs';
import path from 'path';

const tdDir = path.resolve('src/assets/kenney_tower-defense-top-down/PNG/Default size');
const files = fs.readdirSync(tdDir);
console.log('Total TD sprites:', files.length);

// Also check medieval RTS
const medDir = path.resolve('src/assets/kenney_medieval-rts/PNG/Default size');
const medSubdirs = fs.readdirSync(medDir);
console.log('Medieval RTS subdirs:', medSubdirs);

medSubdirs.forEach(sub => {
  const p = path.join(medDir, sub);
  if (fs.statSync(p).isDirectory()) {
    console.log(`Medieval ${sub}:`, fs.readdirSync(p));
  }
});

// Check game icons
const iconDir = path.resolve('src/assets/kenney_game-icons/PNG/White/2x');
if (fs.existsSync(iconDir)) {
  const icons = fs.readdirSync(iconDir);
  console.log('Total White 2x icons:', icons.length);
  const sample = icons.filter(f => /heart|coin|trophy|pause|play|music|sound|audio|gear|cross|sword|shield|target|bow|arrow|book/i.test(f));
  console.log('Matching UI icons:', sample);
}

// Check particles
const partDir = path.resolve('src/assets/kenney_particle-pack/PNG (Transparent)');
if (fs.existsSync(partDir)) {
  const parts = fs.readdirSync(partDir);
  console.log('Total particle sprites:', parts.length);
  console.log('Sample particles:', parts.slice(0, 10));
}

// Check impact sounds
const audioDir = path.resolve('src/assets/kenney_impact-sounds/Audio');
if (fs.existsSync(audioDir)) {
  const sfx = fs.readdirSync(audioDir);
  console.log('Total audio files:', sfx.length);
  console.log('Sample sfx:', sfx.slice(0, 8));
}
