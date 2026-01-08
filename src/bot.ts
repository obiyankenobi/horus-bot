import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { config } from './config';
import { MyContext } from './context';
import { userService } from './services/user';
import { setupNLP } from './nlp';
import { walletService } from './services/wallet';

export const bot = new Bot<MyContext>(config.botToken);

// Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Global user check & Logging
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const telegramId = BigInt(ctx.from.id);
        const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';

        const updateType = Object.keys(ctx.update).filter(k => k !== 'update_id')[0];
        console.log(`[Bot] Operation from ${telegramId} (Group: ${isGroup}): ${updateType}`);

        // In groups, only respond if mentioned
        if (isGroup && updateType === 'message' && ctx.message && ctx.me) {
            const text = ctx.message.text || '';
            const entities = ctx.message.entities || [];

            const mentioned = entities.some((e) => {
                if (e.type !== "mention") return false;
                const mention = text.slice(e.offset, e.offset + e.length);
                return mention === `@${ctx.me.username}`;
            });

            if (!mentioned) return;
        }

        // Override reply to tag user in groups
        if (isGroup && ctx.from.username) {
            const originalReply = ctx.reply.bind(ctx);
            ctx.reply = async (text: string, other?: any) => {
                // Mention format: [Name](tg://user?id=123456)
                // Use first_name if available, otherwise "User" (or just ID, provided first_name is usually there)
                const name = ctx.from?.username || 'User';
                const mention = `[${name}](tg://user?id=${ctx.from?.id})`;

                // Prepend mention
                const newText = `${mention}\n\n${text}`;

                // Ensure markdown parse mode if not properly set, or assume existing config handles it.
                // We must force markdown to make the link work.
                const options = other || {};
                options.parse_mode = 'Markdown';

                return originalReply(newText, options);
            };
        }

        try {
            // Check if user exists
            let user = await userService.getUser(telegramId);

            if (!user) {
                if (isGroup) {
                    // In groups, we don't create users automatically.
                    if (updateType === 'message') { // Only reply to messages to avoid spam on other updates
                        await ctx.reply("You do not have an account. Please DM me to start interacting.");
                        return;
                    }
                } else {
                    // DM: Create user
                    ({ user } = await userService.getOrCreateUser(telegramId, ctx.from.username));
                }
            }

            if (user) {
                ctx.user = user;
            }

        } catch (error) {
            console.error('Failed to get/create user:', error);
            if (!isGroup) {
                await ctx.reply("System error: Could not assign wallet address. Please try again later.");
            }
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
        `👋 **Welcome to Horus Bot!**\n\n` +
        `🏠 **Your Address**:\n\`${ctx.user.address}\`\n\n` +
        `💰 **Balance**:\n${balanceStr}\n\n` +
        `📖 **Available Commands**:\n` +
        `- "Send 10 HTR to [address]"\n` +
        `- "Send 10 HTR to @user" (if in a group)\n` +
        `- "Check my balance" or just "balance"\n` +
        `- "Play hathor dice 10 HTR 1.5x" or just "dice 10 HTR 70%"\n` +
        `- /start, /help or /dice - Show help and info`,
        { parse_mode: "Markdown" }
    );
};

bot.command(['start', 'help'], sendHelpMessage);

const sendDiceHelpMessage = async (ctx: MyContext) => {
    await ctx.reply(
        `🎲 **Hathor Dice**\n\n` +
        `You can only play using **HTR**.\n\n` +
        `To play, you need to specify either the **multiplier** or the **win chance**:\n\n` +
        `1️⃣ **Multiplier**: \`play dice 10 HTR 1.5x\`\n` +
        `*Means you bet 10 HTR to potentially gain 1.5x (15 HTR).*\n\n` +
        `2️⃣ **Win Chance**: \`play dice 10 HTR 50%\`\n` +
        `*Means you have a 50% chance of winning with a 10 HTR bet.*`,
        { parse_mode: "Markdown" }
    );
};

bot.command('dice', sendDiceHelpMessage);
