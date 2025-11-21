const request = require('supertest');
const app = require('../index'); // this uses module.exports = app from index.js

describe('GET /api/contribution', () => {
  it('returns mock user and derived data', async () => {
    const res = await request(app).get('/api/contribution');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('annualSalary');
    expect(res.body.user).toHaveProperty('ytdContributions');
    expect(res.body.user).toHaveProperty('currentBalance');

    expect(res.body).toHaveProperty('derived');
    expect(res.body.derived).toHaveProperty('yearsToRetirement');
    expect(res.body.derived).toHaveProperty('perPaycheckContribution');
  });
});

describe('POST /api/contribution', () => {
  it('accepts a valid percent contribution', async () => {
    const payload = { contributionType: 'percent', contributionValue: 10 };

    const res = await request(app)
      .post('/api/contribution')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.settings).toMatchObject(payload);
  });

  it('accepts a valid dollar contribution', async () => {
    const payload = { contributionType: 'dollar', contributionValue: 500 };

    const res = await request(app)
      .post('/api/contribution')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(200);
    expect(res.body.settings).toMatchObject(payload);
  });

  it('rejects invalid contributionType', async () => {
    const res = await request(app)
      .post('/api/contribution')
      .send({ contributionType: 'bananas', contributionValue: 10 })
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects negative contributionValue', async () => {
    const res = await request(app)
      .post('/api/contribution')
      .send({ contributionType: 'percent', contributionValue: -5 })
      .set('Content-Type', 'application/json');

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('persists last saved settings (POST then GET)', async () => {
    const payload = { contributionType: 'percent', contributionValue: 18 };

    await request(app)
      .post('/api/contribution')
      .send(payload)
      .set('Content-Type', 'application/json');

    const res = await request(app).get('/api/contribution');

    expect(res.statusCode).toBe(200);
    expect(res.body.contributionSettings).toMatchObject(payload);
  });
});
