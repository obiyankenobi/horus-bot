import { bot } from './bot';
import { websocketService } from './services/websocket';
import { startDiceMonitor } from './services/dice-monitor';

async function main() {
    // Start WebSocket listener for wallet events
    websocketService.start();

    // Start pending bets monitor
    startDiceMonitor(bot);

    console.log('Bot is running...');
    await bot.start();
}

main().catch((err) => {
    console.error('Error starting bot:', err);
    process.exit(1);
});
