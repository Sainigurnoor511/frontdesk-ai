/**
 * Local BGE embeddings via FastEmbed (ONNX, no API key).
 * Uses passage vs query modes for better retrieval with BGE models.
 */

import type { EmbeddingModel, FlagEmbedding } from 'fastembed'

export const EMBEDDING_DIMENSIONS = 384

const MODEL_DIMENSIONS: Record<string, number> = {
  'bge-small-en-v1.5': 384,
  'bge-small-en': 384,
  'bge-base-en-v1.5': 768,
  'bge-base-en': 768,
  'all-minilm-l6-v2': 384,
  'multilingual-e5-large': 1024,
  'bge-small-zh-v1.5': 512,
}

let modelPromise: Promise<FlagEmbedding> | null = null

function getConfiguredModelKey(): string {
  return (process.env.FASTEMBED_MODEL ?? 'bge-small-en-v1.5').trim().toLowerCase()
}

export function getEmbeddingDimensions(): number {
  const key = getConfiguredModelKey().replace(/_/g, '-')
  return MODEL_DIMENSIONS[key] ?? EMBEDDING_DIMENSIONS
}

export function isEmbeddingConfigured(): boolean {
  return process.env.FASTEMBED_DISABLED !== '1'
}

function resolveModel(EmbeddingModelEnum: typeof EmbeddingModel): EmbeddingModel {
  const key = getConfiguredModelKey().replace(/_/g, '-')
  switch (key) {
    case 'bge-small-en-v1.5':
      return EmbeddingModelEnum.BGESmallENV15
    case 'bge-small-en':
      return EmbeddingModelEnum.BGESmallEN
    case 'bge-base-en-v1.5':
      return EmbeddingModelEnum.BGEBaseENV15
    case 'bge-base-en':
      return EmbeddingModelEnum.BGEBaseEN
    case 'all-minilm-l6-v2':
      return EmbeddingModelEnum.AllMiniLML6V2
    case 'multilingual-e5-large':
      return EmbeddingModelEnum.MLE5Large
    case 'bge-small-zh-v1.5':
      return EmbeddingModelEnum.BGESmallZH
    default:
      return EmbeddingModelEnum.BGESmallENV15
  }
}

async function getEmbeddingModel(): Promise<FlagEmbedding> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { FlagEmbedding, EmbeddingModel: EmbeddingModelEnum } = await import('fastembed')
      const model = resolveModel(EmbeddingModelEnum)
      return FlagEmbedding.init({
        model: model as Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>,
      })
    })()
  }
  return modelPromise
}

function toNumberArray(vector: ArrayLike<number>): number[] {
  return Array.from(vector)
}

/**
 * Embed document/passage chunks for storage (indexing).
 */
export async function embedPassageTexts(texts: string[]): Promise<number[][] | null> {
  if (!isEmbeddingConfigured() || texts.length === 0) return null

  const model = await getEmbeddingModel()
  const results: number[][] = []

  for await (const batch of model.passageEmbed(texts, 32)) {
    for (const vector of batch) {
      results.push(toNumberArray(vector))
    }
  }

  return results
}

/**
 * Embed a single search query (call-time retrieval).
 */
export async function embedQueryText(text: string): Promise<number[] | null> {
  if (!isEmbeddingConfigured() || !text.trim()) return null

  const model = await getEmbeddingModel()
  const vector = await model.queryEmbed(text)
  return toNumberArray(vector)
}
