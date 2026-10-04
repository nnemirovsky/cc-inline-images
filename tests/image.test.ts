import { expect, test } from 'claude-code/testing'

import { cells, imagePaths, picture } from '../hooks/image'

// 4x2 images: red PNG, blue JPEG, green GIF.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACAQMAAABFZu8gAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC'
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAQDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAGCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AD3VTB3/2Q=='
const GIF = 'R0lGODlhBAACAPAAAACAAAAAACH5BAAAAAAALAAAAAAEAAIAAAIDhG8FADs='

test('a PNG passes through with its size', async () => {
  const pic = picture(Uint8Array.fromBase64(PNG), 'image/png')
  expect(pic).toEqual({ kind: 'png', base64: PNG, width: 4, height: 2 })
})

test('a JPEG and a GIF decode to RGBA pixels', async () => {
  const jpeg = picture(Uint8Array.fromBase64(JPEG), 'image/jpeg')
  expect(jpeg.kind).toBe('rgba')
  if (jpeg.kind === 'rgba') {
    expect([jpeg.width, jpeg.height]).toEqual([4, 2])
    const px = Uint8Array.fromBase64(jpeg.base64)
    expect(px.length).toBe(4 * 2 * 4)
    expect(px[2]! > 200 && px[0]! < 60).toBe(true) // blue
  }
  const gif = picture(Uint8Array.fromBase64(GIF), 'image/gif')
  expect(gif.kind).toBe('rgba')
  if (gif.kind === 'rgba') expect(Uint8Array.fromBase64(gif.base64)[1]! > 100).toBe(true) // green
})

test('WebP and broken bytes say why they are not drawn', async () => {
  expect(picture(new Uint8Array([1, 2, 3]), 'image/webp')).toEqual({ kind: 'error', reason: 'WEBP is not drawn' })
  expect(picture(new Uint8Array([1, 2, 3]), 'image/jpeg')).toEqual({ kind: 'error', reason: 'could not decode' })
})

test('cells keep the aspect ratio inside the limits', async () => {
  expect(cells(2000, 235, 100, 24)).toEqual({ columns: 100, rows: 6 })
  expect(cells(800, 1600, 100, 24)).toEqual({ columns: 24, rows: 24 })
  expect(cells(64, 32, 100, 24)).toEqual({ columns: 8, rows: 2 })
})

test('image paths are found in free text', async () => {
  expect(imagePaths('saved to /tmp/vv/a.png and ~/x/b.JPG, see assets/c.gif; not d.png or https://e.com/f.txt')).toEqual([
    '/tmp/vv/a.png',
    '~/x/b.JPG',
    'assets/c.gif',
  ])
})
