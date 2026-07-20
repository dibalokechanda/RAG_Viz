import type { Concept, Stage } from './types'
import { offlineStages } from './stages.offline'
import { onlineStages } from './stages.online'
import { platformStages } from './stages.platform'

export { offlineStages, onlineStages, platformStages }

export const allStages: Stage[] = [...platformStages, ...offlineStages, ...onlineStages]

export const stageById = new Map(allStages.map((s) => [s.id, s]))

/** Flattened concept lookup, so the mind-map can address any node by id. */
export const conceptById = new Map<string, Concept>()
function indexConcepts(concepts: Concept[] | undefined) {
  concepts?.forEach((c) => {
    conceptById.set(c.id, c)
    indexConcepts(c.children)
  })
}
allStages.forEach((s) => indexConcepts(s.concepts))
