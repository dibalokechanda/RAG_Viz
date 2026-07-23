/*
 * Shared shape for every walkthrough track: GraphRAG and the three variants.
 *
 * A panel entry is either a plain paragraph (framing, caveats, cost notes) or
 * a numbered step. Keeping both in one ordered list lets a stage open with
 * context, walk the steps, and close with the consequence.
 */

export interface Step {
  step: number
  title: string
  body: string
}

export type Note = string | Step

export const isStep = (n: Note): n is Step => typeof n !== 'string'

export interface Card {
  label: string
  /** right-aligned note in the card header, saying what this text actually is */
  hint: string
  body: string
}

export interface Stage {
  key: string
  group: 'index' | 'search'
  chip: string
  title: string
  caption: string
  panel: Note[]
  cards?: Card[]
}

export interface Track {
  /** shown on the topbar tab */
  label: string
  /** one line under the tab list explaining what this method optimises for */
  tagline: string
  stages: Stage[]
  /** where the method was published, shown in the panel footer */
  source: { name: string; url: string }
}
