import fs from 'fs';
import path from 'path';

const extraDir = path.resolve('src/assets/kenney_ui-pack/PNG/Extra');
if (fs.existsSync(extraDir)) {
  console.log('UI Pack Extra:', fs.readdirSync(extraDir));
}

const yellowDir = path.resolve('src/assets/kenney_ui-pack/PNG/Yellow');
if (fs.existsSync(yellowDir)) {
  console.log('UI Pack Yellow sample:', fs.readdirSync(yellowDir).slice(0, 20));
}
