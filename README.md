# Gemini Meta Glass 👓

A voice-first, multimodal Gemini AI wrapper optimized for Meta Display Glasses and AR headsets.

## Features
- 🎙️ **Voice-First Interface**: Hands-free interaction with built-in Speech-to-Text and Text-to-Speech.
- 📸 **Look and Tell**: Use the glasses' camera to capture photos and ask Gemini questions about your surroundings.
- 🌑 **AR-Optimized UI**: High-contrast, minimalist dark mode designed for in-lens displays.
- 🤖 **Powered by Gemini 1.5 Flash**: Fast, efficient, and multimodal AI.
- 🔒 **Privacy Focused**: Your API key is stored locally in your browser's `localStorage`.

## Getting Started

### Prerequisites
- A Google Gemini API Key (get one at [aistudio.google.com](https://aistudio.google.com/))
- A browser that supports the Web Speech API (Chrome, Edge, or the Meta Quest/Horizon Browser)

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Open the app on your glasses/browser and enter your API key in the settings.

### Meta Glasses Deployment
For the best experience on Meta Ray-Ban glasses:
1. Enable **Developer Mode** in the Meta AI app.
2. Host this app via HTTPS (e.g., using Vercel or GitHub Pages).
3. Access the URL through the glasses' companion app or the "Web Apps Starter Kit" environment.

## Built With
- React + Vite
- Tailwind CSS
- Framer Motion (for smooth AR transitions)
- Google Generative AI SDK
- Web Speech API
