import dotenv from 'dotenv';
dotenv.config();

export const config = {
    botToken: process.env.BOT_TOKEN!,
    walletUrl: process.env.WALLET_URL!,
    walletId: process.env.WALLET_ID!,
    network: process.env.ENV_NETWORK || 'testnet',
};

if (!config.botToken) {
    throw new Error('Missing BOT_TOKEN in .env');
}
if (!config.walletUrl) {
    throw new Error('Missing WALLET_URL in .env');
}
if (!config.walletId) {
    throw new Error('Missing WALLET_ID in .env');
}
