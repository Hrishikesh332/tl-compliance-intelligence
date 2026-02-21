# Video Compliance (Frontend)

The app lives in the **frontend** folder.

## Structure

```
frontend/
├── package.json
├── index.html
├── vite.config.ts
├── tailwind.config.js    # Uses Strand preset from ./strand/
├── tsconfig.json
├── src/                   # App source
│   ├── index.css          # Imports strand CSS
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   └── pages/
└── strand/                # Design system (tokens, CSS, preset)
    ├── tailwind-preset.js
    ├── tokens/
    ├── css/               # variables.css, fonts.css
    ├── components/        # Docs (see strand/components/README.md)
    ├── assets/            # Logos
    └── icons/
```

## Run the app

```bash
cd frontend && npm install && npm run dev
```

## Build

```bash
cd frontend && npm run build
```

## Token reference

See **`strand/components/README.md`** for colors, buttons, icons, and typography. Use Tailwind classes from the strand preset (e.g. `bg-surface`, `text-text-primary`, `border-border`) and CSS variables (e.g. `var(--strand-ui-accent)`) when needed.
