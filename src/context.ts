import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from '@grammyjs/conversations';
import { User } from '@prisma/client';

export type MyContext = Context & SessionFlavor<{}> & ConversationFlavor<Context> & {
    user?: User;
};
