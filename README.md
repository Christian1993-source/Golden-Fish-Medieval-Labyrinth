# Mr. Mercado Game Simulator - Medieval Golden Fish Labyrinth

A top-down medieval labyrinth game for GitHub Pages, now re-themed as a **Golden Fish** adventure inside a flooded fortress.

## Project Files

- `index.html`
- `style.css`
- `script.js`
- `levels.js`
- `README.md`

## Features

- Vanilla HTML, CSS, and JavaScript.
- 9 handcrafted-quality generated mazes by difficulty:
  - Easy: 3 levels (`400x400`)
  - Medium: 3 levels (`600x600`)
  - Hard: 3 levels (`900x900`)
- Anti-trivial maze validation:
  - rejects simple “only right then down” style routes
  - enforces minimum path length and minimum turns per difficulty
- Medieval citadel presentation with flooded maze visuals.
- Golden Fish player character (with medieval crown details).
- Multi-material wall palettes (not a single wall color).
- Exit gate on the right edge.
- Fireworks celebration when a stage is cleared.
- Sound system (user-toggle):
  - ambient music loop
  - swim movement SFX
  - wall contact SFX
  - portal / clear SFX
  - fireworks SFX
- `Sound: On/Off` button included in the UI.
- Level selection is instant: choosing an option in `Choose Level` loads that maze immediately.

## Controls

- Move: Arrow keys (`↑ ↓ ← →`)
- Goal: Escape through the glowing gate on the right side.
- Wall behavior: no full reset; movement blocks/slides naturally.

## Local Run

1. Open `index.html` in a browser.
2. Click the `Sound: Off` button to enable audio (`Sound: On`).

## GitHub Pages Deployment

1. Push these files to repository root.
2. In GitHub: `Settings -> Pages`.
3. Under `Build and deployment`, select:
   - `Source: Deploy from a branch`
   - your branch (`main` or equivalent) and `/root`
4. Save and wait for the site URL.

`index.html` is the entry point.
