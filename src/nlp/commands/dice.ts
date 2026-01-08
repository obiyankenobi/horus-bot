import { Command } from '../types';
import { MyContext } from '../../context';
import { config } from '../../config';
import { walletService } from '../../services/wallet';
import { prisma } from '../../db';
import { hasMoreThanTwoDecimals } from '../../utils/validation';
import { logger } from '../../utils/logger';

interface DiceCalculation {
    multiplier: number;
    winChance: number;
    threshold: number;
}

function calculateFromMultiplier(multiplier: number): DiceCalculation {
    const range = Math.pow(2, config.diceRandomBitLength);
    const houseEdgeBP = config.diceHouseEdge;

    // threshold = 2**randomBitLength * (10000 - houseEdgeBasisPoints) / (10000 * multiplier)
    const threshold = Math.floor((range * (10000 - houseEdgeBP)) / (10000 * multiplier));
    const winChance = (threshold * 100) / range;

    return { multiplier, winChance, threshold };
}
function calculateFromWinChance(winChance: number): DiceCalculation {
    const range = Math.pow(2, config.diceRandomBitLength);
    const houseEdgeBP = config.diceHouseEdge;

    // threshold = winChance * 2**randomBitLength / 100
    const threshold = Math.floor((winChance * range) / 100);
    // multiplier = 2**randomBitLength * (10000 - houseEdgeBasisPoints) / (10000 * threshold)
    const multiplier = threshold === 0 ? 0 : (range * (10000 - houseEdgeBP)) / (10000 * threshold);

    return { multiplier, winChance, threshold };
}

function applyThresholdLimits(threshold: number): DiceCalculation {
    const range = Math.pow(2, config.diceRandomBitLength);
    const houseEdgeBP = config.diceHouseEdge;
    const minThreshold = config.diceMinThreshold;
    const maxThreshold = config.diceMaxThreshold;

    let finalThreshold = threshold;

    if (threshold < minThreshold) {
        finalThreshold = minThreshold;
    } else if (threshold > maxThreshold) {
        finalThreshold = maxThreshold;
    }

    const winChance = (finalThreshold * 100) / range;
    const multiplier = finalThreshold === 0 ? 0 : (range * (10000 - houseEdgeBP)) / (10000 * finalThreshold);

    return { multiplier, winChance, threshold: finalThreshold };
}

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

        if (hasMoreThanTwoDecimals(amountMatch[1])) {
            await ctx.reply("Only up to 2 decimal places are supported for bet amounts.");
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
            logger.error(`Balance check failed: ${error}`);
            await ctx.reply("Failed to verify balance.");
            return;
        }

        // 4. Calculate Logic
        let calc: DiceCalculation;

        if (targetType === 'x') {
            if (targetValue > config.diceMaxMultiplier) {
                await ctx.reply(`Multiplier too high. Maximum allowed is ${config.diceMaxMultiplier}x.`);
                return;
            }
            calc = calculateFromMultiplier(targetValue);

        } else {
            // targetType === '%'
            if (targetValue >= 100 || targetValue <= 0) {
                await ctx.reply(`Invalid win chance. Must be between 0 and 100.`);
                return;
            }

            calc = calculateFromWinChance(targetValue);
        }

        const { multiplier, winChance, threshold } = applyThresholdLimits(calc.threshold);

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
            logger.error(`Dice execution error: ${error}`);
            await ctx.reply("An error occurred while rolling the dice. Please try again.");
        }
    }
};
