const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

// Schéma de validation pour les rapports d'erreur
const errorReportSchema = z.object({
  errorMessage: z.string().min(1).max(1000),
  pagePath: z.string().min(1).max(255),
  additionalInfo: z.record(z.any()).optional(),
});

const errorReportUpdateSchema = z.object({
  status: z.enum(['nouveau', 'en_cours', 'traite']).optional(),
  workflowStage: z.enum(['dev', 'resolu', 'en_prod']).optional(),
  ownerName: z.string().trim().max(100).nullable().optional(),
});

// POST /errors/report - Enregistrer une erreur
router.post('/report', requireAuth, async (req, res) => {
  try {
    const parsed = errorReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const { errorMessage, pagePath, additionalInfo } = parsed.data;
    const userId = req.user.id;

    const errorReport = await prisma.errorReport.create({
      data: {
        userId,
        errorMessage,
        pagePath,
        additionalInfo: additionalInfo || null,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Error report recorded successfully',
      errorReport: {
        id: errorReport.id,
        createdAt: errorReport.createdAt,
      },
    });
  } catch (err) {
    console.error('Error reporting error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue lors de l\'enregistrement du rapport d\'erreur',
    });
  }
});

// GET /errors - Récupérer les erreurs (admin uniquement)
router.get('/', requireAuth, async (req, res) => {
  try {
    // Vérifier si l'utilisateur est admin
    const admin = await prisma.adminUser.findUnique({
      where: { userId: req.user.id },
    });

    if (!admin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Vous n\'avez pas les permissions pour accéder à cette ressource',
      });
    }

    const { page = 1, limit = 50, userId } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skip = (pageNum - 1) * limitNum;

    const where = userId ? { userId } : {};

    const [errorReports, total] = await Promise.all([
      prisma.errorReport.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.errorReport.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: errorReports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('Error fetching error reports:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue lors de la récupération des rapports d\'erreur',
    });
  }
});

// GET /errors/:id - Détails d'une erreur spécifique (admin uniquement)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // Vérifier si l'utilisateur est admin
    const admin = await prisma.adminUser.findUnique({
      where: { userId: req.user.id },
    });

    if (!admin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Vous n\'avez pas les permissions pour accéder à cette ressource',
      });
    }

    const { id } = req.params;
    const errorReport = await prisma.errorReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (!errorReport) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rapport d\'erreur non trouvé',
      });
    }

    return res.status(200).json({
      success: true,
      data: errorReport,
    });
  } catch (err) {
    console.error('Error fetching error report:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue lors de la récupération du rapport d\'erreur',
    });
  }
});

// PATCH /errors/:id - Mettre à jour un rapport d'erreur (admin uniquement)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    // Vérifier si l'utilisateur est admin
    const admin = await prisma.adminUser.findUnique({
      where: { userId: req.user.id },
    });

    if (!admin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Vous n\'avez pas les permissions pour accéder à cette ressource',
      });
    }

    const { id } = req.params;
    const parsed = errorReportUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0].message,
      });
    }

    const data = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Aucune modification fournie',
      });
    }

    const errorReport = await prisma.errorReport.findUnique({
      where: { id },
    });

    if (!errorReport) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Rapport d\'erreur non trouvé',
      });
    }

    const updated = await prisma.errorReport.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      success: true,
      message: 'Rapport d\'erreur mis à jour avec succès',
      data: updated,
    });
  } catch (err) {
    console.error('Error updating error report:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue lors de la mise à jour du rapport d\'erreur',
    });
  }
});

module.exports = router;
