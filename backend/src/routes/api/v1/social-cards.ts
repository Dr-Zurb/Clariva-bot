/**
 * Social cards (soc-03, soc-05).
 * Mounted at /api/v1/social/cards
 */

import { Router } from 'express';
import { authenticateToken } from '../../../middleware/auth';
import {
  addSocialCardFrameHandler,
  addSocialCardScrapHandler,
  attachSocialCardFileHandler,
  createSocialCardFileUploadHandler,
  createSocialCardHandler,
  createSocialCardUploadHandler,
  deleteSocialCardHandler,
  duplicateSocialCardHandler,
  emptySocialBinHandler,
  getSocialCardFileUrlHandler,
  getSocialCardFrameUrlHandler,
  getSocialCardScrapUrlHandler,
  listBinnedSocialCardsHandler,
  listSocialCardsHandler,
  purgeBinnedSocialCardHandler,
  removeSocialCardFileHandler,
  removeSocialCardFrameHandler,
  orderSocialCardFramesHandler,
  removeSocialCardScrapHandler,
  restoreSocialCardHandler,
  reuseSocialCardHandler,
  updateSocialCardHandler,
} from '../../../controllers/social-card-controller';

const router = Router();

router.get('/', authenticateToken, listSocialCardsHandler);
router.get('/bin', authenticateToken, listBinnedSocialCardsHandler);
router.delete('/bin', authenticateToken, emptySocialBinHandler);
router.delete('/bin/:id', authenticateToken, purgeBinnedSocialCardHandler);
router.post('/uploads', authenticateToken, createSocialCardUploadHandler);
router.post('/', authenticateToken, createSocialCardHandler);
router.post('/:id/file/upload', authenticateToken, createSocialCardFileUploadHandler);
router.post('/:id/frames', authenticateToken, addSocialCardFrameHandler);
router.put('/:id/frames/order', authenticateToken, orderSocialCardFramesHandler);
router.get('/:id/frames/:frameId', authenticateToken, getSocialCardFrameUrlHandler);
router.delete('/:id/frames/:frameId', authenticateToken, removeSocialCardFrameHandler);
router.post('/:id/scraps', authenticateToken, addSocialCardScrapHandler);
router.get('/:id/scraps/:scrapId', authenticateToken, getSocialCardScrapUrlHandler);
router.delete('/:id/scraps/:scrapId', authenticateToken, removeSocialCardScrapHandler);
router.post('/:id/file', authenticateToken, attachSocialCardFileHandler);
router.get('/:id/file', authenticateToken, getSocialCardFileUrlHandler);
router.delete('/:id/file', authenticateToken, removeSocialCardFileHandler);
router.post('/:id/reuse', authenticateToken, reuseSocialCardHandler);
router.post('/:id/restore', authenticateToken, restoreSocialCardHandler);
router.post('/:id/duplicate', authenticateToken, duplicateSocialCardHandler);
router.patch('/:id', authenticateToken, updateSocialCardHandler);
router.delete('/:id', authenticateToken, deleteSocialCardHandler);

export default router;
