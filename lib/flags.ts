// Round country flags from the circle-flags project, served from its public host.
export function flagUrl(countryCode: string): string {
  return `https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`
}
