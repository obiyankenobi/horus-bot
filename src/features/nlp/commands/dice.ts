import { Command } from '../types';
import { MyContext } from '../../../context';
import { config } from '../../../config';
import { walletService } from '../../../services/wallet';
import { prisma } from '../../../db';

export const diceCommand: Command = {
    intent: 'games.dice',

    train(manager: any) {
        manager.addDocument('en', 'play hathor dice %number% htr %number%x', 'games.dice');
        manager.addDocument('en', 'play hathor dice %number% htr %number%%', 'games.dice');
        manager.addDocument('en', 'play dice %number% htr %number%x', 'games.dice');
        manager.addDocument('en', 'play dice %number% htr %number%%', 'games.dice');
        manager.addDocument('en', 'play hathordice %number% htr %number%x', 'games.dice');
        manager.addDocument('en', 'play hathor dice', 'games.dice');
        manager.addDocument('en', 'play dice', 'games.dice');

        // Add user provided examples
        manager.addDocument('en', 'play hathor dice 10 htr 1.5x', 'games.dice');
        manager.addDocument('en', 'play dice 10 htr 50%', 'games.dice');
        manager.addDocument('en', 'play dice 50 HTR 100x', 'games.dice');
        manager.addDocument('en', 'play hathordice 20 HTR 1.5x', 'games.dice');
        manager.addDocument('en', 'play 10 htr hathor dice 1.5x', 'games.dice');
    },

    async handle(ctx: MyContext, result: any) {
        const text = ctx.message?.text || '';

        if (!ctx.user || !ctx.user.address) {
            await ctx.reply("Could not identify your wallet address.");
            return;
        }

        // 0. Check Pending Bets
        const pending = await prisma.pendingBet.findFirst({
            where: { userId: ctx.user.telegramId }
        });

        if (pending) {
            await ctx.reply("You already have a pending bet. Please wait for the result.");
            return;
        }

        // 1. Parse Input
        // Look for amount: number followed by HTR (case insensitive)
        const amountRegex = /(\d+(?:\.\d+)?)\s*(?:HTR|htr)/i;
        // Look for target: number followed by x or % (case insensitive)
        const targetRegex = /(\d+(?:\.\d+)?)\s*(x|%)/i;

        const amountMatch = text.match(amountRegex);
        const targetMatch = text.match(targetRegex);

        if (!amountMatch || !targetMatch) {
            await ctx.reply("Invalid format. Usage: `play dice <amount> HTR <target>`\nExample: `play dice 10 HTR 2x` or `play dice 10 HTR 50%`", { parse_mode: "Markdown" });
            return;
        }

        const amount = parseFloat(amountMatch[1]);
        const targetValue = parseFloat(targetMatch[1]);
        const targetType = targetMatch[2].toLowerCase(); // 'x' or '%'

        if (isNaN(amount) || amount <= 0) {
            await ctx.reply("Invalid bet amount. Please specify a positive number.");
            return;
        }

        if (isNaN(targetValue) || targetValue <= 0) {
            await ctx.reply("Invalid target value. Please specify a positive number.");
            return;
        }
        // 2. Validate bet amount
        const betAmountInt = Math.floor(amount * 100);
        if (betAmountInt > config.diceMaxBet) {
            const maxBetHtr = config.diceMaxBet / 100;
            await ctx.reply(`Bet amount too high. Maximum bet is ${maxBetHtr.toFixed(2)} HTR.`);
            return;
        }

        // 3. Validate Balance
        try {
            // Check HTR balance
            const htrInfo = await walletService.getAddressInfo(ctx.user.address, '00');
            if (!htrInfo || !htrInfo.success) {
                await ctx.reply("Error fetching your balance.");
                return;
            }

            const balanceHtr = htrInfo.total_amount_available / 100;
            if (amount > balanceHtr) {
                await ctx.reply(`Insufficient funds. Your balance is ${balanceHtr.toFixed(2)} HTR.`);
                return;
            }

        } catch (error) {
            console.error("Balance check failed:", error);
            await ctx.reply("Failed to verify balance.");
            return;
        }

        // 4. Calculate Logic
        const maxMult = config.diceMaxMultiplier;
        const bitLength = config.diceRandomBitLength;
        const houseEdgeBP = config.diceHouseEdge; // Basis points, e.g., 190 = 1.9%
        const range = Math.pow(2, bitLength); // 65536 for 16 bits

        let multiplier: number;
        let winChance: number;
        let threshold: number;

        if (targetType === 'x') {
            multiplier = targetValue;

            // Validation: Max Multiplier
            if (multiplier > maxMult) {
                await ctx.reply(`Multiplier too high. Maximum allowed is ${maxMult}x.`);
                return;
            }

            // threshold = 2**randomBitLength * (10000 - houseEdgeBasisPoints) / (10000 * multiplier)
            threshold = Math.floor((range * (10000 - houseEdgeBP)) / (10000 * multiplier));

            // winChance = threshold * 100 / 2**randomBitLength
            winChance = (threshold * 100) / range;

        } else {
            // targetType === '%'
            winChance = targetValue;

            if (winChance >= 100 || winChance <= 0) {
                await ctx.reply(`Invalid win chance. Must be between 0 and 100.`);
                return;
            }

            // threshold = winChance * 2**randomBitLength / 100
            threshold = Math.floor((winChance * range) / 100);

            // multiplier = 2**randomBitLength * (10000 - houseEdgeBasisPoints) / (10000 * threshold)
            // Guard against division by zero if threshold is 0 (shouldn't happen with winChance > 0)
            if (threshold === 0) {
                await ctx.reply("Invalid win chance resulting in 0 threshold.");
                return;
            }
            multiplier = (range * (10000 - houseEdgeBP)) / (10000 * threshold);

            if (multiplier > maxMult) {
                await ctx.reply(`Calculated multiplier ${multiplier.toFixed(2)}x exceeds maximum allowed ${maxMult}x.`);
                return;
            }
        }

        // 5. Nano Contract Execution
        const actions = [
            {
                type: 'deposit',
                token: '00',
                amount: betAmountInt,
                address: ctx.user.address,
                changeAddress: ctx.user.address
            }
        ];
        const args = [betAmountInt, threshold];

        try {
            const txResult = await walletService.executeNanoContract(
                config.diceNcId,
                'place_bet',
                ctx.user.address,
                args,
                actions
            );

            if (txResult.success) {
                const explorerUrl = `https://explorer.${config.network}.hathor.network/transaction/${txResult.hash}`;
                const potentialPayout = amount * multiplier;
                await ctx.reply(`🎲🎲
Bet: ${amount} HTR
Win Chance: ${winChance.toFixed(2)}%
Multiplier: ${multiplier.toFixed(2)}x
Potential payout: ${potentialPayout.toFixed(2)} HTR

The dice is rolled and we will inform you of the results.\nTransaction Hash: [${txResult.hash}](${explorerUrl})`, { parse_mode: "Markdown" });

                // Save Pending Bet
                await prisma.pendingBet.create({
                    data: {
                        hash: txResult.hash,
                        userId: ctx.user.telegramId,
                        chatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
                        address: ctx.user.address,
                        amount: amount
                    }
                });
            } else {
                await ctx.reply(`Transaction failed.\nError: ${txResult.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error("Dice execution error:", error);
            await ctx.reply("An error occurred while rolling the dice. Please try again.");
        }
    }
};
