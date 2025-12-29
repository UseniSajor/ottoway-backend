import express, { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { clerkClient } from '@clerk/clerk-sdk-node';

const router = express.Router();

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
      create: { clerkId: clerkUserId, email, name },
    });
  } catch (error) {
    return await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {},
      create: { clerkId: clerkUserId, email: `${clerkUserId}@temp.com`, name: 'User' },
    });
  }
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureUser(req.auth!.userId);
    const contractors = await prisma.contractor.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { name: 'asc' },
    });
    res.json(contractors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contractors' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, company, trades } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    await ensureUser(req.auth!.userId);
    const contractor = await prisma.contractor.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company: company?.trim() || null,
        trades: trades || [],
        userId: req.auth!.userId,
      },
    });
    res.status(201).json(contractor);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create contractor' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.contractor.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.auth!.userId) {
      return res.status(404).json({ error: 'Not found' });
    }
    await prisma.contractor.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;