import Groq from 'groq-sdk'
import type { LLMProvider, ExtractedBusinessInfo } from './types'

const EXTRACTION_PROMPT = `You are extracting business information from website text. Given the page content below, respond with ONLY a JSON object matching this exact shape, no other text:
{"businessName": string | null, "hours": string | null, "services": string[], "suggestedIndustry": string | null}

Page content:
`

export function createGroqProvider(): LLMProvider {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY! })

  return {
    async extractBusinessInfo(pageText: string): Promise<ExtractedBusinessInfo> {
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: EXTRACTION_PROMPT + pageText.slice(0, 12000) }],
        temperature: 0.2,
      })

      const content = response.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(content)

      return {
        businessName: parsed.businessName ?? null,
        hours: parsed.hours ?? null,
        services: Array.isArray(parsed.services) ? parsed.services : [],
        suggestedIndustry: parsed.suggestedIndustry ?? null,
      }
    },
  }
}
