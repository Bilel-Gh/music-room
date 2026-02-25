export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface User extends JwtPayload {
      id?: string;
    }
    interface Request {
      user?: JwtPayload;
    }
  }
}
