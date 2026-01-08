import { Command } from '../types';
import { walletService } from '../../../services/wallet';
import { MyContext } from '../../../context';
import { config } from '../../../config';
import { prisma } from '../../../db';
import { userService } from '../../../services/user';
import { resolveTargetFromMentions } from '../mentions';
import { hasMoreThanTwoDecimals } from '../../../utils/validation';

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
        const numberEntity = entities.find((e: any) => e.entity === 'number');
        const currencyEntity = entities.find((e: any) => e.entity === 'currency');
        const addressEntity = entities.find((e: any) => e.entity === 'hathor_address');

        let targetAddress: string | null = null;
        let targetUserId: bigint | null = null;
        let targetUsername: string | null = null;

        // 1. Robust Amount Extraction
        let amount: number | null = null;
        if (numberEntity) {
            // Priority 1: resolution.value (often handles "0.43" fine)
            if (numberEntity.resolution?.value !== undefined) {
                amount = parseFloat(numberEntity.resolution.value);
            }

            // Priority 2: Fallback to sourceText if resolution is missing or fails (e.g. "0.43")
            if (amount === null || isNaN(amount)) {
                const raw = numberEntity.sourceText.replace(',', '.');
                const parsed = parseFloat(raw);
                if (!isNaN(parsed)) amount = parsed;
            }
        }

        if (!amount) {
            await ctx.reply(`Please specify the **amount** you want to send.\nExample: "Send **10** HTR to ..."`, { parse_mode: "Markdown" });
            return;
        }

        if (hasMoreThanTwoDecimals(amount)) {
            await ctx.reply("Only up to 2 decimal places are supported for token amounts.");
            return;
        }

        // 2. Strict Currency Extraction (User Rule: "ALWAYS get what's after the number")
        let currency: string | null = null;
        if (numberEntity) {
            // Slice utterance from the end of the number (+1 for space)
            const afterNumber = result.utterance.slice(numberEntity.end + 1).trim();
            // Take the first alphanumeric word
            const nextWordMatch = afterNumber.match(/^[A-Za-z0-9]+/);
            if (nextWordMatch) {
                currency = nextWordMatch[0];
                console.log(`[SendTokens] Strict positional extraction: found "${currency}" after number`);
            }
        }

        if (!currency) {
            await ctx.reply(`Please specify the **token symbol** or **token name** (e.g. Hathor or HTR).\nExample: "Send 10 **HTR** to ..."`, { parse_mode: "Markdown" });
            return;
        }

        // 3. Address Resolution
        // 3.1 Address Resolution from text
        const parsedAddress = (addressEntity && addressEntity.resolution) ? addressEntity.resolution.value : (addressEntity ? addressEntity.sourceText : null);

        // 3.2 Address Resolution from mention
        // We look for 'mention' (@username) or 'text_mention' (Name Link)
        const mentionResult = await resolveTargetFromMentions(ctx);
        if (mentionResult.status === 'handled_error') {
            await ctx.reply(`I couldn't resolve the identity of the user. If they are a new bot user, please ask them to DM me first so I can register them.`);
            return;
        }
        if (mentionResult.status === 'found') {
            targetUserId = mentionResult.data.userId;
            targetUsername = mentionResult.data.username;
        }

        // If we found a User ID (either from text_mention or resolved username)
        if (targetUserId) {
            const { user, created } = await userService.getOrCreateUser(targetUserId, targetUsername);
            targetAddress = user.address;
            if (created) {
                await ctx.reply(`[${targetUsername}](tg://user?id=${targetUserId}) hasn't interacted with the bot before. A new address was created for them 🙂`, { parse_mode: "Markdown" });
            }
        }

        // If we have a targetAddress from mention, use it. Otherwise use parsed address.
        const finalAddress = targetAddress || parsedAddress;

        if (!finalAddress) {
            await ctx.reply(`You need to specify the **destination** (address or user).\nExample: "Send ${amount} ${currency} to **@user**" or **[address]**`, { parse_mode: "Markdown" });
            return;
        }

        // Token resolution
        let tokenId = '00';
        let displayCurrency = currency.toUpperCase();

        if (displayCurrency !== 'HTR' && displayCurrency !== 'HATHOR') {
            // Check DB for token
            // Database now has COLLATE NOCASE on symbol and name
            const token = await prisma.token.findFirst({
                where: {
                    OR: [
                        { symbol: currency },
                        { name: currency }
                    ]
                }
            });

            if (!token) {
                await ctx.reply(`I'm sorry, I don't recognize the token "**${currency}**".`, { parse_mode: "Markdown" });
                return;
            }
            tokenId = token.id;
            displayCurrency = token.symbol;
        }

        // All present - Execute
        let replyMessage = `Processing transfer of **${amount} ${displayCurrency}** to \`${finalAddress}\`.`;
        await ctx.reply(replyMessage, { parse_mode: "Markdown" });

        // Ensure from address is valid (from user)
        if (!ctx.user || !ctx.user.address) {
            await ctx.reply("Error: Could not retrieve your wallet address to verify balance.");
            return;
        }

        const fromAddress = ctx.user.address;
        console.log('[SendTokens] Wallet Request:', { address: finalAddress, amount, fromAddress, tokenId });
        const txResult = await walletService.sendTransaction(finalAddress, amount, fromAddress, tokenId);
        const explorerUrl = `https://explorer.${config.network}.hathor.network/transaction/${txResult.hash}`;

        if (txResult.success) {
            await ctx.reply(`Transaction successful 🚀\n\nHash: [${txResult.hash}](${explorerUrl})`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply(`Transaction failed 🚫\nError: ${txResult.error || 'Unknown error'}`);
        }
    }
};
