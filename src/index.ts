import { bot } from './bot';

async function main() {
    console.log('Starting bot...');
    await bot.start({
        onStart: (botInfo) => {
            console.log(`Bot started as @${botInfo.username}`);
        },
    });
}

main().catch((err) => {
    console.error('Error starting bot:', err);
    process.exit(1);
});
