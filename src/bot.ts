import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { config } from './config';
import { MyContext } from './context';
import { userService } from './services/user';
import { sendTokensFeature } from './features/send-tokens';

export const bot = new Bot<MyContext>(config.botToken);

// Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Load features
// Global user check & Logging
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const telegramId = BigInt(ctx.from.id);

        // Log operation
        const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0];
        console.log(`[Bot] Operation from ${telegramId}: ${updateType}`);

        try {
            let user = await userService.getUser(telegramId);
            if (!user) {
                user = await userService.getOrCreateUser(telegramId);
            }
            ctx.user = user;
        } catch (error) {
            console.error('Failed to get/create user:', error);
            await ctx.reply("System error: Could not assign wallet address. Please try again later.");
            return;
        }
    }
    await next();
});

// Load features
bot.use(sendTokensFeature);

// Import walletService
import { walletService } from './services/wallet';

bot.command('start', async (ctx) => {
    if (!ctx.user?.address) return;

    let balanceText = "Loading...";
    try {
        const info = await walletService.getAddressInfo(ctx.user.address);
        if (info && info.success) {
            const balance = info.total_amount_available / 100;
            balanceText = `${balance.toFixed(2)} HTR`;
        } else {
            balanceText = "Unavailable";
        }
    } catch (e) {
        balanceText = "Error";
    }

    // Show address and buttons
    await ctx.reply(`Welcome! Your Hathor address is:\n\`${ctx.user.address}\`\n\nBalance: **${balanceText}**\n\nSend funds to this address to use the bot.`, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Send tokens", callback_data: "send_tokens" }]
            ]
        }
    });
});
