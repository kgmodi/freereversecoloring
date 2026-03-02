import OpenAI from 'openai'
import * as dotenv from 'dotenv'
import fs from 'fs'
import axios from 'axios'

dotenv.config()

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- Theme Planning ---

async function get_themes() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `Generate a JSON response for the following. Task: I am planning 12 weeks of my weekly reverse coloring newsletter. Each week, we'll send unique reverse coloring designs directly to subscribers' inboxes. Simply print the designs instantly and start outlining to transform pre-colored canvases into your own masterpieces. Return a JSON object with a "newsletterPlan" key containing "weeklyThemes" array, where each item has "week" (number), "theme" (string), and "description" (string).`
    }]
  })

  const content = response.choices[0].message.content
  fs.writeFileSync('./data/themes.json', content)
  console.log('Themes written to file successfully!')
}

// --- Painting Description Generation ---

async function generate_painting_descriptions_for_week(week) {
  const data = JSON.parse(fs.readFileSync('./data/themes.json', 'utf8'))
  const theme_data = data.newsletterPlan.weeklyThemes[week - 1]
  console.log(theme_data)

  const dir = `./data/week-${theme_data.week}`
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  for (let i = 0; i < 3; i++) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Conceptualize an abstract watercolor painting with no outlines for the "${theme_data.theme}" theme. Description: ${theme_data.description}. This will be used as a reverse coloring page. Return a JSON object with: "title" (string), "concept" (string), "colorPalette" (object with "primary" and "secondary" arrays of hex colors), "techniques" (array of watercolor techniques), "subjectMatter" (string), "intendedImpact" (string), "difficulty" (one of "easy", "medium", "advanced"), "drawingPrompts" (array of 3 suggestions for what users could draw on top).`
      }]
    })

    const json_data = JSON.parse(response.choices[0].message.content)
    json_data.week = theme_data.week
    const painting_name = json_data.title
    console.log(`Generated: ${painting_name}`)

    fs.writeFileSync(`${dir}/${painting_name}.json`, JSON.stringify(json_data, null, 2))
    console.log(`Description written: ${dir}/${painting_name}.json`)
  }
}

// --- Image Generation (using GPT-4o native image generation) ---

async function generate_painting_images_for_week(week) {
  const dir = `./data/week-${week}`
  const files = fs.readdirSync(dir)

  const images_dir = `./images/week-${week}`
  if (!fs.existsSync(images_dir)) fs.mkdirSync(images_dir, { recursive: true })

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'))
    const painting_name = data.title

    console.log(`Generating image for: ${painting_name}`)

    const prompt = `Generate an abstract watercolor painting with no outlines, no text, no letters, no words. This will be used as a reverse coloring page so keep the shades light and airy. Theme: ${data.concept || data.subjectMatter}. Color palette: ${JSON.stringify(data.colorPalette)}. Style: soft watercolor washes. The image must be suitable for printing at 8.5x11 inches.`

    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'high',
    })

    // gpt-image-1 returns base64 data
    const image_data = response.data[0].b64_json
    const image_path = `${images_dir}/${painting_name}.png`

    if (image_data) {
      fs.writeFileSync(image_path, Buffer.from(image_data, 'base64'))
      console.log(`Image saved: ${image_path}`)
    } else if (response.data[0].url) {
      // Fallback for URL-based response
      const img_response = await axios({ url: response.data[0].url, method: 'GET', responseType: 'arraybuffer' })
      fs.writeFileSync(image_path, Buffer.from(img_response.data))
      console.log(`Image saved (from URL): ${image_path}`)
    }
  }
}

// --- Run ---
// Uncomment the function you want to run:
// await get_themes()
// await generate_painting_descriptions_for_week(1)
// await generate_painting_images_for_week(1)
