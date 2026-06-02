# Learning Topics - Database Schema Migration
## Task #1: Creating Database Tables & Structure

---

## 📚 What Are We Learning Today?

Today we're learning about **Database Schema Migration** - how to design and create the database structure for our AI Receptionist Bot. Think of it like **building the foundation and rooms of a hospital** - you need to plan where everything goes, how rooms connect, and what security measures to put in place!

We'll learn about:
1. **What is a Database Schema?** - The blueprint of your database
2. **What are Migrations?** - Version-controlled database changes
3. **Database Tables** - Organizing data into logical groups
4. **Relationships & Foreign Keys** - Connecting related data
5. **Indexes** - Making queries fast
6. **Row Level Security (RLS)** - Protecting data at database level
7. **Triggers** - Automating database operations
8. **Compliance & PHI** - Healthcare data protection

---

## 🎓 Topic 1: What is a Database Schema?

### What is a Schema?

A **database schema** is like a **blueprint** that defines:
- What tables exist
- What columns each table has
- What data types are allowed
- How tables relate to each other

**Think of it like:**
- **Hospital Blueprint** - Shows all rooms, their purposes, and connections
- **Building Plans** - Defines structure before construction
- **Recipe** - Lists all ingredients and steps

### Why We Need a Schema

**Without a schema:**
- Data stored randomly
- No structure or organization
- Can't enforce rules
- Hard to query efficiently

**With a schema:**
- Organized data storage
- Rules enforced automatically
- Fast queries
- Data integrity guaranteed

### Real-World Analogy

**Hospital without schema:**
- Patient files scattered everywhere
- No organization system
- Can't find information quickly
- Risk of losing data

**Hospital with schema:**
- Patient files in specific rooms
- Clear organization system
- Fast retrieval by ID or name
- All data properly categorized

---

## 🎓 Topic 2: What are Migrations?

### What is a Migration?

A **migration** is a script that changes your database schema in a controlled, versioned way.

**Think of it like:**
- **Construction Plans** - Step-by-step building instructions
- **Version Control** - Track all changes over time
- **Rollback Plan** - Can undo changes if needed

### Why Use Migrations?

**Benefits:**
- **Version Control** - Track all schema changes
- **Reproducible** - Same schema on dev/staging/prod
- **Rollback** - Can undo changes if problems occur
- **Team Collaboration** - Everyone uses same schema

**Without migrations:**
- Manual SQL changes (error-prone)
- Can't track what changed
- Hard to reproduce
- Risk of data loss

**With migrations:**
- Scripted changes (reproducible)
- Full change history
- Easy to apply to any environment
- Safe and controlled

### Migration Naming Convention

**Format:** `001_initial_schema.sql`, `002_add_indexes.sql`, etc.

**Think of it like:**
- **001** = Version number (sequential)
- **initial_schema** = Description of change
- **.sql** = SQL script file

---

## 🎓 Topic 3: Database Tables

### What is a Table?

A **table** is like a **spreadsheet** that stores related data in rows and columns.

**Think of it like:**
- **Patient Records Room** - All patient files in one place
- **Appointment Book** - All appointments listed
- **Staff Directory** - All staff information

### Table Structure

**Columns (Fields):**
- Define what data is stored
- Each column has a type (text, number, date, etc.)
- Some columns are required, some optional

**Rows (Records):**
- Each row = one record
- Example: One row = one patient, one appointment, etc.

**Example:**
```
patients table:
| id  | name      | phone        | created_at          |
|-----|-----------|--------------|---------------------|
| uuid| John Doe  | +1234567890  | 2026-01-20 10:00:00|
| uuid| Jane Smith| +0987654321  | 2026-01-20 11:00:00|
```

### Our Tables

**Core Tables:**
1. **appointments** - Patient appointment bookings
2. **webhook_idempotency** - Prevent duplicate webhook processing
3. **audit_logs** - Compliance audit trail

**New Tables:**
4. **patients** - Patient information (PHI)
5. **conversations** - Conversation threads between patients and doctors
6. **messages** - Individual messages in conversations (PHI)
7. **availability** - Doctor availability schedules
8. **blocked_times** - Blocked time slots (optional)

---

## 🎓 Topic 4: Relationships & Foreign Keys

### What is a Relationship?

A **relationship** connects data between tables.

**Think of it like:**
- **Patient → Appointment** - One patient can have many appointments
- **Doctor → Appointments** - One doctor can have many appointments
- **Conversation → Messages** - One conversation has many messages

### Types of Relationships

1. **One-to-Many** - Most common
   - One doctor → Many appointments
   - One conversation → Many messages

2. **Many-to-Many** - Less common (we don't use this yet)
   - Would need a junction table

### What is a Foreign Key?

A **foreign key** is a column that references another table's primary key.

**Example:**
```sql
appointments table:
- id (primary key)
- doctor_id (foreign key → auth.users(id))
- patient_name
- appointment_date
```

**Think of it like:**
- **Appointment has doctor_id** - Links to which doctor
- **Foreign key enforces** - Can't create appointment for non-existent doctor
- **Cascade delete** - If doctor deleted, appointments deleted too (or restricted)

### Foreign Key Benefits

**Data Integrity:**
- Can't create appointment for non-existent doctor
- Can't delete doctor if appointments exist (if RESTRICT)
- Automatic cleanup if doctor deleted (if CASCADE)

**Think of it like:**
- **Hospital ID Badge** - Must belong to real employee
- **Patient File** - Must link to real patient record
- **Automatic Cleanup** - If employee leaves, their records handled properly

---

## 🎓 Topic 5: Indexes

### What is an Index?

An **index** is like a **table of contents** that makes queries faster.

**Think of it like:**
- **Book Index** - Find topics quickly without reading entire book
- **Phone Directory** - Find names quickly (alphabetically sorted)
- **Hospital Room Directory** - Find room numbers quickly

### Why We Need Indexes

**Without indexes:**
- Database scans entire table (slow!)
- Like reading entire book to find one word
- Gets slower as data grows

**With indexes:**
- Database jumps directly to data (fast!)
- Like using book index to find page
- Stays fast even with lots of data

### When to Create Indexes

**Create indexes for:**
- Foreign keys (for JOIN performance)
- Frequently queried columns
- WHERE clause columns
- ORDER BY columns
- Composite indexes for common query patterns

**Don't create indexes for:**
- Low-cardinality columns (e.g., boolean flags)
- Columns never used in WHERE clauses
- Over-indexing (slows writes)

### Example Index

```sql
-- Index on foreign key (fast JOINs)
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);

-- Composite index (fast filtering)
CREATE INDEX idx_appointments_doctor_status_date 
ON appointments(doctor_id, status, appointment_date);
```

**Think of it like:**
- **Single index** = One directory (by doctor)
- **Composite index** = Multi-level directory (by doctor, then status, then date)

---

## 🎓 Topic 6: Row Level Security (RLS)

### What is Row Level Security?

**Row Level Security (RLS)** is a database feature that controls who can access which rows of data.

**Think of it like:**
- **Hospital Access Control** - Each doctor can only see their own patients
- **Locked File Cabinets** - Only authorized staff can access
- **Security Guards** - Check permissions before allowing access

### Why RLS is Critical

**Without RLS:**
- Application code must check permissions (can have bugs!)
- One bug = data breach
- Hard to audit access

**With RLS:**
- Database enforces permissions (can't bypass!)
- Defense in depth (even if app code has bugs)
- Required for healthcare compliance (HIPAA)

### How RLS Works

**Policies:**
- Define who can read/write what
- Checked on every query
- Enforced at database level

**Example:**
```sql
-- Doctor can only see their own appointments
CREATE POLICY "Users can read own appointments"
ON appointments FOR SELECT
USING (auth.uid() = doctor_id);
```

**Think of it like:**
- **Policy** = Security rule
- **auth.uid()** = Current user's ID
- **doctor_id** = Appointment's doctor
- **Result** = Only see appointments where you're the doctor

### Service Role vs User Role

**User Role (anon key):**
- Respects RLS policies
- Can only access own data
- Safe for client-side use

**Service Role:**
- Bypasses RLS (admin access)
- Can access all data
- Server-side ONLY (never expose!)

**Think of it like:**
- **User Role** = Regular staff (follows rules)
- **Service Role** = Hospital administrator (bypasses rules)

---

## 🎓 Topic 7: Triggers

### What is a Trigger?

A **trigger** is code that runs automatically when data changes.

**Think of it like:**
- **Automatic Door** - Opens when you approach
- **Motion Sensor** - Activates lights automatically
- **Auto-Save** - Saves document automatically

### Common Trigger: updated_at

**Problem:**
- Need to track when records are updated
- Don't want to manually update timestamp every time

**Solution:**
- Trigger automatically updates `updated_at` on every UPDATE

**Example:**
```sql
-- Function to update timestamp
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to appointments table
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

**Think of it like:**
- **Automatic Timestamp** - Records when file was last modified
- **No Manual Work** - Happens automatically
- **Always Accurate** - Can't forget to update

---

## 🎓 Topic 8: Compliance & PHI Protection

### What is PHI?

**PHI (Protected Health Information)** is any information that can identify a patient:
- Names
- Phone numbers
- Dates of birth
- Medical information

**Think of it like:**
- **Confidential Patient Files** - Must be protected
- **HIPAA Requirements** - Legal protection required
- **Strict Access Control** - Only authorized access

### Data Classification

**Three Categories:**
1. **Public Social Data** - Public posts, profile info
2. **Administrative Data** - Appointment requests, scheduling
3. **PHI** - Patient names, phones, medical info (strictest protection)

**Think of it like:**
- **Public** = Hospital lobby (anyone can see)
- **Administrative** = Staff areas (authorized access)
- **PHI** = Patient rooms (strict access control)

### Encryption Requirements

**Platform-Level Encryption:**
- Supabase automatically encrypts all data at rest
- No application code needed
- Patient data (name, phone) encrypted automatically

**Field-Level Encryption (Optional):**
- Additional encryption for extremely sensitive fields
- Only if explicitly required
- Not needed for MVP (platform encryption sufficient)

**Think of it like:**
- **Platform Encryption** = Hospital building security (automatic)
- **Field-Level Encryption** = Individual safe in room (extra protection)

### Audit Logging

**What Must Be Logged:**
- All data access (who, what, when)
- All data modifications (create, update, delete)
- All AI interactions (metadata only, no PHI)

**What NOT to Log:**
- Patient names, phones, DOBs
- Request bodies (may contain PHI)
- Raw AI prompts/responses with PHI

**Think of it like:**
- **Access Log** = Who entered which room (not what they saw)
- **Activity Log** = What actions taken (not patient details)
- **Compliance Trail** = Full audit history for legal requirements

---

## 🎓 Topic 9: Data Types & Constraints

### UUID vs TEXT

**UUID (Universally Unique Identifier):**
- Use for: Primary keys, foreign keys
- Format: `550e8400-e29b-41d4-a716-446655440000`
- Benefits: Globally unique, no collisions

**TEXT:**
- Use for: Patient names, phone numbers, free-form text
- Benefits: No length limits, flexible

**Never Use:**
- VARCHAR with arbitrary limits
- CHAR for variable-length strings

**Think of it like:**
- **UUID** = Unique patient ID (never duplicates)
- **TEXT** = Patient name (no length restriction)

### Timestamps

**Always Use TIMESTAMPTZ:**
- Includes timezone information
- Prevents timezone confusion
- Default: `DEFAULT now()`

**Never Use TIMESTAMP:**
- Without timezone (causes bugs!)
- Manual timestamp management

**Think of it like:**
- **TIMESTAMPTZ** = "2026-01-20 10:00:00 UTC" (clear timezone)
- **TIMESTAMP** = "2026-01-20 10:00:00" (unclear timezone)

### CHECK Constraints

**What are CHECK Constraints?**
- Enforce data rules at database level
- Example: Status must be 'pending', 'confirmed', 'cancelled', or 'completed'

**Example:**
```sql
status TEXT NOT NULL 
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'))
```

**Think of it like:**
- **Validation Rule** = Only allow valid values
- **Database Enforces** = Can't insert invalid data
- **Data Integrity** = Guaranteed valid data

---

## 🎓 Topic 10: Migration Best Practices

### Migration Process

**Step 1: Plan**
- Review schema documentation
- Identify all tables needed
- Plan relationships and indexes

**Step 2: Create Migration File**
- Use sequential numbering (001, 002, etc.)
- Include all changes in one file
- Add comments explaining purpose

**Step 3: Test**
- Run on dev database first
- Verify all tables created
- Test constraints and relationships

**Step 4: Deploy**
- Run on staging database
- Verify again
- Run on production database

**Think of it like:**
- **Plan** = Blueprint review
- **Create** = Build structure
- **Test** = Quality check
- **Deploy** = Move to production

### Idempotent Migrations

**What is Idempotent?**
- Can run multiple times safely
- Won't break if already applied
- Use `IF NOT EXISTS` where possible

**Example:**
```sql
-- Idempotent: Safe to run multiple times
CREATE TABLE IF NOT EXISTS appointments (...);

-- Not idempotent: Will fail if table exists
CREATE TABLE appointments (...);
```

**Think of it like:**
- **Idempotent** = "If it doesn't exist, create it" (safe to repeat)
- **Not Idempotent** = "Create it" (fails if exists)

---

## ✅ Learning Checklist

Before moving to implementation, make sure you understand:

- [ ] ✅ What a database schema is and why we need it
- [ ] ✅ What migrations are and why we use them
- [ ] ✅ How database tables organize data
- [ ] ✅ How relationships and foreign keys connect data
- [ ] ✅ Why indexes are important for performance
- [ ] ✅ What Row Level Security is and why it's critical
- [ ] ✅ How triggers automate database operations
- [ ] ✅ What PHI is and how to protect it
- [ ] ✅ Why data classification matters
- [ ] ✅ How audit logging works
- [ ] ✅ Best practices for creating migrations

---

## 🎯 Next Steps

Once you understand all these concepts:
1. We'll create the SQL migration file
2. Define all tables with proper columns
3. Set up relationships and foreign keys
4. Create indexes for performance
5. Enable Row Level Security
6. Add triggers for automation
7. Test the migration

**Remember:** Learn first, then build! 🚀

---

## 🔗 Key Concepts Summary

**Database Schema:**
- Blueprint of your database
- Defines tables, columns, relationships
- Enforces data rules

**Migrations:**
- Version-controlled schema changes
- Reproducible and rollback-able
- Safe way to evolve database

**Relationships:**
- Connect related data between tables
- Foreign keys enforce integrity
- Cascade or restrict on delete

**Indexes:**
- Make queries fast
- Create on foreign keys and frequently queried columns
- Don't over-index (slows writes)

**Row Level Security:**
- Database-level access control
- Defense in depth
- Required for healthcare compliance

**Compliance:**
- PHI must be protected
- Data classification required
- Audit logging mandatory
- Encryption at rest (automatic)

---

**Last Updated:** January 20, 2026  
**Related Task:** Task 1 - Database Schema Migration  
**Status:** 📚 Ready to Learn
