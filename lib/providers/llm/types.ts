export type ExtractedBusinessInfo = {
  businessName: string | null
  hours: string | null
  services: string[]
  suggestedIndustry: string | null
}

export interface LLMProvider {
  extractBusinessInfo(pageText: string): Promise<ExtractedBusinessInfo>
}
