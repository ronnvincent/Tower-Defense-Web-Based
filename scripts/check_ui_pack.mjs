import fs from 'fs';
import path from 'path';

const uiDir = path.resolve('src/assets/kenney_ui-pack/PNG');
const files = fs.readdirSync(uiDir);
console.log('UI Pack items in PNG:', files.slice(0, 40));
const hearts = files.filter(f => /heart|coin|star|cross|check|life|health/i.test(f));
console.log('Matching UI pack items:', hearts);
