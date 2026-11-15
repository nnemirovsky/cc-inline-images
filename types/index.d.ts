/** Keys `<row>|<path>` of the image paths clicked open, `<call>|read` of the read images. */
export type InlineImagesOpen = string[]

declare module 'claude-code' {
  interface PluginState {
    'inline-images': { open: InlineImagesOpen; pane: string | null }
  }
}
