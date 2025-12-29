import express, { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/contractors
 * Get all contractors (requires auth)
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const contractors = await prisma.contractor.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(contractors);
  } catch (error) {
    console.error('Error fetching contractors:', error);
    res.status(500).json({ error: 'Failed to fetch contractors' });
  }
});

/**
 * POST /api/contractors
 * Create new contractor (requires auth)
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, company, trades } = req.body;

    if (!name || !email) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Name and email are required' 
      });
    }

    const contractor = await prisma.contractor.create({
      data: {
        name,
        email,
        phone,
        company,
        trades: trades || [],
        userId: req.auth!.userId,
      },
    });

    res.status(201).json(contractor);
  } catch (error) {
    console.error('Error creating contractor:', error);
    res.status(500).json({ error: 'Failed to create contractor' });
  }
});

export default router;