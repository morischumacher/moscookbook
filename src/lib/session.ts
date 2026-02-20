import { SessionOptions } from 'iron-session';

export const sessionOptions: SessionOptions = {
    password: process.env.SECRET_COOKIE_PASSWORD as string || 'complex_password_at_least_32_characters_long',
    cookieName: 'mos_cookbook_session',
    cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    },
};

export interface SessionData {
    user?: {
        id: number;
        email: string;
        name: string;
        admin: boolean;
    };
}

declare module 'iron-session' {
    interface IronSessionData extends SessionData { }
}
