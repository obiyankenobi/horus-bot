import { Bot, Context } from 'grammy';
import { prisma } from '../db';
import { config } from '../config';
import { walletService } from './wallet';
import axios from 'axios';
import { logger } from '../utils/logger';

// Polling interval in milliseconds
const INTERVAL_MS = 15000;

export function startDiceMonitor(bot: Bot<any>) {
    logger.info('[DiceMonitor] Starting monitoring service...');

    // Check immediately then interval
    checkPendingBets(bot);
    setInterval(() => checkPendingBets(bot), INTERVAL_MS);
}

async function checkPendingBets(bot: Bot<any>) {
    try {
        const pendingBets = await prisma.pendingBet.findMany();
        if (pendingBets.length === 0) return;

        logger.info(`[DiceMonitor] Checking ${pendingBets.length} pending bets...`);

        for (const bet of pendingBets) {
            await processBet(bot, bet);
        }

    } catch (error) {
        logger.error(`[DiceMonitor] Error fetching pending bets: ${error}`);
    }
}

async function processBet(bot: Bot<any>, bet: any) {
    logger.info(`[DiceMonitor] Checking bet ${bet.hash}...`);
    const url = `${config.fullnodeUrl}/v1a/nano_contract/logs`;

    try {
        const response = await axios.get(url, {
            params: { id: bet.hash }
        });

        const data = response.data;

        // Validate response structure
        if (!data.success) {
            // Not confirmed yet or error?
            // If nc_execution is missing, maybe it's still mining/propagating?
            // We only act if we have conclusive state.
            logger.info(`[DiceMonitor] Bet ${bet.hash} not confirmed yet or error.`);
            return;
        }

        if (data.nc_execution !== 'success') {
            // Bet execution failed (e.g. script error?)
            logger.info(`[DiceMonitor] Bet ${bet.hash} execution failed.`);
            await notifyUser(bot, bet.userId, bet.chatId, `❌ Your dice bet execution failed and your funds have been returned.\nHash: ${bet.hash}`);
            await prisma.pendingBet.delete({ where: { hash: bet.hash } });
            return;
        }

        // Execution success, check logs for Win/Lose
        // The logs are nested: data.logs[tx_hash] -> array of executions
        // We look for the one matching our bet (which is the tx_hash itself)
        const logsMap = data.logs || {};
        const betLogs = Object.values(logsMap)[0];

        if (!betLogs || !Array.isArray(betLogs) || betLogs.length === 0) {
            // Ensure logs exist
            logger.info(`[DiceMonitor] Bet ${bet.hash} has no logs.`);
            return;
        }

        // Usually there's one execution trace.
        const trace = betLogs[0];
        const events = trace.logs || [];

        let result = 'LOSE';
        let payoutAmount = 0;

        for (const event of events) {
            if (event.type === 'LOG' && event.key_values) {
                logger.info(`[DiceMonitor] Event: ${JSON.stringify(event)}`);
                if (event.key_values.payout && event.key_values.payout > 0) {
                    result = 'WIN';
                    payoutAmount = parseInt(event.key_values.payout);
                    break;
                }
            }
        }

        if (result === 'LOSE') {
            await notifyUser(bot, bet.userId, bet.chatId, `🎲 You lost your bet of **${bet.amount} HTR**. Better luck next time!`);
            await prisma.pendingBet.delete({ where: { hash: bet.hash } });
        } else if (result === 'WIN') {
            // Claim the winnings
            const claimResult = await claimWinnings(bet.address, payoutAmount);

            if (claimResult.success) {
                const explorerUrl = `https://explorer.${config.network}.hathor.network/transaction/${claimResult.hash}`;
                await prisma.pendingBet.delete({ where: { hash: bet.hash } });
                await notifyUser(bot, bet.userId, bet.chatId, `🎉 **YOU WON!** Payout: **${payoutAmount / 100} HTR**.\n\nThis is the transaction claiming your winnings: [${claimResult.hash}](${explorerUrl})`);
            } else {
                await notifyUser(bot, bet.userId, bet.chatId, `⚠️ You won, but I failed to claim your winnings. Retrying shortly.\nError: ${claimResult.error}`);
                // Do NOT delete, retry next interval
            }
        }

    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            logger.info(`[DiceMonitor] Logs not ready yet for ${bet.hash} (404).`);
            return;
        }
        logger.error(`[DiceMonitor] Error processing bet ${bet.hash}: ${error.message}`);
        // Do not delete, retry later
    }
}

async function claimWinnings(userAddress: string, amount: number) {
    const actions = [
        {
            type: 'withdrawal',
            token: '00',
            amount: amount,
            address: userAddress,
            changeAddress: userAddress
        }
    ];

    return await walletService.executeNanoContract(
        config.diceNcId,
        'claim_balance',
        userAddress,
        [], // args empty
        actions
    );
}

async function notifyUser(bot: Bot<any>, userId: bigint, chatId: bigint | null, message: string) {
    try {
        const targetId = chatId ? chatId.toString() : userId.toString();
        let finalMessage = message;

        // If sending to a group (chatId != userId), mention the user
        if (chatId && chatId !== userId) {
            try {
                const member = await bot.api.getChatMember(targetId, parseInt(userId.toString()));
                const name = member.user.username;
                finalMessage = `[${name}](tg://user?id=${userId})\n\n${message}`;
            } catch (ignore) {
                finalMessage = `[User](tg://user?id=${userId})\n\n${message}`;
            }
        }

        await bot.api.sendMessage(targetId, finalMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        logger.error(`[DiceMonitor] Failed to notify user ${userId}: ${error}`);
    }
}
