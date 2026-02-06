# Clariva Care - AI Receptionist Bot for Doctors
## Business Plan 2025

---

## Executive Summary

**Company:** Clariva Care  
**Product:** AI Receptionist Bot for Doctors on Social Media  
**Mission:** Empower doctors to never miss a patient inquiry by automating social media patient engagement and appointment booking through intelligent AI.

**The Problem:** Doctors active on social media receive 20-100+ patient inquiries per week but can't respond to all of them, leading to lost patients, missed opportunities, and 5-15 hours/week wasted on manual responses.

**The Solution:** An AI-powered receptionist bot specifically designed for doctors that handles patient inquiries 24/7 on Facebook, Instagram, and WhatsApp, collects basic patient information, and books appointments automatically—all while maintaining professional, compliant communication.

**Launch Strategy: Global from Day 1** — Clariva launches worldwide simultaneously, not India-first. Doctors in India, US, UK, EU, and other markets can onboard and accept payments from day one via region-appropriate gateways (Razorpay for India, PayPal for international). Gateway abstraction enables future Stripe migration when Stripe opens in India.

**Market Opportunity:** 
- **India:** ~390,000 doctors active on social media; ~200,000 solo/small clinics
- **US:** ~1M+ doctors; ~300,000+ solo/small practices on social media
- **UK/EU:** ~500,000+ doctors; growing social media adoption
- **Global TAM:** ~2M+ doctors on social media
- Target Year 1: 100-500 customers (multi-region)
- Revenue potential: ₹15L-30L (INR) + $15K-50K (USD/EUR) in Year 1

**Business Model:** SaaS subscription (multi-currency)
- **India:** Free ₹0/month | Pro ₹999/month | Enterprise ₹5K-20K/month
- **International (USD):** Free $0/month | Pro ~$12/month | Enterprise $60-240/month
- **International (EUR/GBP):** Region-equivalent pricing

**Financial Projections (Consolidated):**
- Month 1-3: 10-20 customers, ~₹10K-20K MRR (mix INR + USD/EUR)
- Month 4-6: 50-100 customers, ~₹50K-1L MRR
- Month 7-9: 150-250 customers, ~₹1.5L-2.5L MRR
- Month 10-12: 300-500 customers, ~₹3L-5L MRR
- Year 1 Total Revenue: ₹15L-30L + international (USD/EUR)

**Funding:** Bootstrapped initially, may consider seed funding in Month 6-9 if needed for scaling.

**Team:** Solo founder initially, plan to hire customer support in Month 3-6.

---

## 1. Company Overview

### 1.1 Company Information
- **Legal Name:** Clariva Care (to be registered)
- **Legal Structure:** Private Limited Company (recommended) or LLP
- **Date of Formation:** [To be determined]
- **Registered Address:** [Your address]
- **PAN:** [To be obtained]
- **GSTIN:** [To be obtained if applicable]

### 1.2 Mission Statement
"To empower doctors to focus on patient care by automating social media patient engagement through intelligent AI, ensuring no patient inquiry is ever missed."

### 1.3 Vision Statement
"To become the leading AI receptionist platform for healthcare professionals worldwide, helping doctors grow their practice—in India, the US, UK, EU, and beyond—while maintaining the highest standards of patient care and professional communication."

### 1.4 Core Values
1. **Doctor-First:** Everything we build prioritizes doctors' needs and workflow
2. **Privacy & Compliance:** Healthcare data security and regulatory compliance are non-negotiable
3. **Innovation:** Continuously improving through technology and user feedback
4. **Transparency:** Clear communication, honest pricing, no hidden fees
5. **Empathy:** Understanding the challenges doctors face and solving them genuinely

---

## 2. Problem Statement

### 2.1 The Core Problem
Doctors who are active on social media to grow their practice face a critical challenge: they receive an overwhelming number of patient inquiries (messages, comments, DMs) but cannot respond to all of them due to time constraints and the need to focus on patient care.

### 2.2 Problem Details

**Volume Challenge:**
- Doctors receive 20-100+ inquiries per week on social media
- Many inquiries go unanswered or receive delayed responses
- Patients get frustrated and may choose other doctors

**Time Challenge:**
- Doctors spend 5-15 hours/week responding to social media inquiries
- This time could be spent on patient care or practice growth
- Manual appointment booking is time-consuming

**Opportunity Loss:**
- 30-50% of potential patients are lost due to unmanaged inquiries
- No tracking of inquiry sources or conversion rates
- Can't measure ROI of social media efforts

**Professional Challenges:**
- Maintaining professional boundaries on social media
- Privacy and compliance concerns (HIPAA in US, GDPR in EU, DPDPA in India)
- Risk of saying wrong thing or violating regulations

### 2.3 Market Evidence
- Only 19% of medical practices use chatbots (huge opportunity)
- Healthcare chatbot market growing at 24% CAGR
- Doctors express frustration in interviews and social media
- Clear demand for automation solutions

---

## 3. Solution

### 3.1 Product Description
**Clariva Care AI Receptionist Bot** is an intelligent, medical-specific chatbot that:

1. **Handles Patient Inquiries 24/7**
   - Responds instantly to messages, comments, DMs
   - Works on Facebook, Instagram, WhatsApp
   - Understands medical context and terminology

2. **Collects Patient Information**
   - Name, phone, date of birth, gender
   - Reason for visit
   - Basic medical history (optional)

3. **Books Appointments Automatically**
   - Checks doctor's availability
   - Suggests available time slots
   - Books appointment in real-time
   - Prevents double-booking

4. **Maintains Professional Communication**
   - Medical-appropriate language
   - Compliance-aware responses
   - Professional tone and boundaries

5. **Provides Doctor Dashboard**
   - View all appointments
   - See patient information
   - Track inquiry sources
   - Analytics and insights

### 3.2 Key Features (MVP)

**Must-Have Features:**
- Multi-platform support (Facebook, Instagram, WhatsApp)
- Intent detection (book appointment, ask question, check availability)
- Natural conversation flow
- Appointment booking with availability checking
- Patient information collection
- Doctor dashboard (view appointments, patients)
- SMS/Email notifications
- Basic analytics

**Future Features:**
- Patient history tracking
- Cancellation/rescheduling
- Advanced analytics
- Custom bot responses
- Multi-doctor support
- Appointment reminders
- Calendar integration
- Mobile app

### 3.3 Technology Stack
- **Backend:** Node.js, Express
- **Frontend:** Next.js, React
- **Database:** Supabase (PostgreSQL)
- **AI:** OpenAI GPT-4o
- **Payments (Global Day 1 — Best Customer Experience):**
  - **India (INR):** Razorpay — UPI, cards, netbanking (region-native, trusted)
  - **International (USD/EUR/GBP):** PayPal — cards, Apple Pay, PayPal balance (trusted globally)
  - **Architecture:** Gateway abstraction layer (createPaymentLink, verifyWebhook) — enables future Stripe migration
  - **Stripe:** Preferred for international (lower fees, better API) but invite-only in India; migrate PayPal → Stripe when Stripe opens up or US entity exists
- **Notifications:** Twilio (SMS), SendGrid (Email)
- **Hosting:** Render (bot), Vercel (dashboard)
- **Monitoring:** Sentry, LogRocket

---

## 4. Market Analysis

### 4.1 Target Market (Global from Day 1)

**Primary Market: Solo Practitioners & Small Clinics (All Regions)**
- **India:** ~200,000 doctors; 1-3 per practice; UPI/cards; price-sensitive
- **US:** ~300,000+ solo/small practices on social media; cards, ACH; willing to pay
- **UK/EU:** ~200,000+ doctors; cards, SEPA; growing social media adoption
- **Characteristics (Universal):**
  - Active on social media (Instagram/Facebook/WhatsApp)
  - Limited staff (no dedicated receptionist)
  - Tech-savvy, growth-oriented
  - Want automation and time-saving

**Secondary Market: Social Media-Focused Doctors**
- **Size (Global):** ~100,000+ doctors
- **Characteristics:**
  - Building personal brand
  - High social media engagement
  - Content creators
  - Early adopters
  - Willing to pay for solutions

**Tertiary Market: Multi-Location Clinics**
- **Size:** ~20,000+ clinics globally
- **Characteristics:**
  - 5+ doctors, multiple locations
  - Business-focused
  - Need standardization
  - Higher budget
  - Enterprise features needed

### 4.2 Market Size

**Total Addressable Market (TAM):**
- **India:** ~1.3M doctors; ~30% on social media = 390,000
- **US:** ~1M+ doctors; ~30% on social media = 300,000+
- **UK/EU:** ~1M+ doctors; ~20% on social media = 200,000+
- **Global:** ~10M+ doctors; ~20% on social media = **2M+ doctors**

**Serviceable Addressable Market (SAM):**
- India: ~100,000 doctors (solo/small, willing to pay)
- US: ~150,000 doctors
- UK/EU: ~80,000 doctors
- **Total SAM: ~330,000+ doctors**

**Serviceable Obtainable Market (SOM):**
- Year 1: 100-500 doctors (multi-region)
- Year 2: 1,000-2,000 doctors
- Year 3: 5,000-10,000 doctors

### 4.3 Market Trends

**Growing Trends:**
- Healthcare digitization accelerating
- Social media becoming primary patient acquisition channel
- AI adoption in healthcare increasing
- Doctors seeking automation solutions
- Patient expectations for instant responses rising

**Market Drivers:**
- Increasing social media usage by doctors
- Growing patient expectations
- Need for efficiency and time-saving
- Competition among doctors
- Technology becoming more accessible

---

## 5. Competitive Analysis

### 5.1 Direct Competitors

**Generic Social Media Bots:**
- ManyChat, Chatfuel, MobileMonkey
- **Strengths:** Easy setup, multi-industry
- **Weaknesses:** Not healthcare-specific, no medical context, compliance gaps
- **Our Advantage:** Medical-specific, appointment-focused, compliance-aware

**Healthcare Chatbots:**
- Ada Health, Babylon Health, Buoy Health
- **Strengths:** Medical knowledge, healthcare-focused
- **Weaknesses:** Not social media native, complex, expensive
- **Our Advantage:** Social media integrated, affordable, easy setup

**Appointment Booking Tools:**
- Calendly, Acuity Scheduling, Zocdoc
- **Strengths:** Good scheduling, reliable
- **Weaknesses:** Not social media integrated, no conversation AI
- **Our Advantage:** Conversational, social media native, AI-powered

### 5.2 Competitive Positioning

**Our Unique Position:**
- **Medical-Specific:** Built for doctors, understands medical context
- **Social Media Native:** Works where doctors are (FB/IG/WA)
- **End-to-End:** Inquiry → History → Booking → Confirmation
- **Compliance-Aware:** Built with privacy/regulations in mind
- **Affordable:** Fraction of enterprise solution costs

**Competitive Matrix:**

| Feature | Generic Bots | Healthcare Bots | Appointment Tools | **Our Bot** |
|---------|--------------|----------------|-------------------|-------------|
| Medical Context | ❌ | ✅ | ❌ | ✅ |
| Social Media | ✅ | ❌ | ❌ | ✅ |
| Appointment Focus | ❌ | ❌ | ✅ | ✅ |
| Affordability | ✅ | ❌ | ✅ | ✅ |
| Compliance | ❌ | ✅ | ✅ | ✅ |
| Easy Setup | ✅ | ❌ | ✅ | ✅ |

---

## 6. Business Model

### 6.1 Revenue Model
**SaaS Subscription Model** - Recurring monthly/annual revenue

### 6.2 Pricing Tiers (Multi-Currency, Global Day 1)

**Free Tier: ₹0 / $0 / €0 per month**
- 50 appointments/month
- 1 platform (choose FB, IG, or WA)
- Basic features
- Community support
- **Purpose:** Get doctors started, show value, viral growth (all regions)

**Pro Tier:**
- **India:** ₹999/month (or ₹9,990/year - save 17%)
- **US/International:** ~$12/month (or ~$120/year)
- **UK/EU:** ~£10 / ~€11 per month (region-equivalent)
- Unlimited appointments, all platforms, advanced features, analytics, SMS, priority support
- **Purpose:** Main revenue stream, best value (global)

**Enterprise Tier: Custom Pricing**
- **India:** ₹5,000-20,000/month
- **International:** $60-240/month (or equivalent)
- Multiple doctors, custom integrations, white-label, dedicated support, SLA
- **Purpose:** High-value customers, larger practices (global)

### 6.3 Revenue Projections (Multi-Region)

**Conservative Scenario (India-heavy mix):**
- Month 1-3: 10 customers (8 India + 2 intl) ≈ ₹9,990 MRR + ~$24
- Month 4-6: 50 customers (40 India + 10 intl) ≈ ₹49,950 MRR + ~$120
- Month 7-9: 150 customers (120 India + 30 intl) ≈ ₹1.5L MRR + ~$360
- Month 10-12: 300 customers (240 India + 60 intl) ≈ ₹3L MRR + ~$720
- **Year 1 Total Revenue: ~₹15L + ~$5K (international)**

**Optimistic Scenario (Balanced global mix):**
- Month 1-3: 20 customers (12 India + 8 intl) ≈ ₹12K + ~$96 MRR
- Month 4-6: 100 customers (60 India + 40 intl) ≈ ₹60K + ~$480 MRR
- Month 7-9: 250 customers (150 India + 100 intl) ≈ ₹1.5L + ~$1,200 MRR
- Month 10-12: 500 customers (300 India + 200 intl) ≈ ₹3L + ~$2,400 MRR
- **Year 1 Total Revenue: ~₹30L + ~$20K (international)**

### 6.4 Unit Economics

**Per Customer (Pro Tier) — India:**
- **Revenue:** ₹999/month
- **Costs:** ~₹400/month (infra, AI, SMS, support)
- **Gross Margin:** ~60%
- **CAC:** ₹3,000 | **LTV:** ₹24,000 | **LTV:CAC:** 8:1

**Per Customer (Pro Tier) — International:**
- **Revenue:** ~$12/month
- **Costs:** ~$4/month (equivalent)
- **Gross Margin:** ~65%
- **CAC:** ~$35 | **LTV:** ~$288 | **LTV:CAC:** 8:1

### 6.5 Payment Strategy (Best Customer Experience)

**Dual Gateway — Region-Specific Checkout:**
- **India doctors:** Razorpay — patients pay in INR via UPI, cards, netbanking (familiar, trusted locally)
- **US/UK/EU doctors:** PayPal — patients pay in USD/EUR/GBP via cards, Apple Pay, PayPal (familiar, trusted globally)

**Why not Razorpay-only for international?** US/EU patients trust PayPal more; region-specific checkout maximizes conversion.

**Why not Stripe?** Stripe is invite-only in India; preferred for international (lower fees ~2.9%, better API) but unavailable today.

**Future Migration Path:**
- Build gateway abstraction (createPaymentLink, verifyWebhook) from day 1
- When Stripe opens in India (H2 2025 target) or US entity exists → swap PayPal for Stripe for international
- Single adapter swap; no rewrite

---

## 7. Go-to-Market Strategy (Global from Day 1)

### 7.1 Phase 1: Validation (Month 1-3)

**Goal:** Get 10-20 pilot customers across India + international, validate product-market fit globally

**Tactics (Multi-Region):**
1. **Social Media Presence**
   - Daily Instagram posts (@clarivacare)
   - Engage with doctors in India, US, UK, EU
   - Build credibility
   - Target: 500+ followers (global audience)

2. **Direct Outreach**
   - DM 50-100 doctors on Instagram (India + US/EU)
   - Personalized messages by region
   - Offer free pilot
   - Target: 10-20 signups (mix India + international)

3. **Content Marketing**
   - Blog posts (healthcare + AI, multi-region)
   - Case studies (India, US, UK)
   - Video tutorials
   - Target: 1000+ views

4. **Referrals**
   - Ask pilot doctors for referrals
   - Incentivize sharing
   - Target: 5+ referrals

**Budget:** ₹50,000  
**Target:** 20 customers (India + international)

### 7.2 Phase 2: Early Growth (Month 4-6)

**Goal:** Scale to 50-100 customers across regions, optimize acquisition

**Tactics:**
1. **Paid Advertising**
   - Facebook/Instagram ads (target by country: India, US, UK, EU)
   - Budget: ₹50,000/month
   - Target: 30-50 signups/month (multi-region)

2. **Content Marketing**
   - Weekly blog posts
   - Case studies (per region)
   - Webinars (timezone-friendly for US/EU)
   - Target: 5000+ views/month

3. **Partnerships**
   - Medical associations (India, US, UK)
   - Healthcare influencers (per region)
   - Target: 2-3 partnerships

4. **Referral Program**
   - Incentivize referrals
   - Track referrals by region
   - Target: 20% of new customers

**Budget:** ₹1,50,000  
**Target:** 100 customers (global mix)

### 7.3 Phase 3: Scale (Month 7-12)

**Goal:** Scale to 300-500 customers across regions, multiple channels

**Tactics:**
1. **Multi-channel Marketing**
   - Paid ads (₹1L/month) — geo-target India, US, UK, EU
   - Content marketing
   - Partnerships
   - Direct sales (per region)
   - Target: 50+ signups/month

2. **Optimization**
   - A/B test messaging by region
   - Optimize conversion
   - Reduce CAC
   - Target: <₹3000 (India) / <$35 (international)

3. **Expansion**
   - New features
   - Upsell existing
   - Enterprise sales (global)
   - Target: 20% expansion revenue

**Budget:** ₹6,00,000  
**Target:** 500 customers (global)

---

## 8. Operations Plan

### 8.1 Development Process (Global Day 1)

**Phase 1: MVP (Weeks 1-4)**
- Basic bot functionality
- Multi-platform support
- Appointment booking
- **Payment integration:** Razorpay (India) + PayPal (International) — dual gateway for best customer experience
- **Gateway abstraction layer** — createPaymentLink(), verifyWebhook() interface; enables future Stripe swap
- Simple dashboard
- Test with 3-5 pilots (India + international)

**Phase 2: Core Features (Weeks 5-8)**
- Enhanced conversation
- Patient history
- Notifications
- Analytics
- **Multi-region support:** doctor country, currency, gateway routing (Razorpay vs PayPal)

**Phase 3: Polish (Weeks 9-12)**
- Security & compliance (HIPAA, GDPR, DPDPA)
- Performance optimization
- UX improvements
- Documentation

**Phase 4 (Future): Stripe Migration**
- When Stripe opens in India or US entity exists → add Stripe adapter, route international traffic to Stripe instead of PayPal

### 8.2 Customer Onboarding

**Process:**
1. Sign up (5 min) - Create account, connect social media
2. Setup (10 min) - Configure availability, services, customize
3. Go live (instant) - Bot starts working
4. Support (ongoing) - Help docs, tutorials, community

**Success Metrics:**
- Setup completion: 80%+
- Time to first booking: <24 hours
- Support tickets: <10% of users

### 8.3 Customer Support

**Channels:**
- Email (primary)
- In-app chat
- WhatsApp (for urgent)
- Knowledge base

**Response Times:**
- Critical: <2 hours
- High: <24 hours
- Normal: <48 hours

---

## 9. Management Team

### 9.1 Current Team

**Founder/CEO:** [Your Name]
- Role: Product development, marketing, sales, operations
- Background: [Your background]
- Responsibilities: Overall strategy, product, growth

### 9.2 Hiring Plan

**Month 3-6:**
- Customer Support (part-time): ₹20K-40K/month
- Or Marketing help: ₹30K-50K/month

**Month 6-9:**
- Developer (if needed): ₹50K-100K/month
- Or Sales person: ₹40K-80K/month

**Month 9-12:**
- Based on needs
- Marketing/Sales: ₹50K-100K/month
- Or Operations: ₹40K-80K/month

---

## 10. Financial Plan

### 10.1 Startup Costs (One-time)

- Legal setup: ₹50,000
- Initial marketing: ₹50,000
- Tools/software: ₹25,000
- **Total:** ₹125,000

### 10.2 Monthly Operating Costs

**Infrastructure:**
- Hosting (bot): ₹2,000
- Hosting (dashboard): ₹1,000
- Database (Supabase): ₹3,000
- **Subtotal:** ₹6,000

**Services:**
- AI API (OpenAI): ₹10,000 (scales with usage)
- SMS (Twilio): ₹5,000 (scales with usage)
- Email service: ₹500
- **Payments (Razorpay + PayPal):** Transaction-based fees (Razorpay ~2% India; PayPal ~4.4% international). Future: Stripe ~2.9% when migrated.
- **Subtotal:** ₹15,500 + payment gateway fees

**Tools:**
- Monitoring: ₹1,000
- Analytics: ₹500
- Support tools: ₹1,000
- **Subtotal:** ₹2,500

**Marketing:**
- Social media ads: ₹20,000
- Content creation: ₹5,000
- **Subtotal:** ₹25,000

**Total Monthly Costs: ₹49,000** (early stage, scales with customers)

### 10.3 Revenue Projections (Multi-Region)

**Month 1-3:**
- Customers: 10 (India + international)
- MRR: ~₹9,990 + ~$24
- Status: Loss-making (building)

**Month 4-6:**
- Customers: 50 (India + international)
- MRR: ~₹49,950 + ~$120
- Status: Break-even

**Month 7-9:**
- Customers: 150 (India + international)
- MRR: ~₹1.5L + ~$360
- Status: Profitable

**Month 10-12:**
- Customers: 300 (India + international)
- MRR: ~₹3L + ~$720
- Status: Highly profitable

### 10.4 Break-even Analysis

- **Fixed Costs:** ₹49,000/month
- **Variable Cost per Customer:** ₹300
- **Revenue per Customer:** ₹999
- **Contribution Margin:** ₹699
- **Break-even Customers:** 70 customers
- **Break-even Month:** Month 5-6

### 10.5 Funding Requirements

**Bootstrap (Recommended):**
- Use own savings
- Keep costs low
- Grow organically
- Maintain control

**If External Funding Needed:**
- Amount: ₹25L-1Cr
- Use: Marketing, scaling, team
- Equity: 10-20%
- Timeline: Month 6-9 (if needed)

---

## 11. Risk Analysis

### 11.1 Product Risks

**Risk:** Doctors don't trust AI with patients
- **Probability:** Medium
- **Impact:** High
- **Mitigation:** Show value, testimonials, free trial
- **Contingency:** Hybrid model (AI + human)

**Risk:** Technical issues
- **Probability:** Medium
- **Impact:** High
- **Mitigation:** Thorough testing, monitoring, quick response
- **Contingency:** Backup systems

**Risk:** Multi-region payment/compliance complexity
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:** Dual gateway (Razorpay + PayPal) from day 1; gateway abstraction for future Stripe migration; compliance by region (HIPAA, GDPR, DPDPA)
- **Contingency:** Focus on single region if needed; gateway abstraction allows swapping PayPal → Stripe when available

### 11.2 Market Risks

**Risk:** Low demand
- **Probability:** Low
- **Impact:** High
- **Mitigation:** Validate with research, test with pilots across regions
- **Contingency:** Adjust target market or region mix

**Risk:** Competition
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:** Differentiate, focus on niche, build brand (global)
- **Contingency:** Compete on quality/price

### 11.3 Financial Risks

**Risk:** Running out of money
- **Probability:** Medium
- **Impact:** High
- **Mitigation:** Control costs, focus on revenue, bootstrap
- **Contingency:** Cut costs, raise funds

---

## 12. Milestones & Timeline

### 12.1 Key Milestones (Global Day 1)

**Q1 2025 (Month 1-3):**
- ✅ MVP completed (Razorpay + PayPal dual gateway)
- ✅ 20 pilot customers (India + international)
- ✅ Product-market fit validated (multi-region)
- ✅ ~₹10K MRR + international

**Q2 2025 (Month 4-6):**
- ✅ 100 customers (global mix)
- ✅ Break-even achieved
- ✅ ~₹50K MRR + international
- ✅ Team expansion (1-2 people)

**Q3 2025 (Month 7-9):**
- ✅ 250 customers
- ✅ Profitable
- ✅ ~₹2.5L MRR + international
- ✅ Advanced features launched

**Q4 2025 (Month 10-12):**
- ✅ 500 customers (global)
- ✅ ~₹5L MRR + international
- ✅ Market leadership (India + early international)
- ✅ Expansion planning

### 12.2 Success Metrics

**Product Metrics:**
- Uptime: 99%+
- Response time: <2 seconds
- Conversation success: 90%+
- Booking completion: 80%+

**Business Metrics:**
- MRR growth: 20%+/month
- Churn: <5%/month
- CAC: <₹3000
- LTV:CAC: 8:1
- NPS: 50+

---

## 13. Exit Strategy (Long-term)

**Options:**
1. **Acquisition:** By larger healthcare tech company (global acquirer)
2. **IPO:** If scale to significant size (multi-region)
3. **Continue Operating:** As profitable global business
4. **Franchise/License:** Technology to other markets (regional licensing)

**Timeline:** 5-10 years (if applicable)

**Global Day 1 Advantage:** Early international presence increases acquisition interest and valuation.

---

## 14. Appendix

### 14.1 Supporting Documents
- User personas
- Problem statements
- Solution definition
- User journey maps
- Feature specifications
- Competitive analysis
- Financial model
- Marketing plan

### 14.2 Contact Information
- **Company:** Clariva Care
- **Email:** [Your email]
- **Website:** [Your website]
- **Social Media:** @clarivacare

---

**Document Version:** 1.2  
**Last Updated:** 2026-01-30  
**Next Review:** [Date + 1 month]  

**Changelog (v1.2):** Payment strategy refined: dual gateway (Razorpay India + PayPal International) for best customer experience; gateway abstraction for future Stripe migration; Stripe preferred for international but unavailable in India (invite-only) — migrate when Stripe opens or US entity exists.

**Changelog (v1.1):** Global Day 1 launch strategy; dual payment gateways (Razorpay + PayPal); multi-region market (India, US, UK, EU); multi-currency pricing; updated GTM, milestones, and risk analysis.

