import { bot } from './bot';
import { websocketService } from './services/websocket';
import { startDiceMonitor } from './services/dice-monitor';
import { logger } from './utils/logger';

async function main() {
    // Start WebSocket listener for wallet events
    websocketService.start();

    // Start pending bets monitor
    startDiceMonitor(bot);

    logger.info('Bot is running...');
    await bot.start();
}

main().catch((err) => {
    logger.error(`Error starting bot: ${err}`);
    process.exit(1);
});
