export class GifReader {
  constructor(data: Uint8Array)
  width: number
  height: number
  decodeAndBlitFrameRGBA(frame: number, pixels: Uint8Array): void
}
