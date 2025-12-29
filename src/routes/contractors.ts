import express, { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { clerkClient } from '@clerk/clerk-sdk-node';

const router = express.Router();

/**
 * Helper function to ensure user exists in database
 */
async function ensureUser(clerkUserId: string) {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    
    const email = clerkUser.emailAddresses[0]?.emailAddress || `${clerkUserId}@temp.com`;
    const name = clerkUser.firstName 
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : clerkUser.username || 'User';

    return await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: { email, name },
      create: {
        clerkId: clerkUserId,
        email,
        name,
      },
    });
  } catch (error) {
    console.error('Error ensuring user:', error);
    return await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {},
      create: {
        clerkId: clerkUserId,
        email: `${clerkUserId}@temp.com`,
        name: 'User',
      },
    });
  }
}

/**
 * GET /api/contractors
 * Get all contractors (requires auth)
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clerkUserId = req.auth!.userId;
    await ensureUser(clerkUserId);

    const contractors = await prisma.contractor.findMany({
      where: { userId: clerkUserId },
      orderBy: { name: 'asc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.json(contractors);
  } catch (error) {
    console.error('Error fetching contractors:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contractors',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * GET /api/contractors/:id
 * Get single contractor
 */
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.auth!.userId;

    const contractor = await prisma.contractor.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    if (contractor.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(contractor);
  } catch (error) {
    console.error('Error fetching contractor:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contractor',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * POST /api/contractors
 * Create new contractor (requires auth)
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, company, trades, rating } = req.body;
    const clerkUserId = req.auth!.userId;

    // Validation
    if (!name || !email) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Name and email are required' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid email format' 
      });
    }

    // Ensure user exists
    await ensureUser(clerkUserId);

    // Create contractor
    const contractor = await prisma.contractor.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company: company?.trim() || null,
        trades: trades || [],
        rating: rating ? parseFloat(rating) : 0,
        userId: clerkUserId,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json(contractor);
  } catch (error: any) {
    console.error('Error creating contractor:', error);
    
    // Handle unique constraint violation (duplicate email)
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Contractor already exists',
        message: 'A contractor with this email already exists' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create contractor',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * PATCH /api/contractors/:id
 * Update contractor
 */
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, trades, rating } = req.body;
    const clerkUserId = req.auth!.userId;

    // Check ownership
    const existing = await prisma.contractor.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    if (existing.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (company !== undefined) updateData.company = company?.trim() || null;
    if (trades !== undefined) updateData.trades = trades;