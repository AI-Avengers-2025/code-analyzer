# Code-analyzer

# GitHub Repository Analyzer

An AI-powered application that analyzes public GitHub repositories and provides clear insights about the repository’s structure, purpose, and code.  
This tool is particularly useful for onboarding processes and speeding up project understanding.

---

## Features

- Paste a **public GitHub repository link** to get:
  - Repository summary (branches, collaborators, open issues, files, and folders).
  - AI-generated overview of what the repository is doing.
- Navigate to **Code Analysis** mode:
  - Explore repository files and folders.
  - View AI-generated analysis of each file:
    - File purpose
    - Programming language
    - Explanation of specific lines of code

---

## Architecture
- **Backend**: Node.js + Express (GitHub REST API proxy + file fetching + analysis endpoints)
- **Frontend**: Vanilla JS + HTML/CSS

---

## Prerequisites
- **Node.js** 18+ (recommended) and **npm**

---

## Installation & Running the Project

### 1. Clone the repository
```bash
git clone https://github.com/AI-Avengers-2025/code-analyzer.git

### 2. Start the Backend

````bash
cd backend
npm install
npm start

### 3. Start the Frontend
```bash
cd frontend
npm install
npm start
````
