export type CoverTabKey = 'gen' | 'text'

export interface CoverChoiceOption {
  label: string
  value: string
  color?: string
}

export interface CoverFontOption extends CoverChoiceOption {
  family: string
}

export interface CoverGenerationForm {
  prompt: string
  style: string
  tone: string
}

export interface CoverLayoutState {
  titleEnabled: boolean
  authorEnabled: boolean
  title: string
  author: string
  font: string
  fontSize: number
  textColor: string
  titleBox: {
    width: number
    height: number
  }
  effects: {
    shadow: boolean
    stroke: boolean
    vertical: boolean
  }
  positions: {
    title: { x: number; y: number }
    author: { x: number; y: number }
  }
}

export interface CoverBookOption {
  id: number
  title?: string
}
