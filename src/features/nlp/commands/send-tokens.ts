import { Command } from '../types';
import { walletService } from '../../../services/wallet';
import { MyContext } from '../../../context';
import { config } from '../../../config';

export const sendTokensCommand: Command = {
    intent: 'token.send',

    train(manager: any) {
        // Training data for sending tokens
        manager.addDocument('en', 'send %number% %currency% to %hathor_address%', 'token.send');
        manager.addDocument('en', 'transfer %number% %currency% to %hathor_address%', 'token.send');
        manager.addDocument('en', 'pay %number% %currency% to %hathor_address%', 'token.send');
        manager.addDocument('en', 'send %number% to %hathor_address%', 'token.send'); // Missing currency
        manager.addDocument('en', 'send tokens to %hathor_address%', 'token.send'); // Missing amount
        manager.addDocument('en', 'send %number% %currency%', 'token.send'); // Missing address
    },

    async handle(ctx: MyContext, result: any) {
        // Extract entities
        const entities = result.entities || [];
        console.log('[SendTokens] Extracted Entities:', JSON.stringify(entities, null, 2));

        const numberEntity = entities.find((e: any) => e.entity === 'number');
        const currencyEntity = entities.find((e: any) => e.entity === 'currency');
        const addressEntity = entities.find((e: any) => e.entity === 'hathor_address');

        // Safe resolution access
        const amount = (numberEntity && numberEntity.resolution) ? parseFloat(numberEntity.resolution.value) : null;
        const currency = (currencyEntity && currencyEntity.resolution) ? currencyEntity.resolution.value : (currencyEntity ? currencyEntity.option : null);

        // Address relies on sourceText usually for Regex entities if no resolution provided
        const address = (addressEntity && addressEntity.resolution) ? addressEntity.resolution.value : (addressEntity ? addressEntity.sourceText : null);

        // Validation Response
        if (!amount && !currency && !address) {
            await ctx.reply("I understand you want to send tokens, but I'm missing the details. Try: `send 10 HTR to [address]`", { parse_mode: "Markdown" });
            return;
        }

        if (!amount) {
            await ctx.reply(`Please specify the **amount** you want to send.\nExample: "Send **10** HTR to ${address || '...'}"`, { parse_mode: "Markdown" });
            return;
        }

        if (!currency) {
            await ctx.reply(`Please specify the **token symbol** (e.g. HTR).\nExample: "Send ${amount} **HTR** to ${address || '...'}"`, { parse_mode: "Markdown" });
            return;
        }

        if (!address) {
            await ctx.reply(`You need to specify the **destination address**.\nExample: "Send ${amount} ${currency} to **[address]**"`, { parse_mode: "Markdown" });
            return;
        }

        // All present - Execute
        await ctx.reply(`Processing transfer of **${amount} ${currency}** to \`${address}\`...`, { parse_mode: "Markdown" });

        if (currency.toUpperCase() !== 'HTR' && currency.toUpperCase() !== 'HATHOR') {
            await ctx.reply("Currently I only support sending **HTR**.", { parse_mode: "Markdown" });
            return;
        }

        // Ensure from address is valid (from user)
        if (!ctx.user || !ctx.user.address) {
            await ctx.reply("Error: Could not retrieve your wallet address to verify balance.");
            return;
        }

        const fromAddress = ctx.user.address;
        console.log('[SendTokens] Wallet Request:', { address, amount, fromAddress });
        const txResult = await walletService.sendTransaction(address, amount, fromAddress);
        const explorerUrl = `https://explorer.${config.network}.hathor.network/transaction/${txResult.hash}`;

        if (txResult.success) {
            await ctx.reply(`Transaction successful!\nHash: [${txResult.hash}](${explorerUrl})`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply(`Transaction failed.\nError: ${txResult.error || 'Unknown error'}`);
        }
    }
};
