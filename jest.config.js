module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
    '^.+\\.tsx?$': 'ts-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(ethers|@ethersproject|@openzeppelin)/)',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/tests/empty.module.js',
  },
  testTimeout: 30000,
};
