# Getting Started — No Technical Experience Needed

This guide walks you through installing and using G-Ink Studio from scratch.
No programming knowledge required. Every step is explained in plain language.

---

## What is G-Ink Studio?

G-Ink Studio is a creative writing app that runs on your own computer.
You write your story stage by stage — characters, world, plot, script — and
an AI assistant helps fill in details whenever you want. At the end you can
export everything your artist needs: panel breakdowns, character sheets,
and image prompts.

---

## What you need (all free)

| What | Why | Download |
|------|-----|----------|
| Docker Desktop | Runs the app | https://www.docker.com/products/docker-desktop |
| The studio files | The app itself | See Step 2 below |
| An AI brain (optional) | Powers the AI buttons | See the AI Setup section |

Your computer needs at least **8 GB of RAM** and **10 GB of free disk space**.

---

## Step 1 — Install Docker Desktop

Docker is the program that runs G-Ink Studio. Think of it like a player
that runs the app — similar to how you need a PDF reader to open a PDF.

1. Go to **https://www.docker.com/products/docker-desktop**
2. Click the big download button for your system (Windows or Mac)
3. Open the downloaded file and follow the installer — click Next/Continue/Agree until it finishes
4. Restart your computer when asked
5. Open Docker Desktop from your Start Menu (Windows) or Applications (Mac)
6. Wait until you see the Docker whale icon in your taskbar/menu bar and it says **"Docker Desktop is running"**

> Docker needs to be running every time you use G-Ink Studio.

---

## Step 2 — Download the studio files

1. Go to **https://github.com/mhndayesh/G-ink-studio**
2. Click the green **Code** button near the top right
3. Click **Download ZIP**
4. Once downloaded, right-click the ZIP file and choose **Extract All** (Windows) or double-click it (Mac)
5. Move the extracted folder somewhere easy to find — like your Desktop or Documents

---

## Step 3 — Open a terminal in the studio folder

A terminal is a text window where you type simple commands to start the app.
It sounds scary but you only need to type one line.

**Windows:**
1. Open the studio folder you extracted in Step 2
2. Click on the address bar at the top of the folder window (it shows the folder path)
3. Type `cmd` and press Enter — a black window opens
4. You're ready

**Mac:**
1. Open the studio folder in Finder
2. Right-click on the folder → **New Terminal at Folder**
   *(If you don't see this: open Terminal from Applications → Utilities, then drag the folder into the Terminal window)*

---

## Step 4 — Start the studio

In the terminal window, type this exactly and press Enter:

```
docker compose up --build
```

Then wait. The first time takes **3 to 5 minutes** — it's downloading and
setting up everything automatically. You'll see a lot of text scrolling by.
That's normal.

You'll know it's ready when you see a line containing:
```
Application startup complete
```

Leave this window open — it keeps the studio running.

---

## Step 5 — Open the studio in your browser

Open any web browser (Chrome, Firefox, Edge, Safari) and go to:

**http://localhost:3000**

The G-Ink Studio home screen will appear. You're in.

> **Tip:** Bookmark this address so you can open it quickly next time.

---

## Starting the studio next time

You don't need to wait 3–5 minutes again. Future starts are fast:

1. Open Docker Desktop and wait for it to say "running"
2. Open your terminal in the studio folder (same as Step 3)
3. Type `docker compose up` and press Enter (no `--build` needed)
4. Open http://localhost:3000

To stop the studio: go back to the terminal and press **Ctrl + C**.

---

## Step 6 — Set up an AI brain (optional but recommended)

The studio works without any AI — every button shows sample placeholder output.
To get real AI responses, choose one of the two options below.

---

### Option A — OpenAI (easiest, small cost per use)

OpenAI is the company behind ChatGPT. You pay a tiny amount per AI request
(typically less than $0.01 per click). Good for occasional use.

**Get your API key:**
1. Go to **https://platform.openai.com/signup** and create a free account
2. Go to **https://platform.openai.com/api-keys**
3. Click **Create new secret key** — copy the key (it starts with `sk-`)
4. Add a small credit balance at **https://platform.openai.com/settings/billing**
   ($5 will last a long time for personal use)

**Tell the studio about your key:**
1. Open the studio folder on your computer
2. Find the file called `.env.example`
   > On Windows you may need to show hidden files: in File Explorer → View → check "Hidden items"
3. Make a copy of it and rename the copy to `.env` (remove the `.example` part)
4. Open `.env` with Notepad (Windows) or TextEdit (Mac)
5. Find these three lines and edit them:

```
MANGA_LLM_ENABLED=true
MANGA_OPENAI_API_KEY=sk-paste-your-key-here
MANGA_OPENAI_MODEL=gpt-4.1-mini
```

6. Save the file
7. Stop the studio (Ctrl + C in the terminal) and start it again with `docker compose up`

---

### Option B — LM Studio (free, runs entirely on your computer, no internet needed)

LM Studio lets you run an AI model on your own machine for free.
No account, no usage costs, completely private. Requires a decent computer
(16 GB RAM recommended for comfortable use).

**Install LM Studio:**
1. Go to **https://lmstudio.ai** and download it for your system
2. Install and open it

**Download a model:**
1. In LM Studio, click the **Search** tab (magnifying glass icon)
2. Search for `qwen3` or `llama-3`
3. Click on a model — choose one marked **"Recommended"** or that says it fits your RAM
4. Click **Download** and wait

**Start the local server:**
1. In LM Studio, click the **Developer** tab (looks like `</>`)
2. Make sure your downloaded model is selected at the top
3. Click **Start Server** — you'll see "Server running on port 1234"

**Tell the studio to use it:**
1. Open your `.env` file (create it from `.env.example` as described in Option A steps 1–4)
2. Edit these lines:

```
MANGA_LLM_ENABLED=true
MANGA_OPENAI_API_KEY=lm-studio
MANGA_OPENAI_BASE_URL=http://host.docker.internal:1234/v1
MANGA_OPENAI_MODEL=your-model-name
```

For `MANGA_OPENAI_MODEL`, use the exact model name shown in LM Studio's server tab
(example: `lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF`)

3. Save the file
4. Restart the studio with `docker compose up`

---

## How to use the studio

When you open http://localhost:3000 you'll see the **Studio Home** — a dashboard
showing all six stages of your story.

Work through them in order, top to bottom:

| Stage | What you do here |
|-------|-----------------|
| **Foundation** | Give your story a title, pick the genre, describe the world |
| **Characters** | Create your main characters, side characters, and map their relationships |
| **Plot** | Build your story arc, chapters, scene cards, and locations |
| **Write** | Write freely — the AI reads your text and suggests how it changes the story |
| **Produce** | Generate the manga script chapter by chapter, then export everything |
| **Review** | See your version history and check for story inconsistencies |

**Each stage unlocks the next** — you can't write a script before building your
characters and plot. This is intentional: it keeps your story coherent.

**The AI Fill button:** On almost every screen there's a small sparkle button.
Click it to open the AI panel, tick the fields you want help with, and click
Generate. Review what comes back, then apply it to your form.

**The Writing Desk:** This is where the magic happens. Write anything in plain
language — "Kinji discovers his father is alive" — then click Detect Consequences.
The AI reads your story so far, figures out what would change, and asks you a
series of Yes/No questions before updating anything. You are always in control.

---

## Troubleshooting

**The page at localhost:3000 won't load**
- Check that Docker Desktop is open and says "running"
- Check that your terminal is still showing the studio output (if it stopped, run `docker compose up` again)

**"docker compose" is not recognized**
- Docker Desktop is not installed or not running — go back to Step 1

**The AI buttons return weird placeholder text**
- Your `.env` file is missing or the API key/model name is wrong — re-check the AI Setup section

**LM Studio: the AI buttons time out**
- Make sure LM Studio's server is running (green light in the Developer tab)
- Make sure the model name in `.env` exactly matches what LM Studio shows

**I want to start fresh / delete my story data**
- Stop the studio (Ctrl + C)
- Delete the `storage/` folder inside the studio folder
- Run `docker compose up` again

---

## Getting help

If something isn't working, open an issue on GitHub:
**https://github.com/mhndayesh/G-ink-studio/issues**

Describe what step you're on and what you see on screen.
