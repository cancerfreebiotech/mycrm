// compress-batch.js — compress a card image to tmp_front.jpg or tmp_back.jpg
// Usage: node compress-batch.js <src> <dst>
const sharp = require('../../node_modules/sharp');
const [,, src, dst] = process.argv;
if (!src || !dst) { console.error('Usage: compress-batch.js <src> <dst>'); process.exit(1); }
sharp(src).rotate().resize(1024,1024,{fit:'inside'}).jpeg({quality:85})
  .toFile(dst)
  .then(() => { console.log('ok'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
