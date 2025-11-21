const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// ---- Mock user data ----
let userContributionSettings = {
  contributionType: 'percent',
  contributionValue: 8,
};

const mockUser = {
  name: 'Swapnil Example',
  annualSalary: 80000,
  payPeriodsPerYear: 26,
  age: 30,
  retirementAge: 65,
  ytdContributions: 6500,
  currentBalance: 25000,
};

// Projection math
function projectRetirementBalance({
  currentBalance,
  annualContribution,
  years,
  annualReturnRate = 0.05,
}) {
  const r = annualReturnRate;
  const n = years;

  const futureOfCurrent = currentBalance * Math.pow(1 + r, n);

  let futureOfContribs;
  if (r === 0) {
    futureOfContribs = annualContribution * n;
  } else {
    futureOfContribs = annualContribution * ((Math.pow(1 + r, n) - 1) / r);
  }

  return futureOfCurrent + futureOfContribs;
}

function computeAnnualContribution(settings) {
  const { annualSalary, payPeriodsPerYear } = mockUser;

  if (settings.contributionType === 'percent') {
    const percent = settings.contributionValue / 100.0;
    return annualSalary * percent;
  } else {
    return settings.contributionValue * payPeriodsPerYear;
  }
}

// GET endpoint
app.get('/api/contribution', (req, res) => {
  const yearsToRetirement = mockUser.retirementAge - mockUser.age;

  const currentAnnualContribution = computeAnnualContribution(userContributionSettings);
  const projectedBalance = projectRetirementBalance({
    currentBalance: mockUser.currentBalance,
    annualContribution: currentAnnualContribution,
    years: yearsToRetirement,
  });

  const baselineAnnualContribution = 0;
  const baselineProjection = projectRetirementBalance({
    currentBalance: mockUser.currentBalance,
    annualContribution: baselineAnnualContribution,
    years: yearsToRetirement,
  });

  const perPaycheckContribution =
    userContributionSettings.contributionType === 'percent'
      ? (mockUser.annualSalary / mockUser.payPeriodsPerYear) *
        (userContributionSettings.contributionValue / 100.0)
      : userContributionSettings.contributionValue;

  res.json({
    user: mockUser,
    contributionSettings: userContributionSettings,
    derived: {
      perPaycheckContribution,
      yearsToRetirement,
      projectedBalance,
      baselineProjection,
      incrementalGain: projectedBalance - baselineProjection,
    },
  });
});

// POST endpoint
app.post('/api/contribution', (req, res) => {
  const { contributionType, contributionValue } = req.body;

  if (!['percent', 'dollar'].includes(contributionType)) {
    return res.status(400).json({ error: 'Invalid contributionType' });
  }

  const num = Number(contributionValue);
  if (Number.isNaN(num) || num < 0) {
    return res.status(400).json({ error: 'Invalid contributionValue' });
  }

  userContributionSettings = {
    contributionType,
    contributionValue: num,
  };

  return res.json({ success: true, settings: userContributionSettings });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
module.exports = app;
