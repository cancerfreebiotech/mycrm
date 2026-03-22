import sharp from 'sharp'
export { generateCardFilename } from './cardFilename'

export async function processCardImage(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate() // auto-rotate based on EXIF orientation, then strip the tag
    .resize(1024, 1024, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
}

