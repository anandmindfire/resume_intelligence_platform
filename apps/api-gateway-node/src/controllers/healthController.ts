import { healthService } from '../services/healthService';

export async function getHealth() {
  return healthService.getHealthStatus();
}
