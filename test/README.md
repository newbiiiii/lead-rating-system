# Testing Guide

## Overview

This directory contains tests for the lead rating system, with a focus on testing the rating service without external dependencies like Redis or a real database.

## Structure

```
test/
├── setup.ts                    # Jest configuration and global setup
├── mocks/
│   ├── db.mock.ts              # In-memory database mock
│   └── openai.mock.ts          # OpenAI API mock
└── rating/
    ├── rating.worker.test.ts   # Rating worker tests
    └── prompt.test.ts          # Prompt construction tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run only rating tests
npm run test:rating

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Features

### 1. Database Mocking
- Uses in-memory storage instead of real Postgres
- No Redis dependency
- Factory functions for creating test data

### 2. OpenAI Mocking
- Simulates OpenAI API responses
- Configurable failure scenarios for retry testing
- Tracks API call counts

### 3. Test Coverage

#### Rating Worker Tests
- ✓ Basic functionality (successful rating, skip rated leads)
- ✓ Retry logic (network errors, API limits, validation errors)
- ✓ Data handling (JSON parsing, field validation)
- ✓ Error classification (retryable vs non-retryable)

#### Prompt Tests  
- ✓ Complete data scenarios
- ✓ Missing field handling
- ✓ rawData extraction
- ✓ Edge cases and special characters
- ✓ Real-world scenarios

## Notes

- Tests do NOT require running workers or Redis
- Tests do NOT make actual API calls
- Tests run completely isolated and deterministically
- All external dependencies are mocked

## Troubleshooting

If tests fail to run:
1. Ensure Jest and ts-jest are installed: `npm install`
2. Check that test files are in the correct locations
3. Verify jest.config.js exists and is properly configured
