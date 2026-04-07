# 🏛️ The Academy — Art History University

The world's greatest art history university, featuring 50 legendary scholars and 8 business-of-art experts as faculty. Complete undergraduate (4-year) and graduate (2-year MA) curriculum.

## Features

- **📖 Full Curriculum** — 40+ courses across 6 years, each with detailed lecture schedules, reading lists, and learning objectives
- **🎓 Granular Lectures** — Complete lecture content with visual analysis, discussion questions, key concepts, and further reading
- **👨‍🏫 58 Faculty Members** — The 50 most influential art historians of all time + 8 business-of-art legends
- **📝 Assessments** — Quizzes, midterms, and finals with instant grading and detailed explanations; essay prompts with guidelines
- **🖼️ AI Museum Search** — Search any city worldwide for museum recommendations with must-see works, provenance, values, and significance
- **💬 AI Office Hours** — Ask any art history question and receive expert scholarly responses
- **🃏 Flashcards** — Visual identification and concept review cards
- **📅 Interactive Timeline** — 65+ key moments from 36,000 BC to present, filterable by category
- **📕 Glossary** — 75+ essential art history terms with definitions and pronunciation guides
- **📊 Progress Tracking** — Track completed lectures, quiz scores, and study metrics (persisted in localStorage)

## Career Pathways

Graduates are prepared for three career tracks:
1. **Museum Curator** — Lead exhibitions at the Met, Louvre, Tate, or MoMA
2. **Auction Specialist** — Work at Sotheby's, Christie's, or Phillips
3. **University Professor** — Teach art history at leading institutions

## Tech Stack

- **React 18** with Vite
- **Claude API** (Anthropic) for museum search and office hours
- **localStorage** for offline progress tracking
- No external UI framework — custom design system

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── App.jsx                 # Main application component
├── main.jsx                # Entry point
├── data/
│   ├── faculty.js          # 50 art historians + 8 business faculty
│   ├── curriculum.js       # Full undergrad + grad course catalogue
│   ├── lectures.js         # Granular lecture content
│   ├── glossary.js         # 75+ terms with pronunciations
│   ├── timeline.js         # Timeline events + flashcard data
│   └── assessments.js      # Quizzes, tests, essay prompts
├── utils/
│   └── storage.js          # localStorage progress tracking
└── styles/
    └── global.css          # Design system and global styles
```

## AI Features

The museum search and office hours features use the Claude API. These require an active internet connection. All other features work offline.

## Design

The Academy uses a luxury editorial aesthetic inspired by museum catalogues:
- **Typography**: Cormorant Garamond (display), Crimson Pro (body), DM Mono (labels)
- **Color**: Deep blacks and warm golds (#d4a853) on a dark ground (#0a0806)
- **Tone**: Scholarly, warm, and intellectually rigorous

## License

Educational use. All art historical content is original scholarly synthesis.
