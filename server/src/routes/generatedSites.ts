import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/error.js';

export const generatedSitesRouter = Router();

function leadAccessWhere(req: { session?: { sub: string; role: string } }) {
  return req.session?.role === 'admin' ? {} : { createdByUserId: req.session!.sub };
}

generatedSitesRouter.get('/:generatedSiteId', async (req, res, next) => {
  try {
    const site = await prisma.generatedSite.findFirst({
      where: { id: req.params.generatedSiteId, lead: leadAccessWhere(req) },
      include: {
        lead: { select: { id: true, businessName: true } },
        siteJob: { select: { id: true, status: true } },
      },
    });
    if (!site) throw new HttpError(404, 'generated_site_not_found');
    res.json(site);
  } catch (err) {
    next(err);
  }
});
