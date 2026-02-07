# Testing Guide for Task 5 - Pending Items

This guide provides step-by-step instructions for testing all pending items in Task 5.

---

## 🧪 Section 5.1: Test Complete Request Flow

### 5.1.1-5.1.4: Verify Correlation ID, Timing, and Log Fields

**Steps:**
1. **Keep server running** (it should already be running from `npm run dev`)

2. **Send a request to `/health` endpoint:**
   - **Option A - Browser:** Open `http://localhost:3000/health`
   - **Option B - PowerShell:**
     ```powershell
     Invoke-WebRequest -Uri http://localhost:3000/health -Method GET
     ```
   - **Option C - curl (if available):**
     ```bash
     curl http://localhost:3000/health
     ```

3

4. **Look for log entries** - You should see structured JSON logs with:
   - ✅ `correlationId` - Unique ID for the request
   - ✅ `path` - Request path (e.g., "/health")
   - ✅ `method` - HTTP method (e.g., "GET")
   - ✅ `statusCode` - Response status (e.g., 200)
   - ✅ `durationMs` - Request duration in milliseconds

**Expected Log Format:**
```json
{
  "level": 30,
  "time": 1234567890,
  "correlationId": "abc-123-def-456",
  "path": "/health",
  "method": "GET",
  "statusCode": 200,
  "durationMs": 15,
  "msg": "Request completed"
}. **Check the server console logs** (where `npm run dev` is running)
```

**Verification Checklist:**
- [ ] Correlation ID is present and unique for each request
- [ ] `durationMs` is present and shows request time
- [ ] All standard fields (`correlationId`, `path`, `method`, `statusCode`, `durationMs`) are present
- [ ] Logs are in structured JSON format (not plain text)

---

## 🧪 Section 5.2: Test Error Handling Flow

### 5.2.1-5.2.4: Test Error Responses

**Steps:**

1. **Test 1: Invalid Route (404 Error)**
   ```powershell
   # In PowerShell
   Invoke-WebRequest -Uri http://localhost:3000/nonexistent -Method GET
   ```
   - **Expected:** 404 status code
   - **Check logs:** Should see error logged with standard fields

2. **Test 2: Invalid JSON (if you have a POST endpoint)**
   - Since we only have GET endpoints currently, this will be tested later when POST endpoints are added
   - For now, you can verify the error middleware is set up correctly

3. **Check Error Response Format:**
   - Error responses should include:
     - `error` - Error name (e.g., "NotFoundError")
     - `message` - Error message
     - `statusCode` - HTTP status code

4. **Check Error Logs:**
   - Errors should be logged with all standard fields
   - Should include `correlationId`, `path`, `method`, `statusCode`, `durationMs`

**Verification Checklist:**
- [ ] 404 errors return proper status code (404)
- [ ] Error response includes `error`, `message`, and `statusCode` fields
- [ ] Error is logged with standard fields (`correlationId`, `path`, `method`, `statusCode`, `durationMs`)
- [ ] Error middleware is working (errors are caught and formatted)

---

## 🧪 Section 5.3: Test Database Integration

### 5.3.1: Verify Database Connection (Already Done ✅)
- ✅ Already verified - Server started and logged "Database connected successfully"

### 5.3.2: Test Connection Failure (Optional)

**Steps:**
1. **Stop the server** (Ctrl+C in the terminal running `npm run dev`)

2. **Temporarily break database connection:**
   - Open `backend/.env`
   - Change `SUPABASE_URL` to an invalid URL (e.g., `https://invalid-url.supabase.co`)
   - Or change `SUPABASE_ANON_KEY` to an invalid key

3. **Try to start server:**
   ```powershell
   npm run dev
   ```

4. **Expected Result:**
   - Server should **NOT start** (should exit with error)
   - Should show error message about database connection failure
   - Should NOT show "Server is running" message

5. **Restore correct values** in `.env` after testing

**Verification Checklist:**
- [ ] Server fails to start when database connection is invalid
- [ ] Error message is clear about database connection failure
- [ ] Server does not accept requests when database is unavailable

### 5.3.3: Verify Both Clients Initialized (Already Verified ✅)
- ✅ Code review confirmed both `supabase` and `supabaseAdmin` clients are initialized in `database.ts`

---

## 🧪 Section 1.4: Test Environment Variables

### 1.4.1: Verify `.env` File Exists
**Steps:**
1. Check if `backend/.env` file exists
2. Verify it contains required variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORT`
   - `NODE_ENV`

**Verification:**
- [ ] `.env` file exists in `backend/` directory
- [ ] Contains all required variables (server started successfully, so this is confirmed)

### 1.4.2: Test Env Validation Fail-Fast (Optional)

**Steps:**
1. **Stop the server** (Ctrl+C)

2. **Temporarily remove a required variable:**
   - Open `backend/.env`
   - Comment out or remove `SUPABASE_URL` (add `#` at the start of the line)

3. **Try to start server:**
   ```powershell
   npm run dev
   ```

4. **Expected Result:**
   - Server should **fail immediately** with a clear error
   - Should show Zod validation error
   - Should NOT start the server

5. **Restore the variable** after testing

**Verification Checklist:**
- [ ] Server fails fast when required env var is missing
- [ ] Error message is clear (Zod validation error)
- [ ] Server does not start with missing required variables

### 1.4.3: Already Verified ✅
- ✅ Code review confirmed no raw `process.env` usage

### 1.4.4: Rename `.env.example` File
**Steps:**
1. In your file explorer or IDE, find `backend/env.example`
2. Rename it to `backend/.env.example` (add the dot prefix)
3. Verify the file is now named `.env.example`

---

## 🧪 Section 3.4.3: Test Server Fail-Fast on Missing Env Vars

**Same as 1.4.2 above** - Test that server fails fast when required environment variables are missing.

---

## 🧪 Section 6.1: Verify Data Handling Basics

### 6.1.1: Check No PII in Logs (Already Verified ✅)
- ✅ Code review confirmed no PII logging patterns

**Manual Verification:**
1. Check server logs after making requests
2. Verify logs only contain:
   - IDs (e.g., `correlationId`, `appointmentId`)
   - No patient names
   - No phone numbers
   - No email addresses
   - No dates of birth

### 6.1.2: Verify Correlation IDs (Test with Request)
**Steps:**
1. Make multiple requests to `/health` endpoint
2. Check logs - each request should have a unique `correlationId`
3. Verify `correlationId` is also in the response header `X-Correlation-ID`

**Verification:**
- [ ] Each request has unique correlation ID
- [ ] Correlation ID is in logs
- [ ] Correlation ID is in response headers

### 6.1.3: Confirm Structured Logging (Already Verified ✅)
- ✅ Pino logger configured and working

---

## 🧪 Section 6.2: Verify Security Basics

### 6.2.1: Check CORS is Configured (Already Verified ✅)
- ✅ Code review confirmed `cors()` middleware is mounted in `index.ts`

**Manual Verification:**
1. Check response headers when making requests
2. Should see CORS headers in response

### 6.2.2: Verify Error Messages Don't Leak Info (Already Verified ✅)
- ✅ Code review confirmed error middleware formats errors properly
- ✅ Stack traces only shown in development mode

**Manual Verification:**
1. Trigger an error (e.g., 404)
2. Check error response - should not include:
   - Database connection strings
   - API keys
   - File paths
   - Stack traces (in production mode)

### 6.2.3: Confirm Env Vars Not Exposed (Already Verified ✅)
- ✅ Code review confirmed no env vars in responses

**Manual Verification:**
1. Check all API responses
2. Verify no environment variables are included in response bodies

---

## 🧪 Section 7.1: Final Checks

### 7.1.1: Type Check (Already Done ✅)
- ✅ `npm run type-check` passed

### 7.1.2: Build Test

**Steps:**
1. **Stop the server** (if running)

2. **Run build command:**
   ```powershell
   cd backend
   npm run build
   ```

3. **Expected Result:**
   - TypeScript compiles successfully
   - Creates `dist/` directory
   - No compilation errors

4. **Verify build output:**
   - Check that `backend/dist/` directory exists
   - Check that `backend/dist/index.js` exists
   - Check that compiled JavaScript files are present

**Verification Checklist:**
- [ ] Build completes without errors
- [ ] `dist/` directory is created
- [ ] Compiled JavaScript files are present

### 7.1.3: Already Done ✅
- ✅ Server started and endpoints tested

---

## 🧪 Section 2.3.4: Test Error Responses

**Same as Section 5.2 above** - Test that error responses return proper status codes.

---

## 📋 Quick Testing Checklist

### Immediate Tests (Server Running):
- [ ] **5.1.1-5.1.4:** Make request, check logs for correlation ID, timing, standard fields
- [ ] **5.2.1-5.2.4:** Test 404 error, verify error response format and logging
- [ ] **6.1.2:** Verify correlation IDs are unique and in headers

### Build Test (Stop Server First):
- [ ] **7.1.2:** Run `npm run build`, verify `dist/` directory created

### Optional Tests (Can Skip for Now):
- [ ] **1.4.2:** Test env validation fail-fast
- [ ] **3.4.3:** Test server fail-fast on missing env vars
- [ ] **5.3.2:** Test database connection failure

### Already Verified (Mark as Complete):
- [x] **5.3.1:** Database connection verified
- [x] **5.3.3:** Both clients initialized
- [x] **6.1.1:** No PII in logs (code review)
- [x] **6.1.3:** Structured logging (code review)
- [x] **6.2.1:** CORS configured (code review)
- [x] **6.2.2:** Error messages safe (code review)
- [x] **6.2.3:** Env vars not exposed (code review)
- [x] **7.1.1:** Type check passed
- [x] **7.1.3:** Server and endpoints working
- [x] **7.2:** Documentation updated
- [x] **7.3:** Code review checklist completed

---

## 🎯 Recommended Testing Order

1. **With server running:**
   - Test request flow (5.1) - Check logs
   - Test error handling (5.2) - Test 404
   - Verify correlation IDs (6.1.2)

2. **Stop server, then:**
   - Run build test (7.1.2)

3. **Optional (if time permits):**
   - Test env validation fail-fast (1.4.2, 3.4.3)
   - Test database connection failure (5.3.2)

---

**Last Updated:** 2025-01-12
