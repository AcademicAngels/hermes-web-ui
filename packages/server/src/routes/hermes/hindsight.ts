import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/hindsight'

export const hindsightRoutes = new Router()

hindsightRoutes.get('/api/hermes/hindsight/health', ctrl.health)
hindsightRoutes.get('/api/hermes/hindsight/banks', ctrl.banks)
hindsightRoutes.get('/api/hermes/hindsight/stats', ctrl.stats)
hindsightRoutes.post('/api/hermes/hindsight/retain', ctrl.retain)
hindsightRoutes.post('/api/hermes/hindsight/recall', ctrl.recall)
hindsightRoutes.post('/api/hermes/hindsight/reflect', ctrl.reflect)
hindsightRoutes.post('/api/hermes/hindsight/toggle', ctrl.toggleEnabled)
