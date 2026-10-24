import fs from 'fs';
import path from 'path';

const iconDir = path.resolve('src/assets/kenney_game-icons/PNG/White/2x');
const icons = fs.readdirSync(iconDir);
console.log('Available icons in White/2x:');
icons.forEach(i => console.log(i));
