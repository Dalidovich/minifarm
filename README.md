# Mini Farm

A small cozy pixel-art farming game that runs in the browser. Mouse only, no build step, no dependencies.

## Play

Open `index.html` in a desktop browser. That is all.

Progress is saved automatically in the browser's local storage.

## Project layout

```
index.html          page skeleton and script order
css/style.css       interface styling
fonts/              Tiny5 pixel font (SIL OFL, see fonts/OFL.txt)
js/config.js        all balance numbers and world layout
js/i18n.js          tiny localization helper
js/locales/         interface texts (en, ru)
js/sprites.js       pixel art, generated at startup
js/audio.js         synthesized sounds and music
js/game.js          game state, rules, saving
js/render.js        canvas drawing
js/ui.js            sidebar, seed bar, shop, input
js/main.js          startup and main loop
```

## Adding a language

Copy `js/locales/en.js`, translate the values, register it under a new key in `MF.locales` and add a `<script>` tag for it in `index.html`. It will show up in the settings automatically.
