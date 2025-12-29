import express, { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { clerkClient } from '@clerk/clerk-sdk-node';

const router = express.Router();

/**
 * Helper function to ensure user exists in database
 */
async function ensureUser(clerkUserId: string) {
  try {
    // Try to get user from Clerk to get email
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    
    const email = clerkUser.emailAddresses[0]?.emailAddress || `${clerkUserId}@temp.com`;
    const name = clerkUser.firstName 
      ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
      : clerkUser.username || 'User';

    // Upsert user in database
    return await prisma.user.upsert({
      where: { clerkId: clerkUserId },
      update: {
        email,
        name,
      },
      create: {
        clerkId: clerkUserId,
        email,
        name,
      },
    });
  } catch (error) {
    console.error('Error ensuring user:', error);
    
    // Fallback: create user with minimal info
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
 * GET /api/projects/public
 * Get all public projects (no auth required)
 */
router.get('/public', async (_req, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        address: true,
        budget: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    console.error('Error fetching public projects:', error);
    res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * GET /api/projects
 * Get user's projects (requires auth)
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const clerkUserId = req.auth!.userId;

    // Ensure user exists in database
    await ensureUser(clerkUserId);

    const projects = await prisma.project.findMany({
      where: { userId: clerkUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * GET /api/projects/:id
 * Get single project (requires auth + ownership)
 */
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.auth!.userId;

    const project = await prisma.project.findUnique({
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

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ 
      error: 'Failed to fetch project',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * POST /api/projects
 * Create new project (requires auth)
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, address, budget, startDate, endDate, isPublic } = req.body;
    const clerkUserId = req.auth!.userId;

    // Validation
    if (!name || !address) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Name and address are required' 
      });
    }

    // Ensure user exists in database
    await ensureUser(clerkUserId);

    // Create project
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        address: address.trim(),
        budget: budget ? parseFloat(budget) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isPublic: isPublic === true,
        userId: clerkUserId,
        status: 'PLANNING',
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

    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * PATCH /api/projects/:id
 * Update project (requires auth + ownership)
 */
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, address, budget, status, startDate, endDate, isPublic } = req.body;
    const clerkUserId = req.auth!.userId;

    // Check ownership
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existing.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build update data object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (address !== undefined) updateData.address = address.trim();
    if (budget !== undefined) updateData.budget = budget ? parseFloat(budget) : null;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (isPublic !== undefined) updateData.isPublic = isPublic === true;

    // Update project
    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ 
      error: 'Failed to update project',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete project (requires auth + ownership)
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.auth!.userId;

    // Check ownership
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existing.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete project
    await prisma.project.delete({
      where: { id },
    });

    res.json({ 
      success: true, 
      message: 'Project deleted successfully',
      id 
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ 
      error: 'Failed to delete project',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

/**
 * GET /api/projects/:id/status
 * Get project status history (future enhancement placeholder)
 */
router.get('/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const clerkUserId = req.auth!.userId;

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        userId: true,
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.userId !== clerkUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // For now, just return current status
    // Later you can add a ProjectStatusHistory table
    res.json({
      projectId: id,
      currentStatus: project.status,
      history: [], // Placeholder for future status history
    });
  } catch (error) {
    console.error('Error fetching project status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch project status',
      message: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
});

export default router;