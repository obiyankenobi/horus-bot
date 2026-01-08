import { MyContext } from '../context';
import { userService } from '../services/user';

export type MentionTarget = {
    userId: bigint;
    username: string | null;
}

export type MentionResult =
    | { status: 'found', data: MentionTarget }
    | { status: 'none' }
    | { status: 'handled_error' };

export async function resolveTargetFromMentions(ctx: MyContext): Promise<MentionResult> {
    if (!ctx.message || !ctx.message.entities) {
        return { status: 'none' };
    }

    const text = ctx.message.text || '';

    for (const ent of ctx.message.entities) {
        if (ent.type === 'text_mention' && ent.user) {
            const targetUserId = BigInt(ent.user.id);
            const targetUsername = ent.user.username || ent.user.first_name || null;
            console.log(`[Mentions] Found text_mention for ID: ${targetUserId}, username: ${targetUsername}`);

            return {
                status: 'found',
                data: {
                    userId: targetUserId,
                    username: targetUsername
                }
            };
        } else if (ent.type === 'mention') {
            const mentionText = text.slice(ent.offset, ent.offset + ent.length);
            // Filter out bot's own mention if any
            if (mentionText === `@${ctx.me.username}`) continue;

            const targetUsername = mentionText.replace('@', ''); // e.g. "user"
            console.log(`[Mentions] Found mention: ${targetUsername}`);

            // Resolve username
            try {
                // 1. Try DB
                let resolvedId = await userService.getIdByUsername(targetUsername);

                // 2. Try External API if not in DB
                if (!resolvedId) {
                    resolvedId = await userService.resolveIdFromApi(targetUsername);
                }

                if (resolvedId) {
                    return {
                        status: 'found',
                        data: {
                            userId: resolvedId,
                            username: targetUsername
                        }
                    };
                } else {
                    console.error('Could not get user ID for username:', targetUsername);
                    return { status: 'handled_error' };
                }
            } catch (error) {
                console.error('Error resolving username:', error);
                return { status: 'handled_error' };
            }
        }
    }

    return { status: 'none' };
}
