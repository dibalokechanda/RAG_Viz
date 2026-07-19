import { createContext, useContext } from 'react'
import type { PipelineConfig } from './data/types'

interface PipelineContextValue {
  config: PipelineConfig
  /** Swap the selected variant of a `choice` stage from anywhere in the UI. */
  setVariant: (stageId: string, variantId: string) => void
  toggle: (key: keyof PipelineConfig) => void
  select: (stageId: string | null) => void
  /** True while the animated walkthrough is running. */
  playing: boolean
}

export const PipelineContext = createContext<PipelineContextValue | null>(null)

export function usePipeline() {
  const ctx = useContext(PipelineContext)
  if (!ctx) throw new Error('usePipeline must be used inside <PipelineContext.Provider>')
  return ctx
}
