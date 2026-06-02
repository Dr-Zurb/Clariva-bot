# Backend Tests

This directory contains all test-related files for the backend.

## 📁 Directory Structure

```
tests/
├── integration/     # Integration/E2E test scripts
│   └── test-task8.ps1  # Task 8 production enhancements tests
├── unit/            # Unit tests (future - Jest/Vitest)
└── README.md        # This file
```

## 🧪 Test Types

### Integration Tests (`integration/`)

**Purpose:** End-to-end tests that verify the API works correctly by making actual HTTP requests.

**Current Tests:**
- `test-task8.ps1` - Tests Task 8 production enhancements:
  - Standardized response format (`{ success, data, meta }`)
  - Correlation ID support (`X-Correlation-ID` header)
  - X-Request-ID header support
  - UUID validation
  - Root endpoint response format
  - Input sanitization middleware

**How to Run:**
```powershell
# Make sure server is running first
npm run dev

# In another terminal, run the test script
cd tests/integration
.\test-task8.ps1
```

**Requirements:**
- Server must be running on `http://localhost:3000`
- PowerShell 5.1+ (Windows)
- Server must have completed startup (script waits 5 seconds)

### Unit Tests (`unit/`)

**Purpose:** Fast, isolated tests for individual functions and modules.

**Status:** Not yet implemented (future work)

**Planned Framework:** Jest or Vitest

---

## 📋 Test Coverage

### Current Coverage

✅ **Success Responses:**
- Health endpoint (`GET /health`)
- Root endpoint (`GET /`)

✅ **Headers:**
- Correlation ID generation
- X-Request-ID support
- X-Correlation-ID support (backward compatibility)
- UUID validation

✅ **Middleware:**
- Input sanitization (noted as active)

### Missing Coverage

❌ **Error Responses:**
- 404 Not Found (canonical format)
- 408 Request Timeout (canonical format)
- 413 Payload Too Large (canonical format)
- 429 Too Many Requests (rate limiter, canonical format)
- 500 Internal Server Error (canonical format)

❌ **Rate Limiting:**
- Rate limiter triggers correctly
- Error response format for rate limits

❌ **CORS:**
- Production CORS restrictions
- Development CORS permissiveness

---

## 🎯 Future Improvements

1. **Add Error Response Tests:**
   - Test all error status codes return canonical format
   - Verify `errorResponse` helper is used correctly

2. **Add Rate Limiter Tests:**
   - Test rate limiter triggers after threshold
   - Verify error response format

3. **Add Unit Tests:**
   - Test individual functions (services, utils, middleware)
   - Use Jest or Vitest framework
   - Target 80%+ code coverage

4. **CI/CD Integration:**
   - Run tests automatically on PR
   - Fail build if tests fail

---

## 📝 Notes

- Integration tests require a running server
- Tests use PowerShell (Windows-compatible)
- All tests validate canonical response format per `CONTRACTS.md`
- Tests should be updated when response contracts change

---

**Last Updated:** 2026-01-20  
**Version:** 1.0.0
