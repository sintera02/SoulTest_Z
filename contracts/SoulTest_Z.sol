pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedPersonalityTest is ZamaEthereumConfig {
    struct TestSession {
        address testTaker;
        uint256 startTime;
        uint256 completionTime;
        euint32[10] encryptedAnswers;
        uint32[10] decryptedAnswers;
        bool isVerified;
        bool reportGenerated;
    }

    struct PersonalityReport {
        uint32 openness;
        uint32 conscientiousness;
        uint32 extraversion;
        uint32 agreeableness;
        uint32 neuroticism;
        string matchRecommendation;
    }

    mapping(address => TestSession) public testSessions;
    mapping(address => PersonalityReport) public personalityReports;
    address[] public testTakers;

    event TestStarted(address indexed testTaker, uint256 startTime);
    event AnswerSubmitted(address indexed testTaker, uint256 questionIndex);
    event TestCompleted(address indexed testTaker, uint256 completionTime);
    event DecryptionVerified(address indexed testTaker);
    event ReportGenerated(address indexed testTaker);

    constructor() ZamaEthereumConfig() {}

    function startTest() external {
        require(testSessions[msg.sender].testTaker == address(0), "Test already started");
        
        testSessions[msg.sender] = TestSession({
            testTaker: msg.sender,
            startTime: block.timestamp,
            completionTime: 0,
            encryptedAnswers: new euint32[](10),
            decryptedAnswers: new uint32[](10),
            isVerified: false,
            reportGenerated: false
        });
        
        testTakers.push(msg.sender);
        
        emit TestStarted(msg.sender, block.timestamp);
    }

    function submitAnswer(
        uint256 questionIndex, 
        externalEuint32 encryptedAnswer,
        bytes calldata inputProof
    ) external {
        require(questionIndex < 10, "Invalid question index");
        require(testSessions[msg.sender].testTaker == msg.sender, "Test not started");
        require(testSessions[msg.sender].completionTime == 0, "Test already completed");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedAnswer, inputProof)), "Invalid encrypted input");
        
        testSessions[msg.sender].encryptedAnswers[questionIndex] = FHE.fromExternal(encryptedAnswer, inputProof);
        FHE.allowThis(testSessions[msg.sender].encryptedAnswers[questionIndex]);
        FHE.makePubliclyDecryptable(testSessions[msg.sender].encryptedAnswers[questionIndex]);
        
        emit AnswerSubmitted(msg.sender, questionIndex);
    }

    function completeTest() external {
        require(testSessions[msg.sender].testTaker == msg.sender, "Test not started");
        require(testSessions[msg.sender].completionTime == 0, "Test already completed");
        
        testSessions[msg.sender].completionTime = block.timestamp;
        emit TestCompleted(msg.sender, block.timestamp);
    }

    function verifyDecryption(
        bytes[] memory abiEncodedClearValues,
        bytes[] memory decryptionProofs
    ) external {
        require(testSessions[msg.sender].testTaker == msg.sender, "Test not started");
        require(!testSessions[msg.sender].isVerified, "Decryption already verified");
        require(abiEncodedClearValues.length == 10, "Invalid answers count");
        require(decryptionProofs.length == 10, "Invalid proofs count");
        
        for (uint256 i = 0; i < 10; i++) {
            bytes32[] memory cts = new bytes32[](1);
            cts[0] = FHE.toBytes32(testSessions[msg.sender].encryptedAnswers[i]);
            
            FHE.checkSignatures(cts, abiEncodedClearValues[i], decryptionProofs[i]);
            
            testSessions[msg.sender].decryptedAnswers[i] = abi.decode(abiEncodedClearValues[i], (uint32));
        }
        
        testSessions[msg.sender].isVerified = true;
        emit DecryptionVerified(msg.sender);
    }

    function generateReport() external {
        require(testSessions[msg.sender].testTaker == msg.sender, "Test not started");
        require(testSessions[msg.sender].isVerified, "Decryption not verified");
        require(!testSessions[msg.sender].reportGenerated, "Report already generated");
        
        // Homomorphic personality analysis
        uint32[5] memory traits = calculatePersonalityTraits(testSessions[msg.sender].decryptedAnswers);
        
        // Generate match recommendation based on traits
        string memory recommendation = generateMatchRecommendation(traits);
        
        personalityReports[msg.sender] = PersonalityReport({
            openness: traits[0],
            conscientiousness: traits[1],
            extraversion: traits[2],
            agreeableness: traits[3],
            neuroticism: traits[4],
            matchRecommendation: recommendation
        });
        
        testSessions[msg.sender].reportGenerated = true;
        emit ReportGenerated(msg.sender);
    }

    function calculatePersonalityTraits(uint32[10] memory answers) private pure returns (uint32[5] memory) {
        // Simplified personality calculation
        uint32[5] memory traits;
        
        // Openness: questions 0-1
        traits[0] = (answers[0] + answers[1]) / 2;
        
        // Conscientiousness: questions 2-3
        traits[1] = (answers[2] + answers[3]) / 2;
        
        // Extraversion: questions 4-5
        traits[2] = (answers[4] + answers[5]) / 2;
        
        // Agreeableness: questions 6-7
        traits[3] = (answers[6] + answers[7]) / 2;
        
        // Neuroticism: questions 8-9
        traits[4] = (answers[8] + answers[9]) / 2;
        
        return traits;
    }

    function generateMatchRecommendation(uint32[5] memory traits) private pure returns (string memory) {
        // Simplified match recommendation logic
        if (traits[0] > 7 && traits[2] > 7) {
            return "Adventurous Explorer";
        } else if (traits[1] > 7 && traits[3] > 7) {
            return "Reliable Partner";
        } else if (traits[4] < 3 && traits[2] > 5) {
            return "Confident Leader";
        } else {
            return "Compatible Companion";
        }
    }

    function getTestSession(address testTaker) external view returns (
        uint256 startTime,
        uint256 completionTime,
        bool isVerified,
        bool reportGenerated
    ) {
        TestSession storage session = testSessions[testTaker];
        return (
            session.startTime,
            session.completionTime,
            session.isVerified,
            session.reportGenerated
        );
    }

    function getPersonalityReport(address testTaker) external view returns (
        uint32 openness,
        uint32 conscientiousness,
        uint32 extraversion,
        uint32 agreeableness,
        uint32 neuroticism,
        string memory matchRecommendation
    ) {
        PersonalityReport storage report = personalityReports[testTaker];
        return (
            report.openness,
            report.conscientiousness,
            report.extraversion,
            report.agreeableness,
            report.neuroticism,
            report.matchRecommendation
        );
    }

    function getAllTestTakers() external view returns (address[] memory) {
        return testTakers;
    }
}


