// Express global type augmentation — adds req.auth to all routes
declare global {
    namespace Express {
        interface Request {
            auth?: {
                token: string;
                userId: string;
                username: string;
                role: 'user' | 'admin';
            };
        }
    }
}
export { };
