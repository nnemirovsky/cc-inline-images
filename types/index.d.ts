/** Keys `<row>|<path>` of the image paths clicked open. */
export type InlineImagesOpen = string[]

declare module 'claude-code' {
  interface PluginState {
    'inline-images': { open: InlineImagesOpen; pane: string | null }
  }
}
