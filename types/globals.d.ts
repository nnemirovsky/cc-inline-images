// The hooks environment has the ES2025 base64 helpers; TypeScript's es2023 lib does not.
declare global {
  interface Uint8ArrayConstructor {
    fromBase64(text: string): Uint8Array
  }
  interface Uint8Array {
    toBase64(): string
  }
}
export {}
