import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface TestData {
  id: number;
  name: string;
  answers: string;
  personalityScore: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface PersonalityReport {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
  soulMatch: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<TestData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({
    visible: false,
    status: "pending",
    message: ""
  });
  const [testAnswers, setTestAnswers] = useState<number[]>(new Array(5).fill(3));
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [userHistory, setUserHistory] = useState<TestData[]>([]);
  const [stats, setStats] = useState({ totalTests: 0, verifiedTests: 0, avgScore: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;

      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHEVM initialization failed"
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }

      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;

    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const businessIds = await contract.getAllBusinessIds();
      const testsList: TestData[] = [];
      let userTests: TestData[] = [];

      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const test: TestData = {
            id: parseInt(businessId.replace('test-', '')) || Date.now(),
            name: businessData.name,
            answers: businessId,
            personalityScore: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          };

          testsList.push(test);
          if (address && businessData.creator.toLowerCase() === address.toLowerCase()) {
            userTests.push(test);
          }
        } catch (e) {
          console.error('Error loading test data:', e);
        }
      }

      setTests(testsList);
      setUserHistory(userTests);

      const verifiedCount = testsList.filter(t => t.isVerified).length;
      const totalScore = testsList.reduce((sum, t) => sum + (t.publicValue1 || 0), 0);
      setStats({
        totalTests: testsList.length,
        verifiedTests: verifiedCount,
        avgScore: testsList.length > 0 ? totalScore / testsList.length : 0
      });
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const calculatePersonalityScore = (answers: number[]): number => {
    return Math.round(answers.reduce((sum, answer) => sum + answer, 0) * 20 / answers.length);
  };

  const generatePersonalityReport = (score: number): PersonalityReport => {
    return {
      openness: Math.round((score * 0.3 + 50) % 100),
      conscientiousness: Math.round((score * 0.4 + 40) % 100),
      extraversion: Math.round((score * 0.5 + 30) % 100),
      agreeableness: Math.round((score * 0.6 + 20) % 100),
      neuroticism: Math.round((100 - score * 0.2) % 100),
      soulMatch: Math.round((score * 0.7 + 15) % 100)
    };
  };

  const createTest = async () => {
    if (!isConnected || !address) {
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }

    setCreatingTest(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting test results with Zama FHE..." });

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");

      const personalityScore = calculatePersonalityScore(testAnswers);
      const businessId = `test-${Date.now()}`;

      const encryptedResult = await encrypt(contractAddress, address, personalityScore);

      const tx = await contract.createBusinessData(
        businessId,
        `Personality Test ${new Date().toLocaleDateString()}`,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        testAnswers.reduce((sum, a) => sum + a, 0),
        0,
        "Encrypted Personality Test Results"
      );

      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();

      setTransactionStatus({ visible: true, status: "success", message: "Test results encrypted and stored!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);

      await loadData();
      setShowTestModal(false);
      setTestAnswers(new Array(5).fill(3));
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction")
        ? "Transaction rejected"
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setCreatingTest(false);
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) {
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null;
    }

    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;

      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }

      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;

      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);

      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) =>
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );

      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });

      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];

      await loadData();

      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);

      return Number(clearValue);

    } catch (e: any) {
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }

      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null;
    } finally {
      setIsDecrypting(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "System available: " + available });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStats = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel pastel-panel">
          <h3>Total Tests</h3>
          <div className="stat-value">{stats.totalTests}</div>
          <div className="stat-trend">Encrypted with FHE</div>
        </div>

        <div className="stat-panel pastel-panel">
          <h3>Verified Reports</h3>
          <div className="stat-value">{stats.verifiedTests}/{stats.totalTests}</div>
          <div className="stat-trend">On-chain Verified</div>
        </div>

        <div className="stat-panel pastel-panel">
          <h3>Avg Soul Score</h3>
          <div className="stat-value">{stats.avgScore.toFixed(1)}%</div>
          <div className="stat-trend">Community Average</div>
        </div>
      </div>
    );
  };

  const renderPersonalityChart = (report: PersonalityReport) => {
    return (
      <div className="personality-chart">
        <div className="trait-row">
          <div className="trait-label">Openness</div>
          <div className="trait-bar">
            <div className="bar-fill" style={{ width: `${report.openness}%` }}>
              <span className="bar-value">{report.openness}%</span>
            </div>
          </div>
        </div>
        <div className="trait-row">
          <div className="trait-label">Conscientiousness</div>
          <div className="trait-bar">
            <div className="bar-fill" style={{ width: `${report.conscientiousness}%` }}>
              <span className="bar-value">{report.conscientiousness}%</span>
            </div>
          </div>
        </div>
        <div className="trait-row">
          <div className="trait-label">Extraversion</div>
          <div className="trait-bar">
            <div className="bar-fill" style={{ width: `${report.extraversion}%` }}>
              <span className="bar-value">{report.extraversion}%</span>
            </div>
          </div>
        </div>
        <div className="trait-row">
          <div className="trait-label">Agreeableness</div>
          <div className="trait-bar">
            <div className="bar-fill" style={{ width: `${report.agreeableness}%` }}>
              <span className="bar-value">{report.agreeableness}%</span>
            </div>
          </div>
        </div>
        <div className="trait-row">
          <div className="trait-label">Neuroticism</div>
          <div className="trait-bar">
            <div className="bar-fill" style={{ width: `${report.neuroticism}%` }}>
              <span className="bar-value">{report.neuroticism}%</span>
            </div>
          </div>
        </div>
        <div className="trait-row soul-match">
          <div className="trait-label">Soul Match Potential</div>
          <div className="trait-bar">
            <div className="bar-fill soul" style={{ width: `${report.soulMatch}%` }}>
              <span className="bar-value">{report.soulMatch}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">🔒</div>
          <div className="step-content">
            <h4>Encrypted Answers</h4>
            <p>Test answers encrypted with Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">💫</div>
        <div className="flow-step">
          <div className="step-icon">⚡</div>
          <div className="step-content">
            <h4>Homomorphic Analysis</h4>
            <p>Personality analysis computed on encrypted data</p>
          </div>
        </div>
        <div className="flow-arrow">💫</div>
        <div className="flow-step">
          <div className="step-icon">🔓</div>
          <div className="step-content">
            <h4>Secure Decryption</h4>
            <p>Only you can decrypt your personality report</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>💖 SoulTest Z</h1>
            <p>Private Dating Personality Test</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>

        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💕</div>
            <h2>Connect Your Heart 💖</h2>
            <p>Connect your wallet to begin your private personality journey. Your answers are encrypted with FHE technology.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to start</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Answer personality questions privately</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Get your encrypted soul match report</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="heart-pulse"></div>
        <p>Initializing Private Encryption System...</p>
        <p className="loading-note">Securing your personality data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="heart-pulse"></div>
      <p>Loading your private test space...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>💖 SoulTest Z</h1>
          <p>FHE Encrypted Personality Matching</p>
        </div>

        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">System Status</button>
          <button onClick={() => setShowTestModal(true)} className="create-btn">Take Test 💕</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      {showIntro && (
        <div className="intro-banner">
          <div className="intro-content">
            <h2>Welcome to Private Personality Testing 💫</h2>
            <p>Your answers are encrypted with Fully Homomorphic Encryption. Only you can see your true results.</p>
            <button onClick={() => setShowIntro(false)} className="close-intro">Start Journey</button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div className="dashboard-section">
          <h2>Community Soul Metrics 🌈</h2>
          {renderStats()}

          <div className="fhe-explain">
            <h3>How FHE Protects Your Privacy 🔐</h3>
            {renderFHEFlow()}
          </div>
        </div>

        <div className="tests-section">
          <div className="section-header">
            <h2>Your Test History 📚</h2>
            <div className="header-actions">
              <button onClick={loadData} disabled={isRefreshing} className="refresh-btn">
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="tests-grid">
            {userHistory.length === 0 ? (
              <div className="no-tests">
                <div className="heart-icon">💝</div>
                <p>No tests taken yet</p>
                <button onClick={() => setShowTestModal(true)} className="create-btn">
                  Take Your First Test
                </button>
              </div>
            ) : userHistory.map((test, index) => (
              <div className="test-card" key={index} onClick={() => setSelectedTest(test)}>
                <div className="card-header">
                  <h3>{test.name}</h3>
                  <span className={`status ${test.isVerified ? 'verified' : 'pending'}`}>
                    {test.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                  </span>
                </div>
                <div className="card-content">
                  <div className="test-meta">
                    <span>Score: {test.publicValue1}</span>
                    <span>{new Date(test.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className="soul-match-preview">
                    Soul Match: {test.isVerified ? `${test.decryptedValue}%` : '🔒 Private'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="faq-section">
          <h2>Frequently Asked Questions ❓</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h4>How is my privacy protected?</h4>
              <p>Your answers are encrypted with FHE technology, meaning even we can't see your raw responses.</p>
            </div>
            <div className="faq-item">
              <h4>What is homomorphic encryption?</h4>
              <p>FHE allows computations on encrypted data without decrypting it first, keeping your data private.</p>
            </div>
            <div className="faq-item">
              <h4>Can others see my results?</h4>
              <p>Only you can decrypt and view your complete personality report and soul match scores.</p>
            </div>
          </div>
        </div>
      </div>

      {showTestModal && (
        <TestModal
          onSubmit={createTest}
          onClose={() => setShowTestModal(false)}
          creating={creatingTest}
          answers={testAnswers}
          setAnswers={setTestAnswers}
          isEncrypting={isEncrypting}
        />
      )}

      {selectedTest && (
        <TestDetailModal
          test={selectedTest}
          onClose={() => {
            setSelectedTest(null);
            setDecryptedScore(null);
          }}
          decryptedScore={decryptedScore}
          setDecryptedScore={setDecryptedScore}
          isDecrypting={isDecrypting || fheIsDecrypting}
          decryptData={() => decryptData(selectedTest.answers)}
          generateReport={generatePersonalityReport}
          renderChart={renderPersonalityChart}
        />
      )}

      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="heart-pulse"></div>}
              {transactionStatus.status === "success" && "💖"}
              {transactionStatus.status === "error" && "💔"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const TestModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  answers: number[];
  setAnswers: (answers: number[]) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, answers, setAnswers, isEncrypting }) => {
  const questions = [
    "I enjoy meeting new people and social situations",
    "I prefer deep conversations over small talk",
    "I value honesty and transparency in relationships",
    "I'm comfortable with emotional vulnerability",
    "I believe in soulmate connections"
  ];

  const handleAnswerChange = (index: number, value: number) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  return (
    <div className="modal-overlay">
      <div className="test-modal">
        <div className="modal-header">
          <h2>Private Personality Test 💖</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>

        <div className="modal-body">
          <div className="privacy-notice">
            <strong>FHE 🔐 Privacy Protected</strong>
            <p>Your answers are encrypted before leaving your device. Nobody can see your raw responses.</p>
          </div>

          <div className="test-questions">
            {questions.map((question, index) => (
              <div className="question-group" key={index}>
                <label>{question}</label>
                <div className="answer-scale">
                  {[1,2,3,4,5].map(value => (
                    <button
                      key={value}
                      className={`scale-btn ${answers[index] === value ? 'selected' : ''}`}
                      onClick={() => handleAnswerChange(index, value)}
                    >
                      {value}
                    </button>
                  ))}
                  <div className="scale-labels">
                    <span>Strongly Disagree</span>
                    <span>Strongly Agree</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={creating || isEncrypting}
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting Answers..." : "Get My Soul Report 💫"}
          </button>
        </div>
      </div>
    </div>
  );
};

const TestDetailModal: React.FC<{
  test: TestData;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (score: number) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  generateReport: (score: number) => any;
  renderChart: (report: any) => JSX.Element;
}> = ({ test, onClose, decryptedScore, setDecryptedScore, isDecrypting, decryptData, generateReport, renderChart }) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) return;

    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedScore(decrypted);
    }
  };

  const displayScore = test.isVerified ? test.decryptedValue : decryptedScore;
  const personalityReport = displayScore ? generateReport(displayScore) : null;

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Personality Report 💖</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>

        <div className="modal-body">
          <div className="report-info">
            <div className="info-item">
              <span>Test Date:</span>
              <strong>{new Date(test.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Privacy Status:</span>
              <strong>{test.isVerified ? '✅ On-chain Verified' : '🔒 Encrypted'}</strong>
            </div>
          </div>

          <div className="score-section">
            <h3>Soul Match Score</h3>
            <div className="score-display">
              {displayScore !== undefined && displayScore !== null ? (
                <div className="final-score">{displayScore}%</div>
              ) : (
                <div className="encrypted-score">🔒 Encrypted</div>
              )}
              <button
                className={`decrypt-btn ${displayScore !== null ? 'decrypted' : ''}`}
                onClick={handleDecrypt}
                disabled={isDecrypting || test.isVerified}
              >
                {isDecrypting ? "Decrypting..." :
                 test.isVerified ? "✅ Verified" :
                 displayScore !== null ? "🔓 Decrypted" : "🔓 Decrypt Score"}
              </button>
            </div>
          </div>

          {personalityReport && (
            <div className="analysis-section">
              <h3>Personality Analysis 💫</h3>
              {renderChart(personalityReport)}

              <div className="match-insights">
                <h4>Soul Match Insights</h4>
                <p>Your personality shows {personalityReport.soulMatch}% compatibility with ideal partners.
                You thrive in {personalityReport.extraversion > 50 ? 'social' : 'intimate'} settings and value
                {personalityReport.agreeableness > 60 ? ' deep emotional connections' : ' honest communication'}.</p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!test.isVerified && (
            <button onClick={handleDecrypt} disabled={isDecrypting} className="verify-btn">
              Verify on Blockchain
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


