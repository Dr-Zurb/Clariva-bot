# Learning Topics - Project Setup & Configuration
## Task #1: Project Setup & Configuration

---

## 📚 What Are We Learning Today?

Today we're setting up the foundation of our backend project. Think of it like building a house - before you build walls, you need a solid foundation!

We'll learn about:
1. TypeScript Configuration
2. Environment Variables
3. Git Ignore Files
4. Package.json Scripts
5. npm and Dependencies

---

## 🎓 Topic 1: TypeScript Configuration (tsconfig.json)

### What is TypeScript Again?

TypeScript is JavaScript with **types** added. It helps catch errors before you run your code.

**Think of it like:**
- JavaScript = A language that speaks very casually
- TypeScript = Same language, but with grammar rules

### What is tsconfig.json?

`tsconfig.json` is a **configuration file** that tells TypeScript:
- How to compile your code
- What rules to follow
- Where to put output files
- Which files to include/exclude

### Real-World Analogy

Imagine you're a translator:
- `tsconfig.json` = Translation instructions
- "Translate TypeScript → JavaScript"
- "Put translated files in the `dist/` folder"
- "Only translate files in `src/` folder"

### The Configuration Explained (Line by Line)

```json
{
  "compilerOptions": {
    // This means: "Output JavaScript that works in modern browsers/Node.js"
    "target": "ES2020",
    
    // This means: "Use CommonJS module system" (how Node.js imports files)
    "module": "commonjs",
    
    // This means: "You can use modern JavaScript features"
    "lib": ["ES2020"],
    
    // This means: "Put compiled JavaScript files HERE"
    "outDir": "./dist",
    
    // This means: "Your TypeScript source files are HERE"
    "rootDir": "./src",
    
    // This means: "Check types strictly - catch ALL errors!"
    "strict": true,
    
    // This means: "Allow importing from regular JavaScript files"
    "esModuleInterop": true,
    
    // This means: "Don't check types in node_modules (too slow)"
    "skipLibCheck": true,
    
    // This means: "File names must match exactly (name.ts vs Name.ts)"
    "forceConsistentCasingInFileNames": true,
    
    // This means: "Allow importing JSON files"
    "resolveJsonModule": true
  },
  
  // This means: "Compile ALL files in src/ folder"
  "include": ["src/**/*"],
  
  // This means: "DON'T compile these folders"
  "exclude": ["node_modules", "dist"]
}
```

### Visual Understanding

```
Before Compilation:
src/index.ts (TypeScript) 
    ↓
[TypeScript Compiler reads tsconfig.json]
    ↓
After Compilation:
dist/index.js (JavaScript)
```

### Why Each Setting Matters

| Setting | Why Important | What Happens If Wrong |
|---------|---------------|----------------------|
| `target: "ES2020"` | Modern JavaScript features | Older browsers might not work |
| `outDir: "./dist"` | Knows where to put output | Files might go to wrong place |
| `rootDir: "./src"` | Knows where source files are | Can't find your files |
| `strict: true` | Catches errors early | Bugs might slip through |

---

## 🎓 Topic 2: Environment Variables (.env)

### What Are Environment Variables?

**Environment variables** are like **secret notes** your program reads.

Think of them like:
- Your house address (public info)
- Your house key (private/secret)

### Why Do We Need Them?

**Problem:** We have secrets (API keys, passwords) that can't go in code!

```typescript
// ❌ BAD - Never do this!
const apiKey = "sk-secret-key-12345"; // Everyone can see it!

// ✅ GOOD - Use environment variables
const apiKey = process.env.OPENAI_API_KEY; // Secret!
```

### The Two Files You'll Have

#### 1. `.env.example` (Template - Safe to Share)

```env
# This is a TEMPLATE - safe to commit to Git
SUPABASE_URL=your_supabase_url_here
OPENAI_API_KEY=your_openai_key_here
PORT=3000
```

**Purpose:** Shows others what variables they need (but not the actual values).

#### 2. `.env` (Real Secrets - NEVER Commit!)

```env
# This is YOUR REAL secrets - never commit!
SUPABASE_URL=https://abc123.supabase.co
OPENAI_API_KEY=sk-real-secret-key-abc123
PORT=3000
```

**Purpose:** Your actual working values (only on your computer).

### How to Use Environment Variables in Code

```typescript
// Load environment variables
import dotenv from 'dotenv';
dotenv.config(); // This reads your .env file

// Now you can use them
const port = process.env.PORT; // Gets "3000" from .env
const apiKey = process.env.OPENAI_API_KEY; // Gets your real key
```

### Real Example for Our Project

```typescript
// src/config/database.ts
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// If variables are missing, show error
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials!');
}
```

### The .env Workflow

```
Step 1: Copy template
cp .env.example .env

Step 2: Fill in real values
Open .env file and add your real API keys

Step 3: Code reads it
Your TypeScript code uses process.env.VARIABLE_NAME

Step 4: Never commit .env
Git ignores it (via .gitignore)
```

---

## 🎓 Topic 3: Git Ignore (.gitignore)

### What is .gitignore?

`.gitignore` is a file that tells Git: **"Don't track these files!"**

**Think of it like:**
- **Hospital Privacy Rules** - Don't share certain information
- **Personal Files** - Keep private things private

### Why We Need It

**Problem:** Some files should NEVER be in Git:
- `node_modules/` - Too big, can be regenerated
- `.env` - Contains secrets!
- `dist/` - Generated files (can be rebuilt)

### What Goes in .gitignore

```gitignore
# Dependencies (can be reinstalled)
node_modules/

# Environment variables (SECRETS!)
.env
.env.local

# Compiled output (generated automatically)
dist/
build/

# Logs
*.log

# IDE settings (personal preferences)
.vscode/
.idea/

# OS files
.DS_Store
Thumbs.db
```

### Real-World Analogy

**Without .gitignore:**
- Accidentally share your house key (`.env`)
- Share huge folders (`node_modules/`)
- Share temporary files (`dist/`)

**With .gitignore:**
- Secrets stay private
- Only important code is tracked
- Clean repository

---

## 🎓 Topic 4: Package.json Scripts

### What is package.json?

`package.json` is like a **recipe card** for your project:
- Project name and description
- Dependencies (what libraries you need)
- Scripts (commands you can run)

### What Are Scripts?

**Scripts** are shortcuts for common commands.

**Think of it like:**
- **Shortcuts** - Instead of typing long commands
- **Quick Actions** - One word does multiple things

### Common Scripts We Use

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit"
  }
}
```

### What Each Script Does

| Script | Command | What It Does |
|--------|---------|--------------|
| `npm run dev` | `nodemon --exec ts-node src/index.ts` | Start development server (auto-restarts on changes) |
| `npm run build` | `tsc` | Compile TypeScript to JavaScript |
| `npm run start` | `node dist/index.js` | Run compiled JavaScript (production) |
| `npm run type-check` | `tsc --noEmit` | Check types without compiling |

### Real-World Analogy

**Without scripts:**
```bash
# Have to type this every time!
nodemon --exec ts-node src/index.ts
```

**With scripts:**
```bash
# Just type this!
npm run dev
```

**Think of it like:**
- **Phone Shortcuts** - Press one button, calls multiple people
- **Scripts** - Type one command, does multiple things

---

## 🎓 Topic 5: npm and Dependencies

### What is npm?

**npm** (Node Package Manager) is like an **app store** for code libraries.

**Think of it like:**
- **App Store** - Download apps for your phone
- **npm** - Download code libraries for your project

### What Are Dependencies?

**Dependencies** are **code libraries** your project needs to work.

**Think of it like:**
- **Tools** - You need a hammer to build a house
- **Dependencies** - You need libraries to build an app

### Two Types of Dependencies

#### 1. `dependencies` (Production - Needed to Run)

```json
{
  "dependencies": {
    "express": "^5.2.1",        // Web server framework
    "@supabase/supabase-js": "^2.88.0",  // Database client
    "openai": "^6.14.0"         // AI service
  }
}
```

**These are needed when your app runs.**

#### 2. `devDependencies` (Development - Only for Coding)

```json
{
  "devDependencies": {
    "typescript": "^5.9.3",     // TypeScript compiler
    "nodemon": "^3.1.11",       // Auto-restart server
    "@types/express": "^5.0.6"  // TypeScript types for Express
  }
}
```

**These are only needed while developing (not in production).**

### How to Install Dependencies

```bash
# Install all dependencies (from package.json)
npm install

# Install a specific package
npm install express

# Install as dev dependency
npm install --save-dev typescript
```

### Real-World Analogy

**Dependencies = Tools:**
- **express** = Hammer (build web server)
- **@supabase/supabase-js** = Screwdriver (connect to database)
- **openai** = Drill (AI functionality)

**Without dependencies:**
- Can't build anything (no tools)

**With dependencies:**
- Have all tools needed (can build everything)

---

## ✅ Learning Checklist

Before moving to implementation, make sure you understand:

- [ ] ✅ What TypeScript is and why we use it
- [ ] ✅ What tsconfig.json does and how it works
- [ ] ✅ Why environment variables are important
- [ ] ✅ How to use .env files safely
- [ ] ✅ What .gitignore does and why we need it
- [ ] ✅ What package.json scripts are and how to use them
- [ ] ✅ What npm is and how dependencies work
- [ ] ✅ Difference between dependencies and devDependencies

---

## 🎯 Next Steps

Once you understand all these concepts:
1. We'll create tsconfig.json
2. Set up .env.example file
3. Create .gitignore
4. Update package.json with scripts
5. Install all dependencies

**Remember:** Learn first, then build! 🚀

---

**Last Updated:** January 9, 2025  
**Related Task:** Task 1 - Project Setup & Configuration  
**Status:** 📚 Ready to Learn
