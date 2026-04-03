const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

const STATUS_COLUMNS = ['nouveau', 'en_cours', 'traite'];
const STAGE_OPTIONS = ['dev', 'resolu', 'en_prod'];

router.get('/error-reports', requireAdmin, async (req, res) => {
  try {
    const reports = await prisma.errorReport.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
      take: 300,
    });

    const grouped = {
      nouveau: [],
      en_cours: [],
      traite: [],
    };

    for (const report of reports) {
      const key = STATUS_COLUMNS.includes(report.status) ? report.status : 'nouveau';
      grouped[key].push(report);
    }

    res.render('admin/error-reports', {
      grouped,
      statusColumns: STATUS_COLUMNS,
      stageOptions: STAGE_OPTIONS,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

router.post('/error-reports/:id/update', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, workflowStage, ownerName } = req.body;

    if (!STATUS_COLUMNS.includes(status)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Statut invalide' });
    }

    if (!STAGE_OPTIONS.includes(workflowStage)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Workflow invalide' });
    }

    await prisma.errorReport.update({
      where: { id },
      data: {
        status,
        workflowStage,
        ownerName: ownerName && ownerName.trim() ? ownerName.trim() : null,
      },
    });

    return res.redirect('/admin/error-reports');
  } catch (err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
