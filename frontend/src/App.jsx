import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// ---- projection helper (same logic as backend) ----
function projectRetirementBalance({
  currentBalance,
  annualContribution,
  years,
  annualReturnRate,
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

const SCENARIOS = [
  { id: 'conservative', label: 'Conservative (3%)', rate: 0.03 },
  { id: 'moderate', label: 'Moderate (5%)', rate: 0.05 },
  { id: 'aggressive', label: 'Aggressive (7%)', rate: 0.07 },
];

function App() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [contributionType, setContributionType] = useState('percent');
  const [contributionValue, setContributionValue] = useState(0);

  const [selectedScenario, setSelectedScenario] = useState('moderate');
  const [employerMatchEnabled, setEmployerMatchEnabled] = useState(true);
  const [matchRate, setMatchRate] = useState(100); // 100% match
  const [maxMatchPercent, setMaxMatchPercent] = useState(3); // up to 3% of salary

  // ---- fetch initial data from backend ----
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('http://localhost:4000/api/contribution');
        const json = await res.json();
        setData(json);
        setContributionType(json.contributionSettings.contributionType);
        setContributionValue(json.contributionSettings.contributionValue);
      } catch (err) {
        console.error(err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('http://localhost:4000/api/contribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributionType,
          contributionValue: Number(contributionValue),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to save settings');
      } else {
        const refreshed = await fetch('http://localhost:4000/api/contribution');
        const refreshedJson = await refreshed.json();
        setData(refreshedJson);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleTypeChange(type) {
    setContributionType(type);
  }

  function handleValueChange(e) {
    const value = e.target.value;
    if (value === '') {
      setContributionValue('');
      return;
    }
    const num = Number(value);
    if (!Number.isNaN(num)) {
      setContributionValue(num);
    }
  }

  // ---- SAFE derived values so hooks order never changes ----
  const isPercent = contributionType === 'percent';
  const isLoading = loading || !data;

  const fallbackUser = {
    annualSalary: 0,
    payPeriodsPerYear: 1,
    age: 30,
    retirementAge: 65,
    ytdContributions: 0,
    currentBalance: 0,
  };

  const fallbackDerived = {
    perPaycheckContribution: 0,
    yearsToRetirement: 35,
    projectedBalance: 0,
    baselineProjection: 0,
    incrementalGain: 0,
  };

  const user = data?.user ?? fallbackUser;
  const derived = data?.derived ?? fallbackDerived;

  // live per-paycheck contribution based on slider + type
  const perPaycheckContribution =
    contributionType === 'percent'
      ? (user.annualSalary / user.payPeriodsPerYear) *
        ((Number(contributionValue) || 0) / 100)
      : Number(contributionValue) || 0;

  const annualEmployeeContribution =
    perPaycheckContribution * user.payPeriodsPerYear;

  const sliderMin = 0;
  const sliderMax = isPercent ? 50 : 5000;
  const sliderStep = isPercent ? 1 : 50;

  // ---- Scenario + employer match calculations (always run, but safe with fallbacks) ----
  const {
    scenariosWithProjections,
    selectedScenarioData,
    annualEmployerContribution,
  } = useMemo(() => {
    const yearsToRetirement = derived.yearsToRetirement;
    const currentBalance = user.currentBalance;

    // use the live annual contribution from the slider
    const annualEmployeeContributionLocal = annualEmployeeContribution;

    const maxMatchDollars =
      (user.annualSalary * maxMatchPercent) / 100.0;

    const employerContributionRaw =
      Math.min(annualEmployeeContributionLocal, maxMatchDollars) *
      (matchRate / 100.0);

    const annualEmployerContributionLocal = employerMatchEnabled
      ? employerContributionRaw
      : 0;

    const scenariosWithProjectionsLocal = SCENARIOS.map((scenario) => {
      const base = projectRetirementBalance({
        currentBalance,
        annualContribution: annualEmployeeContributionLocal,
        years: yearsToRetirement,
        annualReturnRate: scenario.rate,
      });

      const withMatch = projectRetirementBalance({
        currentBalance,
        annualContribution:
          annualEmployeeContributionLocal + annualEmployerContributionLocal,
        years: yearsToRetirement,
        annualReturnRate: scenario.rate,
      });

      return {
        ...scenario,
        projectedBalance: base,
        projectedBalanceWithMatch: withMatch,
      };
    });

    const selectedScenarioDataLocal =
      scenariosWithProjectionsLocal.find((s) => s.id === selectedScenario) ||
      scenariosWithProjectionsLocal[1]; // default moderate

    return {
      scenariosWithProjections: scenariosWithProjectionsLocal,
      selectedScenarioData: selectedScenarioDataLocal,
      annualEmployerContribution: annualEmployerContributionLocal,
    };
  }, [
    derived.yearsToRetirement,
    user.currentBalance,
    user.annualSalary,
    user.payPeriodsPerYear,
    employerMatchEnabled,
    matchRate,
    maxMatchPercent,
    selectedScenario,
    annualEmployeeContribution, // depends on slider + type
  ]);

  const projectedForDisplay = employerMatchEnabled
    ? selectedScenarioData.projectedBalanceWithMatch
    : selectedScenarioData.projectedBalance;

  const incrementalGain = projectedForDisplay - user.currentBalance;


  // ---- Chart data ----
  const chartData = {
    labels: ['Conservative (3%)', 'Moderate (5%)', 'Aggressive (7%)'],
    datasets: [
      {
        label: 'Projected balance with employer match',
        data: [
          scenariosWithProjections[0].projectedBalanceWithMatch,
          scenariosWithProjections[1].projectedBalanceWithMatch,
          scenariosWithProjections[2].projectedBalanceWithMatch,
        ],
        borderColor: '#FFFFFF',           // ⚪ pure white line
        borderWidth: 3,                   // thicker
        pointBackgroundColor: '#FFFFFF',  // white points
        pointBorderColor: '#FFFFFF',
        pointRadius: 5,                    // visible
        pointHoverRadius: 7,
        tension: 0.3,                      // smooth curve
        fill: false,                       // no fading under the graph
      }
    ]
  };
  

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#e5e7eb',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) =>
            `$${context.parsed.y.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
      },
      y: {
        ticks: {
          color: '#9ca3af',
          callback: (value) =>
            `$${Number(value).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}`,
        },
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
      },
    },
  };

  // ---- JSX ----
  return (
    <div style={styles.page}>
      {isLoading ? (
        <div style={styles.loadingText}>Loading your plan…</div>
      ) : (
        <motion.div
          style={styles.card}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <motion.header
            style={styles.header}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 style={styles.title}>401(k) Contribution Settings</h1>
            <p style={styles.subtitle}>
              Adjust how much of your paycheck goes into your retirement
              savings. Explore different market scenarios and employer match
              options to see your potential future balance.
            </p>
          </motion.header>

          {/* Contribution type + amount */}
          <motion.section
            style={styles.section}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
          >
            <h2 style={styles.sectionTitle}>Contribution Type</h2>
            <div style={styles.toggleGroup}>
              <button
                style={{
                  ...styles.toggleButton,
                  ...(isPercent ? styles.toggleButtonActive : {}),
                }}
                onClick={() => handleTypeChange('percent')}
              >
                % of paycheck
              </button>
              <button
                style={{
                  ...styles.toggleButton,
                  ...(!isPercent ? styles.toggleButtonActive : {}),
                }}
                onClick={() => handleTypeChange('dollar')}
              >
                $ per paycheck
              </button>
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <h2 style={styles.sectionTitle}>Contribution Amount</h2>
              <div style={styles.row}>
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={sliderStep}
                  value={contributionValue}
                  onChange={(e) =>
                    setContributionValue(Number(e.target.value))
                  }
                  style={{ flex: 1, marginRight: '1rem' }}
                />
                <div style={styles.valueInput}>
                  <span style={{ marginRight: 4 }}>
                    {isPercent ? '%' : '$'}
                  </span>
                  <input
                    type="number"
                    value={contributionValue}
                    onChange={handleValueChange}
                    style={styles.numberInput}
                  />
                </div>
              </div>
              <p style={styles.helperText}>
                {isPercent
                  ? `You are saving ${contributionValue || 0}% of each paycheck.`
                  : `You are saving $${contributionValue || 0} from each paycheck.`}
              </p>
            </div>
          </motion.section>

          {/* Snapshot */}
          <motion.section
            style={styles.section}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 style={styles.sectionTitle}>Your Current 401(k) Snapshot</h2>
            <div style={styles.infoGrid}>
              <InfoCard
                label="Annual Salary"
                value={`$${user.annualSalary.toLocaleString()}`}
              />
              <InfoCard
                label="Pay periods / year"
                value={user.payPeriodsPerYear}
              />
              <InfoCard
                label="YTD Contributions"
                value={`$${user.ytdContributions.toLocaleString()}`}
              />
              <InfoCard
                label="Current Balance"
                value={`$${user.currentBalance.toLocaleString()}`}
              />
              <InfoCard
                label="Per-paycheck contribution"
                value={`$${perPaycheckContribution.toFixed(2)}`}
              />
              <InfoCard
                label="Annual employee contribution"
                value={`$${annualEmployeeContribution
                  .toFixed(0)
                  .toLocaleString()}`}
              />

              <InfoCard
                label="Annual employer contribution"
                value={
                  employerMatchEnabled
                    ? `~$${annualEmployerContribution
                        .toFixed(0)
                        .toLocaleString()}`
                    : '$0'
                }
              />
            </div>
          </motion.section>

          {/* Scenario simulator / employer match */}
          <motion.section
            style={styles.section}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <h2 style={styles.sectionTitle}>Market Scenario & Employer Match</h2>

            <div style={styles.scenarioRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.scenarioLabel}>Market scenario</div>
                <div style={styles.scenarioButtons}>
                  {SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      style={{
                        ...styles.scenarioButton,
                        ...(selectedScenario === scenario.id
                          ? styles.scenarioButtonActive
                          : {}),
                      }}
                      onClick={() => setSelectedScenario(scenario.id)}
                    >
                      {scenario.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.matchContainer}>
                <div style={styles.scenarioLabel}>Employer match</div>
                <label style={styles.switchLabel}>
                  <input
                    type="checkbox"
                    checked={employerMatchEnabled}
                    onChange={(e) =>
                      setEmployerMatchEnabled(e.target.checked)
                    }
                  />
                  <span style={styles.switchFake}></span>
                  <span style={{ marginLeft: 8 }}>
                    {employerMatchEnabled ? 'Included' : 'Not included'}
                  </span>
                </label>

                <div style={styles.matchInputs}>
                  <div style={styles.matchField}>
                    <span style={styles.matchLabel}>Match rate</span>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={matchRate}
                      onChange={(e) =>
                        setMatchRate(Number(e.target.value) || 0)
                      }
                      style={styles.matchInput}
                    />
                    <span style={styles.matchSuffix}>%</span>
                  </div>
                  <div style={styles.matchField}>
                    <span style={styles.matchLabel}>Max up to</span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={maxMatchPercent}
                      onChange={(e) =>
                        setMaxMatchPercent(Number(e.target.value) || 0)
                      }
                      style={styles.matchInput}
                    />
                    <span style={styles.matchSuffix}>% of salary</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Retirement impact + chart */}
          <motion.section
            style={styles.section}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 style={styles.sectionTitle}>Retirement Impact (Estimate)</h2>
            <p style={styles.helperText}>
              Assuming contributions stay at your current rate until age{' '}
              {user.retirementAge} and the selected market scenario.
            </p>

            <div style={styles.infoGrid}>
              <InfoCard
                label="Years to retirement"
                value={derived.yearsToRetirement}
              />
              <InfoCard
                label="Projected balance at retirement"
                value={`$${projectedForDisplay
                  .toFixed(0)
                  .toLocaleString()}`}
              />
              <InfoCard
                label={
                  employerMatchEnabled
                    ? 'Increment vs. saving nothing (incl. match)'
                    : 'Increment vs. saving nothing'
                }
                value={`+$${incrementalGain
                  .toFixed(0)
                  .toLocaleString()}`}
              />
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </motion.section>

          {error && <div style={styles.error}>{error}</div>}

          <motion.div
            style={{ marginTop: '1.75rem', textAlign: 'right' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            <button
              style={styles.saveButton}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save contribution rate'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// Reusable info card
function InfoCard({ label, value }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

// ---- styles (gradient + glassmorphism) ----
const styles = {
  page: {
    minHeight: '100vh',
    padding: '2.5rem',
    background:
      'radial-gradient(circle at top left, #1d4ed8 0, #020617 45%, #000000 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    color: '#e5e7eb',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  card: {
    maxWidth: '960px',
    width: '100%',
    padding: '2rem 2.25rem 2.5rem',
    borderRadius: '1.5rem',
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(148,163,184,0.35)',
    boxShadow:
      '0 24px 60px rgba(15,23,42,0.85), 0 0 0 1px rgba(15,23,42,0.9)',
    backdropFilter: 'blur(18px)',
  },
  header: {
    marginBottom: '1.5rem',
    textAlign: 'center'
  },
  title: {
    fontSize: '2rem',
    marginBottom: '0.4rem',
  },
  subtitle: {
    color: '#9ca3af',
    marginBottom: 0,
    lineHeight: 1.5,
  },
  section: {
    marginTop: '1.75rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    marginBottom: '0.75rem',
    letterSpacing: '0.02em',
  },
  toggleGroup: {
    display: 'flex',
    gap: '0.75rem',
    background: 'rgba(15,23,42,0.9)',
    borderRadius: '9999px',
    padding: '0.25rem',
    border: '1px solid rgba(148,163,184,0.5)',
  },
  toggleButton: {
    flex: 1,
    padding: '0.5rem 0.75rem',
    borderRadius: '9999px',
    border: 'none',
    background: 'transparent',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'background 150ms ease, color 150ms ease, transform 80ms',
  },
  toggleButtonActive: {
    background: '#22c55e',
    color: '#022c22',
    fontWeight: 600,
    boxShadow: '0 10px 25px rgba(34,197,94,0.5)',
    transform: 'translateY(-1px)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
  },
  valueInput: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(15,23,42,0.9)',
    borderRadius: '9999px',
    padding: '0.2rem 0.85rem',
    border: '1px solid rgba(148,163,184,0.6)',
  },
  numberInput: {
    width: '80px',
    border: 'none',
    background: 'transparent',
    color: '#e5e7eb',
    outline: 'none',
    textAlign: 'right',
  },
  helperText: {
    marginTop: '0.5rem',
    fontSize: '0.85rem',
    color: '#9ca3af',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: '0.9rem',
  },
  infoItem: {
    padding: '0.75rem 0.9rem',
    borderRadius: '1rem',
    background: 'rgba(15,23,42,0.85)',
    border: '1px solid rgba(55,65,81,0.9)',
  },
  infoLabel: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginBottom: '0.3rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  infoValue: {
    fontSize: '0.98rem',
    fontWeight: 600,
  },
  scenarioRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.25rem',
  },
  scenarioLabel: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '0.4rem',
  },
  scenarioButtons: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  scenarioButton: {
    padding: '0.4rem 0.8rem',
    borderRadius: '9999px',
    border: '1px solid rgba(148,163,184,0.6)',
    background: 'transparent',
    color: '#e5e7eb',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  scenarioButtonActive: {
    background: '#38bdf8',
    borderColor: '#38bdf8',
    color: '#0b1120',
    boxShadow: '0 10px 25px rgba(56,189,248,0.45)',
    fontWeight: 600,
  },
  matchContainer: {
    minWidth: '260px',
    padding: '0.75rem 0.9rem',
    borderRadius: '1rem',
    background: 'rgba(15,23,42,0.9)',
    border: '1px solid rgba(55,65,81,0.9)',
  },
  switchLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  switchFake: {
    width: '34px',
    height: '18px',
    borderRadius: '9999px',
    background: '#22c55e',
    position: 'relative',
    display: 'inline-block',
  },
  matchInputs: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.7rem',
  },
  matchField: {
    position: 'relative',
    flex: 1,
  },
  matchLabel: {
    fontSize: '0.7rem',
    color: '#9ca3af',
    marginBottom: '0.2rem',
    display: 'block',
  },
  matchInput: {
    width: '100%',
    padding: '0.35rem 1.8rem 0.35rem 0.5rem',
    borderRadius: '0.75rem',
    border: '1px solid rgba(148,163,184,0.7)',
    background: 'rgba(15,23,42,0.9)',
    color: '#e5e7eb',
    fontSize: '0.8rem',
    outline: 'none',
  },
  matchSuffix: {
    position: 'absolute',
    right: '0.45rem',
    top: '1.25rem',
    fontSize: '0.75rem',
    color: '#9ca3af',
  },
  error: {
    marginTop: '1rem',
    padding: '0.75rem',
    borderRadius: '0.75rem',
    background: '#7f1d1d',
    color: '#fee2e2',
    fontSize: '0.85rem',
  },
  saveButton: {
    padding: '0.7rem 1.8rem',
    borderRadius: '9999px',
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#022c22',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.95rem',
    boxShadow: '0 16px 35px rgba(34,197,94,0.5)',
  },
  loadingText: {
    color: '#e5e7eb',
    fontSize: '1rem',
  },
};

export default App;
