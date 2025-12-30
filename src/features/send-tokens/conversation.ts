import { Conversation } from '@grammyjs/conversations';
import { MyContext } from '../../context';
import { walletService } from '../../services/wallet';

export async function sendTokensConversation(conversation: Conversation<MyContext, MyContext>, ctx: MyContext) {
    await ctx.reply("Please enter the address to send tokens to:");

    const addressCtx = await conversation.wait();
    const toAddress = addressCtx.message?.text;

    if (!toAddress) {
        await ctx.reply("Invalid address. Operation cancelled.");
        return;
    }

    // TODO: validate address

    await ctx.reply("Please enter the amount to send (e.g. 1.50):");

    const valueCtx = await conversation.wait() as MyContext;
    const valueText = valueCtx.message?.text;
    const value = parseFloat(valueText || '0');

    if (isNaN(value) || value <= 0) {
        await ctx.reply("Invalid amount. Operation cancelled.");
        return;
    }

    // Need to get user again or rely on middleware. 
    // Since middleware runs on every update, addressCtx and valueCtx should have .user if we use the middleware correctly.
    // However, conversation.wait() yields new updates.
    // We'll assume the global middleware populates ctx.user on these updates too.

    if (!valueCtx.user || !valueCtx.user.address) {
        await ctx.reply("Error: Could not retrieve your wallet address.");
        return;
    }

    const fromAddress = valueCtx.user.address;
    await ctx.reply("Sending transaction...");

    const result = await conversation.external(() =>
        walletService.sendTransaction(toAddress, value, fromAddress)
    );

    if (result.success) {
        await ctx.reply(`Transaction successful!\nHash: \`${result.tx.hash}\``, { parse_mode: "Markdown" });
    } else {
        await ctx.reply(`Transaction failed.\nError: ${result.error || 'Unknown error'}`);
    }
}
