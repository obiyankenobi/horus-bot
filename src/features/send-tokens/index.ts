import { Composer } from 'grammy';
import { createConversation } from '@grammyjs/conversations';
import { MyContext } from '../../context';
import { sendTokensConversation } from './conversation';

export const sendTokensFeature = new Composer<MyContext>();

sendTokensFeature.use(createConversation(sendTokensConversation));

sendTokensFeature.callbackQuery('send_tokens', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('sendTokensConversation');
});
