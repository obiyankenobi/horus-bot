import { Command } from '../types';
import { walletService } from '../../../services/wallet';
import { MyContext } from '../../../context';

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

        // If amount was mentioned (e.g. "Do I have 10 HTR?"), we could check condition, 
        // but for now simple balance report is fine.

        await ctx.reply("Checking balance...");
        const info = await walletService.getAddressInfo(ctx.user.address);

        if (info && info.success) {
            const balance = info.total_amount_available / 100;
            await ctx.reply(`Your balance is: **${balance.toFixed(2)} HTR**`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply("Failed to retrieve balance information.");
        }
    }
};
