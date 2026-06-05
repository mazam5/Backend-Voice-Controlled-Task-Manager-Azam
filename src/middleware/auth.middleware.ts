import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'my_secret_jwt_urban_ground';

export interface AuthRequest extends Request {
  user?: {
    userId: number;
  };
}

interface AuthTokenPayload extends JwtPayload {
  userId: number;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as AuthTokenPayload;

    req.user = { userId: decoded.userId };

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};