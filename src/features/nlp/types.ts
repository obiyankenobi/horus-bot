import { MyContext } from '../../context';

export interface Command {
    intent: string;
    entities?: Record<string, string>;
    train: (manager: any) => void;
    handle: (ctx: MyContext, result: any) => Promise<void>;
}
