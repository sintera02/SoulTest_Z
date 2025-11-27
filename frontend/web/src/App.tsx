import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface TestData {
  id: number;
  name: string;
  questionCount: number;
  compatibility: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<TestData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingTest, setCreatingTest] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newTestData, setNewTestData] = useState({ name: "", score: "", questionCount: "" });
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 5;

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed." 
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
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          testsList.push({
            id: parseInt(businessId.replace('test-', '')) || Date.now(),
            name: businessData.name,
            questionCount: Number(businessData.publicValue1) || 0,
            compatibility: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setTests(testsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createTest = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingTest(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating test with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const scoreValue = parseInt(newTestData.score) || 0;
      const businessId = `test-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, scoreValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newTestData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newTestData.questionCount) || 0,
        0,
        "Personality Test Result"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Test created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewTestData({ name: "", score: "", questionCount: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
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
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
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
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
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
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and working!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredTests = tests.filter(test => 
    test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    test.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastTest = currentPage * testsPerPage;
  const indexOfFirstTest = indexOfLastTest - testsPerPage;
  const currentTests = filteredTests.slice(indexOfFirstTest, indexOfLastTest);
  const totalPages = Math.ceil(filteredTests.length / testsPerPage);

  const renderPersonalityAnalysis = (test: TestData, decryptedScore: number | null) => {
    const score = test.isVerified ? (test.decryptedValue || 0) : (decryptedScore || 50);
    const personalityType = score >= 80 ? "Adventurous Soul" : 
                           score >= 60 ? "Balanced Dreamer" : 
                           score >= 40 ? "Practical Thinker" : "Sensitive Artist";
    
    const compatibility = Math.min(100, Math.round(score * 1.2));
    const emotionalDepth = Math.min(100, Math.round(score * 0.8 + 20));
    const socialEnergy = Math.min(100, Math.round(score * 1.1));

    return (
      <div className="personality-analysis">
        <div className="personality-type">
          <h4>Your Personality Type</h4>
          <div className="type-badge">{personalityType}</div>
        </div>
        
        <div className="trait-chart">
          <div className="trait-row">
            <div className="trait-label">Compatibility</div>
            <div className="trait-bar">
              <div className="bar-fill" style={{ width: `${compatibility}%` }}>
                <span className="trait-value">{compatibility}%</span>
              </div>
            </div>
          </div>
          <div className="trait-row">
            <div className="trait-label">Emotional Depth</div>
            <div className="trait-bar">
              <div className="bar-fill" style={{ width: `${emotionalDepth}%` }}>
                <span className="trait-value">{emotionalDepth}%</span>
              </div>
            </div>
          </div>
          <div className="trait-row">
            <div className="trait-label">Social Energy</div>
            <div className="trait-bar">
              <div className="bar-fill" style={{ width: `${socialEnergy}%` }}>
                <span className="trait-value">{socialEnergy}%</span>
              </div>
            </div>
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
            <h1>Private Dating Test 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💖</div>
            <h2>Connect Your Wallet to Discover Your Soulmate</h2>
            <p>Private personality matching with FHE encryption - your secrets stay with you.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing Private Matching System...</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading personality tests...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Dating Test 💖</h1>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="check-btn">
            Check System
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Test
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search tests or creators..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="tests-section">
          <div className="section-header">
            <h2>Personality Tests</h2>
            <div className="header-actions">
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="tests-list">
            {currentTests.length === 0 ? (
              <div className="no-tests">
                <p>No personality tests found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Test
                </button>
              </div>
            ) : currentTests.map((test, index) => (
              <div className="test-item" key={index} onClick={() => setSelectedTest(test)}>
                <div className="test-title">{test.name}</div>
                <div className="test-meta">
                  <span>Questions: {test.questionCount}</span>
                  <span>Created: {new Date(test.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="test-status">
                  {test.isVerified ? "✅ Verified" : "🔓 Ready for Verification"}
                </div>
                <div className="test-creator">By: {test.creator.substring(0, 6)}...{test.creator.substring(38)}</div>
              </div>
            ))}
          </div>
          
          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateTest 
          onSubmit={createTest} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingTest} 
          testData={newTestData} 
          setTestData={setNewTestData}
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
          decryptData={() => decryptData(selectedTest.compatibility)}
          renderPersonalityAnalysis={renderPersonalityAnalysis}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateTest: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  testData: any;
  setTestData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, testData, setTestData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'score') {
      const intValue = value.replace(/[^\d]/g, '');
      setTestData({ ...testData, [name]: intValue });
    } else {
      setTestData({ ...testData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-test-modal">
        <div className="modal-header">
          <h2>New Personality Test</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Privacy Protection</strong>
            <p>Your test score will be encrypted with Zama FHE 🔐</p>
          </div>
          
          <div className="form-group">
            <label>Test Name *</label>
            <input 
              type="text" 
              name="name" 
              value={testData.name} 
              onChange={handleChange} 
              placeholder="Enter test name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Test Score (Integer) *</label>
            <input 
              type="number" 
              name="score" 
              value={testData.score} 
              onChange={handleChange} 
              placeholder="Enter your score..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted</div>
          </div>
          
          <div className="form-group">
            <label>Question Count *</label>
            <input 
              type="number" 
              min="1" 
              name="questionCount" 
              value={testData.questionCount} 
              onChange={handleChange} 
              placeholder="Number of questions..." 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !testData.name || !testData.score || !testData.questionCount} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Create Test"}
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
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderPersonalityAnalysis: (test: TestData, decryptedScore: number | null) => JSX.Element;
}> = ({ test, onClose, decryptedScore, setDecryptedScore, isDecrypting, decryptData, renderPersonalityAnalysis }) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { 
      setDecryptedScore(null); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedScore(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="test-detail-modal">
        <div className="modal-header">
          <h2>Test Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="test-info">
            <div className="info-item">
              <span>Test Name:</span>
              <strong>{test.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{test.creator.substring(0, 6)}...{test.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(test.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Questions:</span>
              <strong>{test.questionCount}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Test Score</h3>
            
            <div className="data-row">
              <div className="data-label">Your Score:</div>
              <div className="data-value">
                {test.isVerified && test.decryptedValue ? 
                  `${test.decryptedValue} (Verified)` : 
                  decryptedScore !== null ? 
                  `${decryptedScore} (Decrypted)` : 
                  "🔒 Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(test.isVerified || decryptedScore !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : test.isVerified ? "✅ Verified" : decryptedScore !== null ? "🔄 Re-verify" : "🔓 Decrypt"}
              </button>
            </div>
          </div>
          
          {(test.isVerified || decryptedScore !== null) && (
            <div className="analysis-section">
              <h3>Personality Analysis</h3>
              {renderPersonalityAnalysis(test, decryptedScore)}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;