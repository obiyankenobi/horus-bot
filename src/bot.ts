import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { config } from './config';
import { MyContext } from './context';
import { userService } from './services/user';
import { setupNLP } from './features/nlp';

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

bot.command('start', async (ctx) => {
    if (!ctx.user?.address) return;

    await ctx.reply(`Welcome! Your Hathor address is:\n\`${ctx.user.address}\`\n\nTo interact, simply type commands like:\n- "Send 10 HTR to [address]"\n- "Check my balance"`, {
        parse_mode: "Markdown",
    });
});
