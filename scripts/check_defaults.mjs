import fs from 'fs';
import path from 'path';

const p1 = path.resolve('src/assets/kenney_ui-pack/PNG/Yellow/Default');
console.log('Yellow/Default:', fs.readdirSync(p1).slice(0, 20));

const p2 = path.resolve('src/assets/kenney_ui-pack/PNG/Extra/Default');
console.log('Extra/Default:', fs.readdirSync(p2).slice(0, 20));
