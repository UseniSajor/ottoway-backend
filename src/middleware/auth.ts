import { Request, Response, NextFunction } from 'express';
import { clerkClient } from '@clerk/clerk-sdk-node';

export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
    orgId?: string;
    orgRole?: string;
  };
}

/**
 * Middleware to verify Clerk JWT token and attach user info to request
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No authorization token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the session token with Clerk
    const sessionClaims = await clerkClient.verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    if (!sessionClaims || !sessionClaims.sub) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token' 
      });
    }

    // Attach auth info to request
    req.auth = {
      userId: sessionClaims.sub,
      sessionId: sessionClaims.sid as string,
      orgId: sessionClaims.org_id as string | undefined,
      orgRole: sessionClaims.org_role as string | undefined,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication failed' 
    });
  }
};

/**
 * Optional middleware to require admin role
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.auth?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await clerkClient.users.getUser(req.auth.userId);
    const isAdmin = user.publicMetadata?.role === 'admin';

    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Admin access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(403).json({ error: 'Authorization failed' });
  }
};

/**
 * Optional middleware to make auth optional (attaches user if present)
 */
export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No auth, continue without user
    }

    const token = authHeader.substring(7);
    const sessionClaims = await clerkClient.verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
    if (sessionClaims && sessionClaims.sub) {
      req.auth = {
        userId: sessionClaims.sub,
        sessionId: sessionClaims.sid as string,
        orgId: sessionClaims.org_id as string | undefined,
        orgRole: sessionClaims.org_role as string | undefined,
      };
    }

    next();
  } catch (error) {
    // If token verification fails, just continue without auth
    next();
  }
};