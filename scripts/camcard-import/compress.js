// compress.js <inputPath> <outputPath>
const sharp = require('../../node_modules/sharp');
const [,, input, output] = process.argv;
sharp(input)
  .rotate()
  .resize(1024, 1024, { fit: 'inside' })
  .jpeg({ quality: 85 })
  .toFile(output)
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
