# 🤖 Telegram Bot - Complete Command Guide

## ✅ **NEW COMMANDS ADDED**

Your Telegram bot now has Claude Code-style commands! Here's everything you can do:

---

## 📁 **Repository Commands**

### `/setrepo owner/repo`
Set which GitHub repository the agent should work on.

**Example:**
```
/setrepo johnadekola676-page/IDK
```

**Response:**
```
✅ Repository set to: johnadekola676-page/IDK

All future tasks will use this repository.
```

### `/repos`
List configured repositories and see what's currently active.

**Shows:**
- Currently configured GITHUB_OWNER
- Currently configured GITHUB_REPO
- Instructions on how to change

---

## ⚡ **Quick Action Commands**

### `/commit <message>`
Quickly commit all changes with a message.

**Example:**
```
/commit Add new feature for user authentication
```

**What it does:**
1. Stages all changes
2. Creates commit with your message
3. Pushes to GitHub
4. Reports back success/failure

### `/test`
Run all tests in the project.

**Example:**
```
/test
```

**What it does:**
1. Finds and runs test suite
2. Reports test results
3. Shows any failures

### `/build`
Build the project.

**Example:**
```
/build
```

**What it does:**
1. Runs build command
2. Reports build status
3. Shows any build errors

---

## 🔧 **Main Commands** (Already Existed)

### `/task <description>`
Execute an autonomous development task.

**Example:**
```
/task Create a REST API endpoint for user registration
```

**What it does:**
- **Plan** - Analyzes task and creates implementation plan
- **Execute** - Writes the code
- **Test** - Runs tests
- **Deploy** - Commits and pushes to GitHub
- **Monitor** - Watches CI/CD pipelines

### `/review_pr <number>`
Review a pull request.

**Example:**
```
/review_pr 42
```

**Checks for:**
- Security vulnerabilities
- Hardcoded credentials
- Code quality issues
- Compliance with CLAUDE.md

### `/status`
Check GitHub Actions workflow status.

---

## 📋 **How to Use**

### **Step 1: Start the bot**
```
/start
```

### **Step 2: Set your repository**
```
/setrepo your-username/your-repo
```

### **Step 3: Start working!**

**Option A - Full Autonomous Task:**
```
/task Create a login page with React
```

**Option B - Quick Actions:**
```
/commit Fixed bug in authentication
/test
/build
```

---

## 🔄 **Workflow Example**

Here's a complete workflow using the new commands:

```bash
# 1. Set your repository
/setrepo johnadekola676-page/IDK

# 2. Work on a feature
/task Add a new API endpoint for user profiles

# 3. Agent does its thing (plan, code, test)
# ... wait for completion ...

# 4. Quick commit
/commit Add user profile API endpoint

# 5. Run tests
/test

# 6. Build
/build

# 7. Check deployment status
/status
```

---

## 🎯 **Key Features**

✅ **Repository Switching** - Work on multiple repos easily
✅ **Quick Actions** - Fast commits, tests, builds
✅ **Full Autonomy** - Complete 5-phase execution
✅ **Real-time Updates** - See progress as it happens
✅ **Error Handling** - Self-healing with retries

---

## 🆚 **Web vs Telegram vs CLI**

All three interfaces now have the same features:

| Feature | Web UI | Telegram | CLI |
|---------|--------|----------|-----|
| Repository Selection | ✅ Menu | ✅ /setrepo | ✅ Config |
| Run Tasks | ✅ Chat | ✅ /task | ✅ submit |
| Quick Commit | ✅ Menu | ✅ /commit | ✅ commit |
| Run Tests | ✅ Menu | ✅ /test | ✅ test |
| Build | ✅ Menu | ✅ /build | ✅ build |
| Status | ✅ Status bar | ✅ /status | ✅ status |

---

## 🐛 **Troubleshooting**

### **Bot not responding?**
1. Check Railway logs for errors
2. Verify `TELEGRAM_BOT_TOKEN` is set
3. Send `/start` to wake it up

### **Commands not working?**
1. Make sure you're authorized (check `AUTHORIZED_USER_ID`)
2. Try `/help` to see all commands
3. Check Railway logs for errors

### **"Repository not set" error?**
Run `/setrepo owner/repo` first before running tasks.

---

## 📱 **Mobile-Friendly**

All commands work great on mobile Telegram:
- Short command names
- Clear feedback
- Real-time updates
- Easy to type

Perfect for coding on-the-go! 🚀

---

## 🔜 **Coming Soon**

Potential future commands:
- `/pr <title>` - Create a PR
- `/deploy` - Trigger deployment
- `/rollback` - Rollback last deploy
- `/logs` - View recent logs

Let us know what commands you want!
