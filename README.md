# AtsumeAt (あつめあっと)

![ogp](https://atsumeat.suibari.com/ogp.png)

Bluesky Digital Sticker Exchange App

## Overview

AtsumeAt is a web application that allows Bluesky users to create, exchange, and collect original digital stickers. It leverages the AT Protocol to authenticate users and manage sticker ownership/signatures.

## Tech Stack

- **Framework**: SvelteKit
- **Styling**: TailwindCSS
- **Protocol**: AtProto (Bluesky)
- **Deployment**: Cloudflare Pages
- **Graphics**: Fabric.js / Three.js (as needed)

## Environment Setup

To run this project locally, you need to set up the environment variables.

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Generate an Issuer Keypair:
   The app requires a private key to sign the "seals" (stickers). You can generate a new one using the provided script:
   ```bash
   node scripts/generate-key.js
   ```

3. Update `.env`:
   Paste the generated `ISSUER_PRIVATE_KEY_HEX` into your `.env` file.

## Development

Once you have set up the environment variables:

```bash
# Install dependencies
npm install

# Start local server
npm run dev

# Start server and open in browser
npm run dev -- --open
```

## Build

To create a production build:

```bash
npm run build
```

## License

[MIT License](./LICENSE)
