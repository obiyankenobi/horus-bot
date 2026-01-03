import dotenv from 'dotenv';
dotenv.config();

export const config = {
    botToken: process.env.BOT_TOKEN!,
    walletUrl: process.env.WALLET_URL!,
    walletId: process.env.WALLET_ID!,
    network: process.env.ENV_NETWORK || 'testnet',
    wsHost: process.env.WS_HOST || 'localhost',
    wsPort: parseInt(process.env.WS_PORT || '8008'),
    fullnodeUrl: process.env.FULLNODE_URL || 'https://node1.testnet.hathor.network',
    diceMaxMultiplier: parseFloat(process.env.DICE_MAX_MULTIPLIER || '100'),
    diceRandomBitLength: parseInt(process.env.DICE_RANDOM_BIT_LENGTH || '16'),
    diceHouseEdge: parseInt(process.env.DICE_HOUSE_EDGE || '190'),
    diceNcId: process.env.DICE_NC_ID || '00000000361ec0406d90a5bb4c6c7330af5792178b86cfc353afd4e50a62b741',
    diceMaxBet: parseInt(process.env.DICE_MAX_BET || '10000'),
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
