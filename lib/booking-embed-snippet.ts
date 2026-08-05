export type EmbedPlatform = 'html' | 'react' | 'vue' | 'angular' | 'wordpress'

export function buildBookingEmbedSnippet({
  url,
  title,
  height,
  fullPage,
  platform = 'html',
}: {
  url: string
  title: string
  height: number
  fullPage: boolean
  platform?: EmbedPlatform
}) {
  const htmlSnippet = fullPage
    ? `<iframe
  src="${url}"
  title="${title}"
  style="border: 0; position: fixed; inset: 0; width: 100%; height: 100%"
  allow="microphone"
></iframe>`
    : `<iframe
  src="${url}"
  title="${title}"
  width="100%"
  height="${height}"
  style="border: 0"
  allow="microphone"
></iframe>`

  switch (platform) {
    case 'react':
      return `export function BookingEmbed() {
  return (
    <iframe
      src="${url}"
      title="${title}"
      width="100%"
      height="${fullPage ? '100%' : height}"
      style={{ border: 0${fullPage ? ", position: 'fixed', inset: 0" : ''} }}
      allow="microphone"
    />
  )
}`
    case 'vue':
      return `<template>
  <iframe
    src="${url}"
    :title="'${title}'"
    width="100%"
    :height="${fullPage ? "'100%'" : height}"
    style="border: 0${fullPage ? '; position: fixed; inset: 0' : ''}"
    allow="microphone"
  />
</template>`
    case 'angular':
      return `<iframe
  [src]="'${url}'"
  title="${title}"
  width="100%"
  [attr.height]="${fullPage ? "'100%'" : height}"
  style="border: 0${fullPage ? '; position: fixed; inset: 0' : ''}"
  allow="microphone"
></iframe>`
    case 'wordpress':
      return `<!-- Add to a Custom HTML block in WordPress -->
${htmlSnippet}`
    case 'html':
    default:
      return htmlSnippet
  }
}
