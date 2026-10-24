import fs from 'fs';
import path from 'path';

const uDir = path.resolve('src/assets/kenney_ui-pack/Sounds');
if (fs.existsSync(uDir)) {
  console.log('UI Pack sounds:', fs.readdirSync(uDir));
}
