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

/** Compress a photo while preserving EXIF (time, GPS, etc.) */
export async function processPhotoWithExif(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .rotate() // auto-rotate based on EXIF orientation
    .resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .withMetadata() // preserve EXIF
    .toBuffer()
}

export interface ExifData {
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
  locationName: string | null
}

/** Extract EXIF from buffer and reverse-geocode GPS if present */
export async function extractExif(inputBuffer: Buffer): Promise<ExifData> {
  try {
    const exifr = (await import('exifr')).default
    const exif = await exifr.parse(inputBuffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'],
    })
    if (!exif) return { takenAt: null, latitude: null, longitude: null, locationName: null }

    const takenAt: Date | null = exif.DateTimeOriginal ?? exif.CreateDate ?? null
    const latitude: number | null = exif.latitude ?? null
    const longitude: number | null = exif.longitude ?? null

    let locationName: string | null = null
    if (latitude !== null && longitude !== null) {
      locationName = await reverseGeocode(latitude, longitude)
    }

    return { takenAt, latitude, longitude, locationName }
  } catch {
    return { takenAt: null, latitude: null, longitude: null, locationName: null }
  }
}

/** Reverse geocode using OpenStreetMap Nominatim (free, no API key) */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh-TW`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'myCRM/1.0 (contact management app)' },
    })
    if (!res.ok) return null
    const data = await res.json() as { address?: Record<string, string>; display_name?: string }
    const a = data.address
    if (!a) return data.display_name ?? null
    // Build concise location: city/district + country
    const parts = [
      a.city ?? a.town ?? a.village ?? a.county,
      a.state ?? a.province,
      a.country,
    ].filter(Boolean)
    return parts.join('，') || data.display_name || null
  } catch {
    return null
  }
}

