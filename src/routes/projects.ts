import express, { Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';

const router = express.Router();

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
        startDate: true,
        endDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    console.error('Error fetching public projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects
 * Get user's projects (requires auth)
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects/:id
 * Get single project (requires auth + ownership)
 */
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check ownership
    if (project.userId !== req.auth!.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * POST /api/projects
 * Create new project (requires auth)
 */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, address, budget, startDate, endDate } = req.body;

    // Validation
    if (!name || !address) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Name and address are required' 
      });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        address,
        budget: budget ? parseFloat(budget) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        userId: req.auth!.userId,
        status: 'PLANNING',
      },
    });

    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * PATCH /api/projects/:id
 * Update project (requires auth + ownership)
 */
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, address, budget, status, startDate, endDate } = req.body;

    // Check ownership
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existing.userId !== req.auth!.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update project
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(address && { address }),
        ...(budget !== undefined && { budget: budget ? parseFloat(budget) : null }),
        ...(status && { status }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });

    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete project (requires auth + ownership)
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existing.userId !== req.auth!.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.project.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;