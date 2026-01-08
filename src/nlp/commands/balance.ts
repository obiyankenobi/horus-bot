import { Command } from '../types';
import { walletService } from '../../services/wallet';
import { MyContext } from '../../context';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';

export const balanceCommand: Command = {
    intent: 'wallet.balance',

    train(manager: any) {
        manager.addDocument('en', 'what is my balance', 'wallet.balance');
        manager.addDocument('en', 'check balance', 'wallet.balance');
        manager.addDocument('en', 'how much do I have', 'wallet.balance');
        manager.addDocument('en', 'balance', 'wallet.balance');
        manager.addDocument('en', 'my funds', 'wallet.balance');
    },

    async handle(ctx: MyContext, result: any) {
        if (!ctx.user || !ctx.user.address) {
            await ctx.reply("Error: Cannot fetch balance. No user address found.");
            return;
        }

        try {
            // Fetch User's Tokens from DB
            const userWithTokens = await prisma.user.findUnique({
                where: { telegramId: ctx.user.telegramId },
                include: {
                    tokens: {
                        include: {
                            token: true
                        }
                    }
                }
            });

            let balanceReport = `🏠 **Address**: \`${ctx.user.address}\`\n\n`;
            balanceReport += `💰 **Wallet Balance**\n`;

            // HTR
            const htrInfo = await walletService.getAddressInfo(ctx.user.address, '00');
            if (htrInfo && htrInfo.success) {
                const htrBalance = htrInfo.total_amount_available / 100;
                balanceReport += `**HTR**: ${htrBalance.toFixed(2)}\n`;
            } else {
                balanceReport += `**HTR**: Error fetching balance\n`;
            }

            // Check Custom Tokens

            for (const ut of (userWithTokens?.tokens || []) as any[]) {
                const symbol = ut.token?.symbol || 'UNK';
                const name = ut.token?.name || 'Unknown Token';

                const tokenInfo = await walletService.getAddressInfo(ctx.user.address, ut.tokenId);
                if (tokenInfo && tokenInfo.success) {
                    const tokenBalance = tokenInfo.total_amount_available / 100;
                    balanceReport += `**${symbol}** (${name}): ${tokenBalance.toFixed(2)}\n`;
                } else {
                    balanceReport += `**${symbol}**: Error fetching balance\n`;
                }
            }

            await ctx.reply(balanceReport, { parse_mode: "Markdown" });

        } catch (error) {
            logger.error(`Balance Check Error: ${error}`);
            await ctx.reply("An error occurred while fetching your balance.");
        }
    }
};
