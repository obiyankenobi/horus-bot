module.exports = {
    apps: [{
        name: 'hathor-bot',
        script: './dist/index.js',
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'development',
            ENV_NETWORK: 'testnet',
        },
        env_production: {
            NODE_ENV: 'production',
            ENV_NETWORK: 'mainnet',
            FULLNODE_URL: 'http://localhost:8080',
            DATABASE_URL: 'file:./mainnet.db',
            DICE_MAX_MULTIPLIER: '100',
            DICE_RANDOM_BIT_LENGTH: '16',
            DICE_HOUSE_EDGE: '190',
            DICE_NC_ID: '000003e0baf17eee5a25aa0ccf36eb331a05818c87bc1c316f54485aa974c485',
            DICE_MAX_BET: '10000',
        }
    }]
};
