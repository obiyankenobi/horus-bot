import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { config } from './config';
import { MyContext } from './context';
import { userService } from './services/user';
import { setupNLP } from './features/nlp';
import { walletService } from './services/wallet';

export const bot = new Bot<MyContext>(config.botToken);

// Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

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

setupNLP(bot);

const sendHelpMessage = async (ctx: MyContext) => {
    if (!ctx.user?.address) return;

    let balanceStr = 'could not fetch, error';
    try {
        const htrInfo = await walletService.getAddressInfo(ctx.user.address, '00');
        if (htrInfo && htrInfo.success) {
            const htrBalance = htrInfo.total_amount_available / 100;
            balanceStr = `HTR: ${htrBalance.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error fetching HTR balance for help message:', error);
    }

    await ctx.reply(
        `👋 **Welcome to Hathor Bot!**\n\n` +
        `🏠 **Your Address**:\n\`${ctx.user.address}\`\n\n` +
        `💰 **Balance**:\n${balanceStr}\n\n` +
        `📖 **Available Commands**:\n` +
        `- "Send 10 HTR to [address]"\n` +
        `- "Check my balance" or just "balance"\n` +
        `- /start or /help - Show this message`,
        { parse_mode: "Markdown" }
    );
};

bot.command(['start', 'help'], sendHelpMessage);
