import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns service health', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'fraud-case',
    });
  });
});
