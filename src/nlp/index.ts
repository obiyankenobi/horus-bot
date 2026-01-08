import { Bot } from 'grammy';
import { MyContext } from '../context';
import { nlpService } from '../services/nlp';
import { commands } from './commands';
import { startDiceMonitor } from '../services/dice-monitor';
import { logger } from '../utils/logger';

export async function setupNLP(bot: Bot<MyContext>) {
    // 1. Register Commands
    for (const cmd of commands) {
        nlpService.registerCommand(cmd);
    }

    // 2. Train Model (Async)
    // We start training but don't block bot startup, 
    // process() waits for training to complete if needed.
    nlpService.train().catch(err => logger.error(`[NLP] Training failed: ${err}`));

    // 3. Register Listener
    bot.on("message:text", async (ctx, next) => {
        const text = ctx.message.text;

        // Ignore commands starting with / (let grammY handle /start etc if we keep them)
        if (text.startsWith('/')) {
            await next();
            return;
        }

        try {
            const result = await nlpService.process(text);
            const intent = result.intent;
            const score = result.score;

            logger.info(`[NLP] Text: "${text}" -> Intent: ${intent} (${score})`);

            if (intent && intent !== 'None' && score > 0.7) {
                const command = nlpService.getCommand(intent);
                if (command) {
                    await command.handle(ctx, result);
                } else if (result.answer) {
                    // Fallback to NLP.js built-in answers (e.g. greetings)
                    await ctx.reply(result.answer);
                }
            } else {
                // Low confidence or None
                await ctx.reply("I didn't quite get that. Try specific commands like:\n- `Send 10 HTR to [address]`\n- `Check balance`", { parse_mode: "Markdown" });
            }
        } catch (error) {
            logger.error(`[NLP] Error processing message: ${error}`);
            await ctx.reply("Sorry, I encountered an error processing your request.");
        }
    });
}
