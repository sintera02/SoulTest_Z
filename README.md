# SoulTest: Your Private Dating Personality Test

SoulTest is a cutting-edge, privacy-preserving personality assessment tool designed to help individuals discover their ideal romantic matches without compromising their personal data. Powered by Zama’s Fully Homomorphic Encryption (FHE) technology, SoulTest ensures that your sensitive responses remain confidential while enabling meaningful personality analysis.

## The Problem

In today’s digital age, traditional personality tests often require users to disclose personal information and responses in cleartext. This poses significant privacy risks and may lead to unauthorized access to individuals’ sensitive data. Such exposure can have serious implications, especially in the intimate realm of dating, where confidentiality and trust are paramount. The challenge lies in providing users with valuable insights while ensuring that their privacy is never compromised.

## The Zama FHE Solution

SoulTest addresses these privacy concerns through the innovative application of Fully Homomorphic Encryption. By utilizing Zama’s FHE capabilities, we can perform computations on encrypted data, allowing us to process users' responses without ever revealing the underlying information. This means users can confidently engage with our personality test and receive tailored recommendations without the fear of their data being exposed.

Using the FHE technology, we ensure that the personality analysis and matchmaking algorithms operate seamlessly on encrypted inputs, preserving user privacy at every step.

## Key Features

- 🔒 **Complete Data Privacy:** Your answers are encrypted, ensuring that your personal information remains secure throughout the process.
- 🔍 **Homomorphic Personality Analysis:** Leverage advanced homomorphic computations to derive personality insights without decrypting data.
- 💘 **Soulmate Matching:** Receive personalized match suggestions based on your encrypted personality profile.
- 📊 **Dynamic Reports:** Get detailed personality reports based on encrypted test responses—no personal information is ever revealed.
- ✔️ **User-Friendly Interface:** An intuitive and engaging experience for users to discover themselves and connect with potential partners.

## Technical Architecture & Stack

SoulTest is built on a robust technical stack that integrates various state-of-the-art components, with Zama FHE technology at its core.

- **Core Privacy Engine:**
  - Zama's FHE (fhEVM) for secure processing of user data.

- **Frontend:**
  - React for creating an interactive user experience.

- **Backend:**
  - Node.js to handle API requests and responses.

- **Database:**
  - Encrypted storage for user data.

- **Testing Framework:**
  - Jest for unit and integration testing to ensure code reliability.

## Smart Contract / Core Logic

Here’s a simplified example of how the encryption and computing would work within SoulTest. The following pseudo-code demonstrates how we might handle encrypted answers using a Zama-powered approach:

```solidity
pragma solidity ^0.8.0;

contract SoulTest {
    function processAnswers(uint64 encryptedAnswer) public returns (uint64) {
        // Perform homomorphic encryption operation on the encrypted answer
        uint64 analyzedData = TFHE.add(encryptedAnswer, 42); // Hypothetical analysis example
        return analyzedData;
    }
}
```

This Solidity snippet exemplifies how encrypted answers could be processed securely while maintaining user confidentiality.

## Directory Structure

The project has the following structure:

```
SoulTest/
├── src/
│   ├── components/
│   │   ├── PersonalityTest.js
│   │   └── Report.js
│   ├── services/
│   │   └── EncryptionService.js
│   ├── App.js
│   └── index.js
├── smart_contracts/
│   └── SoulTest.sol
├── tests/
│   └── SoulTest.test.js
├── package.json
└── README.md
```

## Installation & Setup

To get started with SoulTest, follow these steps:

### Prerequisites

Make sure you have Node.js and npm installed on your machine.

### Installation Steps

1. **Install Dependencies:**
   Run the following command to install the necessary packages and Zama library:
   ```
   npm install
   npm install concrete-ml
   ```

2. **Set up the Smart Contract:**
   Navigate to the `smart_contracts` directory and install the required dependencies for Solidity development.

3. **Configure Environment Variables:**
   Set up any necessary environment variables for your application in a `.env` file.

## Build & Run

Once you have installed all dependencies, you can build and run the application using the following commands:

1. **Compile the Smart Contract:**
   ```
   npx hardhat compile
   ```

2. **Run the Application:**
   ```
   npm start
   ```

3. **Run Tests:**
   ```
   npm test
   ```

## Acknowledgements

SoulTest would not be possible without the incredible work done by Zama, which provides the open-source Fully Homomorphic Encryption primitives essential for ensuring privacy and security in our project. We extend our heartfelt thanks to the Zama team for their pioneering efforts in advancing the field of encrypted computation.

## Conclusion

SoulTest marries the art of personality matching with the science of data privacy, creating a unique experience for users seeking connection without compromising their personal information. By leveraging Zama’s FHE technology, we are ushering in a new era of secure and confidential online interactions. Join us on this journey of self-discovery and meaningful connections, all while keeping your data secure.


