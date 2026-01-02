import { bot } from './bot';

import { websocketService } from './services/websocket';

async function main() {
    // Start WebSocket listener for wallet events
    websocketService.start();

    console.log('Bot is running...');
    await bot.start();
}

main().catch((err) => {
    console.error('Error starting bot:', err);
    process.exit(1);
});
