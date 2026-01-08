# Horus Bot

A Telegram bot for the Hathor Network that enables users to manage their wallets, transfer tokens, and play a provably fair Dice game powered by Hathor Nano Contracts.

## Features

- **Wallet Management**: Automatically assigns a unique Hathor address to every user.
- **Token Transfers**: Send HTR and custom tokens directly from the chat.
- **Hathor Dice**: Play a dice game with custom multipliers and win chances.
    - **Nano Contract Powered**: Bets are executed on-chain via Nano Contracts.
    - **Provably Fair**: Uses HTR for betting and verifiable on-chain outcomes.
    - **Live Monitoring**: Tracks pending bets and automatically pays out winnings.
- **Group Chat Support**: 
    - Works seamlessly in group chats.
    - Responds only when mentioned (`@botname`).
    - Smart tagging for user interactions.

## Prerequisites

- **Node.js** (v18 or higher)
- **Hathor Wallet Headless**: You must have a running instance of the Hathor Wallet Headless to process transactions.
- **Database**: SQLite (default) or any database supported by Prisma.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory (see [Configuration](#configuration)).

4. **Initialize Database**:
   ```bash
   npx prisma db push
   ```

   > Make sure Token table has correct columns with `COLLATE NOCASE`.

## Configuration

### Environment Variables (`.env`)

Create a `.env` file with the following keys:

```env
# Telegram
BOT_TOKEN=your_telegram_bot_token
```

Other envs are defined in `src/config.ts`.

Production configuration is handled via `ecosystem.config.js`.

### Wallet headless

The wallet should have the websocket plugin enabled. On its config:
```
enabled_plugins: ['ws'],
```

And run it with:
```
npm start -- --plugin_ws_port 8008
```

### PM2 Configuration (`ecosystem.config.js`)

For production, you can configure process-level variables in `ecosystem.config.js`:
- `NODE_ENV`: 'production'
- `ENV_NETWORK`: 'mainnet' (if deploying to mainnet)
- `DATABASE_URL`: override for production DB

## Running the Bot

### Development
Run with hot-reloading:
```bash
npm run dev
```

### Production (Manual)
Build and start:
```bash
npm run build
npm run start:prod
```

### Production (PM2)
We recommend using PM2 for production deployment.

1. **Build**:
   ```bash
   npm run build
   ```
2. **Start**:
   ```bash
   pm2 start ecosystem.config.js
   ```
3. **Monitor**:
   ```bash
   pm2 logs
   ```


## Database Management

This project uses [Prisma](https://www.prisma.io/) as the ORM.

### Applying Schema Changes
When you make changes to `prisma/schema.prisma`, you need to apply them to the database and generate the client:

```bash
# During development (creates a migration file and applies it)
npx prisma migrate dev --name describe_your_change
```

### Applying Migrations to Production
In production, you should **never** use `migrate dev`. Instead, use `migrate deploy` to apply pending migrations:

```bash
npx prisma migrate deploy
```

### Browsing Data
You can use Prisma Studio to view and edit data in the database:

```bash
npx prisma studio
```

## Commands

The bot supports natural language commands:

- **/start** or **/help**: Register account and show help.
- **Balance**: "Check my balance", "balance"
- **Send Tokens**: "Send 10 HTR to [address]"
- **Play Dice**: 
    - "Play hathor dice 10 HTR 2x" (Bet 10 HTR with 2x multiplier)
    - "Dice 50 HTR 40%" (Bet 50 HTR with 40% win chance)

## Project Structure

- `src/bot.ts`: Main entry point and middleware.
- `src/features/nlp`: Natural Language Processing logic and commands.
- `src/services`: 
    - `wallet.ts`: Interaction with Hathor Headless Wallet.
    - `dice-monitor.ts`: Background service for monitoring bets.
- `prisma/`: Database schema.
