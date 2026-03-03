import rawDesigns from './designs.json'

export type Design = {
  designId: string
  weekId: string
  title: string
  description: string
  theme: string
  slug: string
  imagePath: string
  status: string
  difficulty: string
  drawingPrompts: string[]
  colorPalette: string[]
  tags: string[]
  isPremium: boolean
  width: number
  height: number
  createdAt: string
}

const designs: Design[] = rawDesigns as Design[]
export default designs
